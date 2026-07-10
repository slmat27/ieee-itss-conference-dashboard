from __future__ import annotations

import os
import threading
import time
import traceback
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass
from datetime import timedelta

from .events import RunEventBus, run_deleted_event, run_event
from .identity import UserIdentity, storage_user_key
from .kubernetes import KubernetesWorkerBackend, LaunchedWorkerJob
from .metrics import Metrics
from .storage import ACTIVE_STATES, RunRecord, RunStore, UploadItem
from .workflow import run as run_workflow

DEFAULT_RETENTION_DAYS = 7
DEFAULT_RETENTION_CLEANUP_INTERVAL_SECONDS = 3600.0
FALSE_VALUES = {"0", "false", "no", "off"}


@dataclass(frozen=True, slots=True)
class RetentionCleanupConfig:
    enabled: bool = True
    retention: timedelta = timedelta(days=DEFAULT_RETENTION_DAYS)
    interval_seconds: float = DEFAULT_RETENTION_CLEANUP_INTERVAL_SECONDS


class RunManager:
    def __init__(
        self,
        *,
        store: RunStore,
        metrics: Metrics,
        event_bus: RunEventBus,
        worker_backend: KubernetesWorkerBackend | None = None,
        retention_cleanup: RetentionCleanupConfig | None = None,
        max_concurrent_runs: int = 2,
    ) -> None:
        self.store = store
        self.metrics = metrics
        self.event_bus = event_bus
        self.worker_backend = worker_backend
        self.retention_cleanup = retention_cleanup or RetentionCleanupConfig()
        self._executor = ThreadPoolExecutor(
            max_workers=max(1, max_concurrent_runs),
            thread_name_prefix="poc-run",
        )
        self._futures: dict[str, Future[None]] = {}
        self._launched_jobs: dict[str, LaunchedWorkerJob] = {}
        self._lock = threading.RLock()
        self.store.reconcile_interrupted_runs()
        if self.retention_cleanup.enabled:
            self.run_retention_cleanup()
            self._start_retention_cleanup_loop()

    def create_run(
        self,
        *,
        owner: UserIdentity,
        uploads: list[UploadItem],
        title: str | None,
        workflow_delay_seconds: float,
        output_tag: str,
    ) -> RunRecord:
        uploaded_bytes = _uploaded_bytes(uploads)
        record = self.store.create_run(
            owner=owner,
            uploads=uploads,
            title=title,
            workflow_delay_seconds=workflow_delay_seconds,
            output_tag=output_tag,
        )
        self.metrics.record_run_submitted(uploaded_bytes=uploaded_bytes)
        self.event_bus.publish(record.owner_key, run_event(record, "queued"))
        if self.worker_backend is None:
            self._submit(record)
        else:
            self._submit_isolated(record)
        return record

    def delete_run(self, *, owner: UserIdentity, run_id: str) -> str:
        record = self.store.get_run(owner=owner, run_id=run_id)
        if record is None:
            return "missing"
        if record.state in ACTIVE_STATES:
            launched = self._launched_jobs.get(run_id)
            if launched is None or self.worker_backend is None:
                return "active"
            self.worker_backend.cancel(launched)
        if not self.store.delete_run(owner=owner, run_id=run_id):
            return "missing"
        self.event_bus.publish(storage_user_key(owner), run_deleted_event(record))
        return "deleted"

    def shutdown(self, *, wait: bool = False) -> None:
        self._executor.shutdown(wait=wait, cancel_futures=False)

    def _submit(self, record: RunRecord) -> None:
        # CREATOR_AGENT_CONTRACT: The request thread only persists input files
        # and queues stable run identifiers. Background workers must reload
        # owner-scoped state from storage instead of keeping UploadFile objects.
        future = self._executor.submit(
            self._execute_run,
            record.owner_key,
            record.run_id,
        )
        with self._lock:
            self._futures[record.run_id] = future
        future.add_done_callback(lambda _future: self._forget_future(record.run_id))

    def _submit_isolated(self, record: RunRecord) -> None:
        future = self._executor.submit(
            self._execute_isolated_run,
            record.owner_key,
            record.run_id,
        )
        with self._lock:
            self._futures[record.run_id] = future
        future.add_done_callback(lambda _future: self._forget_future(record.run_id))

    def _forget_future(self, run_id: str) -> None:
        with self._lock:
            self._futures.pop(run_id, None)

    def _execute_run(self, owner_key: str, run_id: str) -> None:
        live = self.store.mark_running(run_id, owner_key=owner_key)
        self.event_bus.publish(owner_key, run_event(live, "running"))
        log_path = live.workspace_dir / "logs" / "workflow.log"
        try:
            with log_path.open("w", encoding="utf-8") as log:
                log.write(f"Starting workflow run {live.run_id}\n")
                log.flush()
                run_workflow(
                    live.workspace_dir / "inputs",
                    live.workspace_dir / "outputs",
                    delay_seconds=live.workflow_delay_seconds,
                    output_tag=live.output_tag,
                )
                log.write("Workflow completed successfully.\n")
            completed = self.store.mark_completed(live.run_id, owner_key=owner_key)
            self.metrics.record_run_completed()
            self.event_bus.publish(owner_key, run_event(completed, "completed"))
        except Exception as exc:
            with log_path.open("a", encoding="utf-8") as log:
                log.write(f"Workflow failed: {exc}\n")
                log.write(traceback.format_exc())
            failed = self.store.mark_failed(
                live.run_id,
                owner_key=owner_key,
                error=str(exc),
            )
            self.metrics.record_run_failed()
            self.event_bus.publish(owner_key, run_event(failed, "failed"))

    def _execute_isolated_run(self, owner_key: str, run_id: str) -> None:
        if self.worker_backend is None:
            return
        live = self.store.mark_running(run_id, owner_key=owner_key)
        self.event_bus.publish(owner_key, run_event(live, "running"))
        try:
            launched = self.worker_backend.launch(live)
            with self._lock:
                self._launched_jobs[run_id] = launched
            self.store.set_backend_job_id(
                run_id,
                owner_key=owner_key,
                backend_job_id=launched.name,
            )
            state, error = self.worker_backend.wait(launched)
            latest = self.store.get_by_owner_key(owner_key=owner_key, run_id=run_id)
            if latest is not None and latest.state in {"completed", "failed"}:
                self._record_terminal_metric(latest)
                self.event_bus.publish(owner_key, run_event(latest, latest.state))
                return
            if state == "completed":
                failed = self.store.mark_failed(
                    run_id,
                    owner_key=owner_key,
                    error=(
                        "Worker Kubernetes Job completed without uploading a "
                        "terminal result."
                    ),
                )
            else:
                self._record_worker_failure_diagnostics(live, launched)
                failed = self.store.mark_failed(
                    run_id,
                    owner_key=owner_key,
                    error=error or "Worker Kubernetes Job failed.",
                )
            self._record_terminal_metric(failed)
            self.event_bus.publish(owner_key, run_event(failed, "failed"))
        except Exception as exc:
            failed = self.store.mark_failed(run_id, owner_key=owner_key, error=str(exc))
            self._record_terminal_metric(failed)
            self.event_bus.publish(owner_key, run_event(failed, "failed"))
        finally:
            with self._lock:
                self._launched_jobs.pop(run_id, None)

    def _record_worker_failure_diagnostics(
        self,
        record: RunRecord,
        launched: LaunchedWorkerJob,
    ) -> None:
        if self.worker_backend is None:
            return
        try:
            diagnostics = self.worker_backend.failure_diagnostics(launched)
        except Exception as exc:
            diagnostics = f"Unable to collect Kubernetes worker diagnostics: {exc}"
        if not diagnostics.strip():
            return
        latest = self.store.get_by_owner_key(
            owner_key=record.owner_key,
            run_id=record.run_id,
        )
        if latest is None:
            return
        stderr_path = latest.workspace_dir / "logs" / "kubernetes-worker.stderr.log"
        stderr_path.parent.mkdir(parents=True, exist_ok=True)
        stderr_path.write_text(diagnostics.rstrip() + "\n", encoding="utf-8")

    def _record_terminal_metric(self, record: RunRecord) -> None:
        if record.state == "completed":
            self.metrics.record_run_completed()
        elif record.state == "failed":
            self.metrics.record_run_failed()

    def run_retention_cleanup(self) -> int:
        try:
            deleted = self.store.cleanup_expired_runs(
                retention=self.retention_cleanup.retention,
            )
        except Exception:
            self.metrics.record_retention_cleanup(deleted=0, error=True)
            raise
        self.metrics.record_retention_cleanup(deleted=deleted)
        return deleted

    def _start_retention_cleanup_loop(self) -> None:
        thread = threading.Thread(
            target=self._retention_cleanup_loop,
            name="poc-run-retention-cleanup",
            daemon=True,
        )
        thread.start()

    def _retention_cleanup_loop(self) -> None:
        while True:
            time.sleep(self.retention_cleanup.interval_seconds)
            try:
                self.run_retention_cleanup()
            except Exception:
                continue


