from __future__ import annotations

import asyncio
import math
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import (
    FastAPI,
    File,
    Form,
    Header,
    HTTPException,
    Request,
    UploadFile,
    WebSocket,
)
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.websockets import WebSocketDisconnect

from .config import AppSettings
from .dashboard import init_dashboard, router as dashboard_router
from .events import RunEventBus, heartbeat_event, run_event
from .identity import UserIdentity, current_user, storage_user_key
from .llm import load_llm_gateway_config
from .manager import RunManager, build_worker_backend, retention_cleanup_config_from_env
from .metrics import Metrics
from .models import (
    ConfigResponse,
    CreateRunResponse,
    CurrentUserResponse,
    RunDetail,
    RunLogPayload,
    RunsListResponse,
    RunSummary,
    StoredFilePayload,
)
from .storage import RunRecord, RunStore, StoredFile, UploadItem
from .worker_api import verify_worker_token


def create_app(*, storage_dir: Path | None = None) -> FastAPI:
    settings = AppSettings.from_env(storage_dir=storage_dir)
    metrics = Metrics()
    event_bus = RunEventBus()
    store = RunStore(
        settings.storage_dir,
        max_upload_files=settings.max_upload_files,
        max_upload_size_bytes=settings.max_upload_size_bytes,
    )
    manager = RunManager(
        store=store,
        metrics=metrics,
        event_bus=event_bus,
        worker_backend=build_worker_backend(store),
        retention_cleanup=retention_cleanup_config_from_env(),
        max_concurrent_runs=settings.max_concurrent_runs,
    )

    @asynccontextmanager
    async def lifespan(_api: FastAPI):
        init_dashboard()
        yield
        manager.shutdown(wait=False)

    api = FastAPI(title=f"{settings.display_name} API", lifespan=lifespan)
    api.include_router(dashboard_router)
    api.state.settings = settings
    api.state.metrics = metrics
    api.state.manager = manager
    api.state.event_bus = event_bus

    @api.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @api.get("/metrics")
    async def metrics_endpoint() -> PlainTextResponse:
        return PlainTextResponse(metrics.prometheus_text(), media_type="text/plain")

    @api.get("/api/config", response_model=ConfigResponse)
    async def app_config() -> ConfigResponse:
        llm_config = load_llm_gateway_config()
        return ConfigResponse(
            display_name=settings.display_name,
            description=settings.description,
            max_upload_files=settings.max_upload_files,
            max_upload_size_bytes=settings.max_upload_size_bytes,
            allowed_model_aliases=list(llm_config.allowed_model_aliases),
            default_model_alias=llm_config.default_model_alias,
            workflow_delay_seconds=settings.workflow_delay_seconds,
            workflow_output_tag=settings.workflow_output_tag,
            retention_cleanup_enabled=manager.retention_cleanup.enabled,
            retention_days=manager.retention_cleanup.retention.total_seconds() / 86400,
        )

    @api.get("/api/me", response_model=CurrentUserResponse)
    async def me(request: Request) -> CurrentUserResponse:
        user = _require_user(request)
        return CurrentUserResponse(
            user_id=user.user_id,
            email=user.email,
            display_name=user.display_name,
            groups=list(user.groups),
        )

    @api.get("/api/runs", response_model=RunsListResponse)
    async def list_runs(request: Request) -> RunsListResponse:
        user = _require_user(request)
        records = manager.store.list_runs(owner=user)
        return RunsListResponse(
            items=[_run_summary(record) for record in records],
            summary={
                "total": len(records),
                "queued": sum(1 for item in records if item.state == "queued"),
                "completed": sum(1 for item in records if item.state == "completed"),
                "running": sum(1 for item in records if item.state == "running"),
                "failed": sum(1 for item in records if item.state == "failed"),
            },
        )

    @api.get("/api/usage")
    async def usage_summary(request: Request) -> dict[str, int | float]:
        user = _require_user(request)
        records = manager.store.list_runs(owner=user)
        return {
            "runs": len(records),
            "completed": sum(1 for item in records if item.state == "completed"),
            "tokens": 0,
            "cost": 0.0,
        }

    @api.websocket("/api/notifications/ws")
    async def notification_stream(websocket: WebSocket) -> None:
        try:
            user = current_user(websocket)
        except PermissionError:
            await websocket.close(code=1008)
            return

        await websocket.accept()
        subscription = event_bus.subscribe(storage_user_key(user))
        try:
            while True:
                try:
                    event = await asyncio.wait_for(
                        subscription.next_event(),
                        timeout=30,
                    )
                except TimeoutError:
                    event = heartbeat_event()
                await websocket.send_json(event.to_dict())
        except WebSocketDisconnect:
            pass
        finally:
            subscription.close()

    @api.post("/api/runs", response_model=CreateRunResponse)
    async def create_run(
        request: Request,
        files: list[UploadFile] = File(...),
        title: str | None = Form(default=None),
        workflow_delay_seconds: str | None = Form(default=None),
        output_tag: str | None = Form(default=None),
    ) -> JSONResponse:
        user = _require_user(request)
        try:
            record = manager.create_run(
                owner=user,
                uploads=[
                    UploadItem(filename=file.filename or "", stream=file.file)
                    for file in files
                ],
                title=title,
                workflow_delay_seconds=_normalize_workflow_delay_seconds(
                    workflow_delay_seconds,
                    default=settings.workflow_delay_seconds,
                ),
                output_tag=_normalize_output_tag(
                    output_tag,
                    default=settings.workflow_output_tag or "<Processed>",
                ),
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        finally:
            for file in files:
                await file.close()

        return JSONResponse(
            {
                "run_id": record.run_id,
                "state": record.state,
                "status_url": f"/api/runs/{record.run_id}",
            },
            status_code=202,
        )

    @api.get("/api/runs/{run_id}", response_model=RunDetail)
    async def get_run(request: Request, run_id: str) -> RunDetail:
        user = _require_user(request)
        # CREATOR_AGENT_CONTRACT: Always resolve run data through owner-scoped
        # storage. Never look up a run by id alone.
        record = manager.store.get_run(owner=user, run_id=run_id)
        if record is None:
            raise HTTPException(status_code=404, detail="Unknown run.")
        return _run_detail(record)

    @api.delete("/api/runs/{run_id}")
    async def delete_run(request: Request, run_id: str) -> Response:
        user = _require_user(request)
        result = manager.delete_run(owner=user, run_id=run_id)
        if result == "active":
            raise HTTPException(
                status_code=409,
                detail="Active runs cannot be deleted.",
            )
        if result == "missing":
            raise HTTPException(status_code=404, detail="Unknown run.")
        return Response(status_code=204)

    @api.get("/api/runs/{run_id}/download/{filename}")
    async def download_output(
        request: Request,
        run_id: str,
        filename: str,
    ) -> FileResponse:
        user = _require_user(request)
        try:
            output_path = manager.store.output_path(
                owner=user,
                run_id=run_id,
                filename=filename,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        if output_path is None:
            raise HTTPException(status_code=404, detail="Output is not available.")
        return FileResponse(output_path, filename=output_path.name)

    @api.get("/api/runs/{run_id}/logs")
    async def run_logs(request: Request, run_id: str) -> PlainTextResponse:
        user = _require_user(request)
        text = manager.store.log_text(owner=user, run_id=run_id)
        if text is None:
            raise HTTPException(status_code=404, detail="Unknown run.")
        return PlainTextResponse(text)

    @api.get("/internal/worker/{run_id}/bundle", include_in_schema=False)
    async def worker_bundle(
        run_id: str,
        authorization: str | None = Header(default=None),
    ) -> FileResponse:
        owner_key = _worker_owner_key(authorization, run_id)
        record = manager.store.get_by_owner_key(owner_key=owner_key, run_id=run_id)
        if record is None:
            raise HTTPException(status_code=404, detail="Unknown run.")
        bundle_path = manager.store.build_worker_bundle(record)
        return FileResponse(
            bundle_path,
            media_type="application/zip",
            filename="worker-input-bundle.zip",
        )

    @api.put("/internal/worker/{run_id}/progress", include_in_schema=False)
    async def worker_progress(
        request: Request,
        run_id: str,
        authorization: str | None = Header(default=None),
    ) -> dict[str, str]:
        owner_key = _worker_owner_key(authorization, run_id)
        try:
            payload = await request.json()
            if not isinstance(payload, dict):
                raise RuntimeError("Worker progress payload must be an object.")
            record = manager.store.apply_worker_progress(
                owner_key=owner_key,
                run_id=run_id,
                payload=payload,
            )
        except RuntimeError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        event_bus.publish(owner_key, run_event(record, "running"))
        return {"status": "ok"}

    @api.put("/internal/worker/{run_id}/result", include_in_schema=False)
    async def worker_result(
        request: Request,
        run_id: str,
        authorization: str | None = Header(default=None),
    ) -> dict[str, str]:
        owner_key = _worker_owner_key(authorization, run_id)
        try:
            record = manager.store.apply_worker_result_archive(
                owner_key=owner_key,
                run_id=run_id,
                archive_bytes=await request.body(),
            )
        except RuntimeError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        event_type = "completed" if record.state == "completed" else "failed"
        event_bus.publish(owner_key, run_event(record, event_type))
        return {"status": "ok"}

    frontend_dist_dir = _frontend_dist_dir()
    if frontend_dist_dir and (frontend_dist_dir / "assets").exists():
        api.mount(
            "/assets",
            StaticFiles(directory=frontend_dist_dir / "assets"),
            name="frontend-assets",
        )

    @api.get("/{full_path:path}", include_in_schema=False)
    async def frontend_app(full_path: str) -> FileResponse:
        if full_path == "api" or full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Unknown API route.")
        if frontend_dist_dir is None:
            raise HTTPException(
                status_code=404,
                detail="Frontend bundle is not available. Run the React dev server.",
            )

        frontend_root = frontend_dist_dir.resolve()
        requested_path = (frontend_dist_dir / full_path).resolve()
        if (
            full_path
            and requested_path.is_file()
            and requested_path.is_relative_to(frontend_root)
        ):
            return FileResponse(requested_path)
        return FileResponse(frontend_dist_dir / "index.html")

    return api


def _frontend_dist_dir() -> Path | None:
    env_value = os.environ.get("FRONTEND_DIST_DIR")
    candidates: list[Path] = []
    if env_value:
        candidates.append(Path(env_value))
    candidates.extend(
        [
            Path("/app/static"),
            Path.cwd() / "frontend" / "dist",
            Path(__file__).resolve().parents[1] / "frontend" / "dist",
        ]
    )
    for candidate in candidates:
        if (candidate / "index.html").exists():
            return candidate
    return None


app = create_app()


def _require_user(request: Request) -> UserIdentity:
    try:
        return current_user(request)
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


def _worker_owner_key(authorization: str | None, run_id: str) -> str:
    prefix = "Bearer "
    if not authorization or not authorization.startswith(prefix):
        raise HTTPException(status_code=401, detail="Missing worker token.")
    try:
        payload = verify_worker_token(authorization[len(prefix) :].strip(), run_id=run_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    return str(payload["owner_key"])


def _normalize_output_tag(value: str | None, *, default: str) -> str:
    tag = (value or default).strip()
    if not tag:
        raise ValueError("Output tag must not be empty.")
    if len(tag) > 120:
        raise ValueError("Output tag must be at most 120 characters.")
    if "\x00" in tag or "\r" in tag or "\n" in tag:
        raise ValueError("Output tag must be a single line.")
    return tag


def _normalize_workflow_delay_seconds(
    value: str | None,
    *,
    default: float,
) -> float:
    raw = str(default) if value is None or not value.strip() else value.strip()
    try:
        delay_seconds = float(raw)
    except ValueError as exc:
        raise ValueError("Workflow delay must be a number of seconds.") from exc
    if not math.isfinite(delay_seconds):
        raise ValueError("Workflow delay must be finite.")
    if delay_seconds < 0 or delay_seconds > 300:
        raise ValueError("Workflow delay must be between 0 and 300 seconds.")
    return delay_seconds


def _run_summary(record: RunRecord) -> RunSummary:
    return RunSummary(
        run_id=record.run_id,
        title=record.title,
        state=record.state,
        created_at=record.created_at,
        updated_at=record.updated_at,
        started_at=record.started_at,
        completed_at=record.completed_at,
        status_message=record.status_message,
        workflow_delay_seconds=record.workflow_delay_seconds,
        input_files=[_stored_file_payload(item) for item in record.input_files],
        output_files=[_stored_file_payload(item) for item in record.output_files],
        error=record.error,
    )


def _run_detail(record: RunRecord) -> RunDetail:
    summary = _run_summary(record)
    return RunDetail(
        **summary.model_dump(),
        logs=[
            RunLogPayload(
                name=log.name,
                relative_path=log.relative_path,
                size_bytes=log.size_bytes,
            )
            for log in record.logs
        ],
        download_urls={
            item.stored_name: f"/api/runs/{record.run_id}/download/{item.stored_name}"
            for item in record.output_files
        },
    )


def _stored_file_payload(item: StoredFile) -> StoredFilePayload:
    return StoredFilePayload(
        original_name=item.original_name,
        stored_name=item.stored_name,
        relative_path=item.relative_path,
        size_bytes=item.size_bytes,
    )