def _uploaded_bytes(uploads: list[UploadItem]) -> int:
    total = 0
    for upload in uploads:
        stream = upload.stream
        if not hasattr(stream, "tell") or not hasattr(stream, "seek"):
            continue
        current = stream.tell()
        stream.seek(0, 2)
        total += stream.tell()
        stream.seek(current)
    return total


def build_worker_backend(store: RunStore) -> KubernetesWorkerBackend | None:
    mode = os.environ.get("POC_EXECUTION_BACKEND", "local").strip().lower()
    if mode in {"", "local"}:
        return None
    if mode != "isolated":
        raise RuntimeError("POC_EXECUTION_BACKEND must be local or isolated.")
    namespace = os.environ.get("ISOLATED_JOB_NAMESPACE", "").strip()
    worker_image = os.environ.get("ISOLATED_WORKER_IMAGE", "").strip()
    worker_api_base_url = os.environ.get("WORKER_API_BASE_URL", "").strip()
    if not namespace or not worker_image or not worker_api_base_url:
        raise RuntimeError(
            "Isolated execution requires ISOLATED_JOB_NAMESPACE, "
            "ISOLATED_WORKER_IMAGE, and WORKER_API_BASE_URL."
        )
    return KubernetesWorkerBackend(
        store=store,
        namespace=namespace,
        worker_image=worker_image,
        worker_api_base_url=worker_api_base_url,
        image_pull_policy=os.environ.get(
            "ISOLATED_WORKER_IMAGE_PULL_POLICY",
            "IfNotPresent",
        ),
        image_pull_secret_names=tuple(
            item.strip()
            for item in os.environ.get("ISOLATED_WORKER_IMAGE_PULL_SECRET_NAMES", "").split(",")
            if item.strip()
        ),
        ttl_seconds_after_finished=int(
            os.environ.get("ISOLATED_JOB_TTL_SECONDS_AFTER_FINISHED", "300")
        ),
        backoff_limit=int(os.environ.get("ISOLATED_JOB_BACKOFF_LIMIT", "0")),
    )


def retention_cleanup_config_from_env() -> RetentionCleanupConfig:
    enabled = (
        os.environ.get("RUN_RETENTION_CLEANUP_ENABLED", "true").strip().lower()
        not in FALSE_VALUES
    )
    retention_days = _float_env("RUN_RETENTION_DAYS", str(DEFAULT_RETENTION_DAYS))
    interval_seconds = _float_env(
        "RUN_RETENTION_CLEANUP_INTERVAL_SECONDS",
        str(DEFAULT_RETENTION_CLEANUP_INTERVAL_SECONDS),
    )
    if retention_days < 0:
        raise RuntimeError("RUN_RETENTION_DAYS must be greater than or equal to 0.")
    if interval_seconds <= 0:
        raise RuntimeError(
            "RUN_RETENTION_CLEANUP_INTERVAL_SECONDS must be greater than 0."
        )
    return RetentionCleanupConfig(
        enabled=enabled,
        retention=timedelta(days=retention_days),
        interval_seconds=interval_seconds,
    )


def _float_env(name: str, default: str) -> float:
    value = os.environ.get(name, default)
    try:
        return float(value)
    except ValueError as exc:
        raise RuntimeError(f"{name} must be a number.") from exc
