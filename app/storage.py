from __future__ import annotations

import json
import re
import shutil
import threading
import time
import uuid
import zipfile
from contextlib import suppress
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, BinaryIO

from .identity import UserIdentity, storage_user_key

SAFE_FILENAME_RE = re.compile(r"^[A-Za-z0-9._ -]{1,160}$")
RUN_ID_RE = re.compile(r"^[a-f0-9]{32}$")
DEFAULT_MAX_UPLOAD_FILES = 20
DEFAULT_MAX_UPLOAD_SIZE_BYTES = 52_428_800
ACTIVE_STATES = {"queued", "running"}
TERMINAL_STATES = {"completed", "failed"}


@dataclass(frozen=True, slots=True)
class UploadItem:
    filename: str
    stream: BinaryIO


@dataclass(slots=True)
class StoredFile:
    original_name: str
    stored_name: str
    relative_path: str
    size_bytes: int


@dataclass(slots=True)
class RunLog:
    name: str
    relative_path: str
    size_bytes: int = 0


@dataclass(slots=True)
class RunRecord:
    run_id: str
    title: str
    owner_key: str
    owner_email: str
    state: str
    created_at: str
    updated_at: str
    workspace_dir: Path
    input_files: list[StoredFile] = field(default_factory=list)
    output_files: list[StoredFile] = field(default_factory=list)
    logs: list[RunLog] = field(default_factory=list)
    workflow_delay_seconds: float = 5.0
    output_tag: str = "<Processed>"
    status_message: str | None = None
    started_at: str | None = None
    completed_at: str | None = None
    error: str | None = None
    backend_job_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["workspace_dir"] = str(self.workspace_dir)
        return payload

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "RunRecord":
        return cls(
            run_id=str(payload["run_id"]),
            title=str(payload["title"]),
            owner_key=str(payload["owner_key"]),
            owner_email=str(payload["owner_email"]),
            state=str(payload["state"]),
            created_at=str(payload["created_at"]),
            updated_at=str(payload["updated_at"]),
            workspace_dir=Path(str(payload["workspace_dir"])),
            input_files=[
                StoredFile(**item) for item in payload.get("input_files", [])
            ],
            output_files=[
                StoredFile(**item) for item in payload.get("output_files", [])
            ],
            logs=[RunLog(**item) for item in payload.get("logs", [])],
            workflow_delay_seconds=float(payload.get("workflow_delay_seconds", 5.0)),
            output_tag=str(payload.get("output_tag", "<Processed>")),
            status_message=(
                str(payload["status_message"])
                if payload.get("status_message")
                else None
            ),
            started_at=str(payload["started_at"]) if payload.get("started_at") else None,
            completed_at=(
                str(payload["completed_at"]) if payload.get("completed_at") else None
            ),
            error=str(payload["error"]) if payload.get("error") else None,
            backend_job_id=(
                str(payload["backend_job_id"])
                if payload.get("backend_job_id")
                else None
            ),
        )


class RunStore:
    def __init__(
        self,
        root: Path,
        *,
        max_upload_files: int = DEFAULT_MAX_UPLOAD_FILES,
        max_upload_size_bytes: int = DEFAULT_MAX_UPLOAD_SIZE_BYTES,
    ) -> None:
        self.root = root
        self.max_upload_files = max_upload_files
        self.max_upload_size_bytes = max_upload_size_bytes
        self._lock = threading.RLock()

    def create_run(
        self,
        *,
        owner: UserIdentity,
        uploads: list[UploadItem],
        title: str | None,
        workflow_delay_seconds: float,
        output_tag: str,
    ) -> RunRecord:
        # CREATOR_AGENT_CONTRACT: Create runs only through authenticated owner
        # context. Never accept owner_key or user_id from the client.
        if not uploads:
            raise ValueError("At least one input file is required.")
        if len(uploads) > self.max_upload_files:
            raise ValueError(f"At most {self.max_upload_files} files are allowed.")

        owner_key = storage_user_key(owner)
        run_id = uuid.uuid4().hex
        workspace_dir = self._run_dir(owner_key, run_id)
        self._ensure_workspace(workspace_dir)

        try:
            input_files = self._store_uploads(
                workspace_dir=workspace_dir,
                destination_dir=workspace_dir / "inputs",
                uploads=uploads,
            )
        except Exception:
            shutil.rmtree(workspace_dir, ignore_errors=True)
            raise

        now = _now()
        record = RunRecord(
            run_id=run_id,
            title=(title or "POC workflow run").strip() or "POC workflow run",
            owner_key=owner_key,
            owner_email=owner.email,
            state="queued",
            created_at=now,
            updated_at=now,
            workspace_dir=workspace_dir,
            input_files=input_files,
            workflow_delay_seconds=workflow_delay_seconds,
            output_tag=output_tag,
            status_message="Queued.",
        )
        self._write_record(record)
        return record

    def list_runs(self, *, owner: UserIdentity) -> list[RunRecord]:
        owner_key = storage_user_key(owner)
        runs_root = self.root / "users" / owner_key / "runs"
        if not runs_root.exists():
            return []
        records = []
        for metadata_path in sorted(runs_root.glob("*/run.json")):
            records.append(RunRecord.from_dict(_read_json_with_retry(metadata_path)))
        records.sort(key=lambda item: item.created_at, reverse=True)
        return records

    def get_run(self, *, owner: UserIdentity, run_id: str) -> RunRecord | None:
        return self.get_by_owner_key(owner_key=storage_user_key(owner), run_id=run_id)

    def get_by_owner_key(self, *, owner_key: str, run_id: str) -> RunRecord | None:
        if not RUN_ID_RE.fullmatch(run_id):
            return None
        metadata_path = self._metadata_path(owner_key, run_id)
        if not metadata_path.exists():
            return None
        return RunRecord.from_dict(_read_json_with_retry(metadata_path))

    def delete_run(self, *, owner: UserIdentity, run_id: str) -> bool:
        owner_key = storage_user_key(owner)
        if not RUN_ID_RE.fullmatch(run_id):
            return False
        run_dir = self._run_dir(owner_key, run_id)
        if not (run_dir / "run.json").exists():
            return False
        shutil.rmtree(run_dir)
        return True

    def cleanup_expired_runs(
        self,
        *,
        retention: timedelta,
        now: datetime | None = None,
    ) -> int:
        cutoff = (now or datetime.now(UTC)) - retention
        deleted = 0
        runs_root = self.root / "users"
        if not runs_root.exists():
            return deleted
        for metadata_path in sorted(runs_root.glob("*/runs/*/run.json")):
            record = RunRecord.from_dict(_read_json_with_retry(metadata_path))
            if record.state not in TERMINAL_STATES or not record.completed_at:
                continue
            completed_at = _parse_datetime(record.completed_at)
            if completed_at is None or completed_at > cutoff:
                continue
            shutil.rmtree(record.workspace_dir, ignore_errors=True)
            deleted += 1
        return deleted

    def mark_running(self, run_id: str, *, owner_key: str) -> RunRecord:
        record = self._require_record(owner_key, run_id)
        record.state = "running"
        record.started_at = record.started_at or _now()
        record.updated_at = _now()
        record.status_message = "Running workflow."
        self._write_record(record)
        return record

    def set_backend_job_id(
        self,
        run_id: str,
        *,
        owner_key: str,
        backend_job_id: str,
    ) -> RunRecord:
        record = self._require_record(owner_key, run_id)
        record.backend_job_id = backend_job_id
        record.updated_at = _now()
        self._write_record(record)
        return record

    def mark_completed(self, run_id: str, *, owner_key: str) -> RunRecord:
        record = self._require_record(owner_key, run_id)
        record.state = "completed"
        record.output_files = self._stored_files_in_dir(
            record.workspace_dir,
            record.workspace_dir / "outputs",
        )
        record.logs = self._logs_in_dir(record.workspace_dir, record.workspace_dir / "logs")
        record.completed_at = _now()
        record.updated_at = record.completed_at
        record.error = None
        record.status_message = "Completed."
        self._write_record(record)
        return record

    def mark_failed(self, run_id: str, *, owner_key: str, error: str) -> RunRecord:
        record = self._require_record(owner_key, run_id)
        record.state = "failed"
        record.logs = self._logs_in_dir(record.workspace_dir, record.workspace_dir / "logs")
        record.error = error
        record.completed_at = _now()
        record.updated_at = record.completed_at
        record.status_message = "Failed."
        self._write_record(record)
        return record

    def build_worker_bundle(self, record: RunRecord) -> Path:
        manifest_path = record.workspace_dir / "worker-manifest.json"
        bundle_path = record.workspace_dir / "worker-input-bundle.zip"
        manifest_path.write_text(
            json.dumps(_worker_manifest(record), indent=2) + "\n",
            encoding="utf-8",
        )
        with zipfile.ZipFile(bundle_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.write(manifest_path, "worker-manifest.json")
            for path in sorted((record.workspace_dir / "inputs").rglob("*")):
                if path.is_file():
                    archive.write(path, path.relative_to(record.workspace_dir).as_posix())
        return bundle_path

    def apply_worker_progress(
        self,
        *,
        owner_key: str,
        run_id: str,
        payload: dict[str, Any],
    ) -> RunRecord:
        record = self._require_record(owner_key, run_id)
        state = str(payload.get("state") or record.state)
        if state in ACTIVE_STATES:
            record.state = state
        status_message = payload.get("status_message")
        if isinstance(status_message, str) and status_message.strip():
            record.status_message = status_message.strip()
        error = payload.get("error")
        if error:
            record.error = str(error)
        for item in payload.get("logs", []):
            if not isinstance(item, dict):
                continue
            relative_path = str(item.get("relative_path") or "")
            log_path = _safe_workspace_path(record.workspace_dir, relative_path)
            if log_path is None:
                continue
            log_path.parent.mkdir(parents=True, exist_ok=True)
            log_path.write_text(str(item.get("content") or ""), encoding="utf-8")
        record.logs = self._logs_in_dir(record.workspace_dir, record.workspace_dir / "logs")
        record.updated_at = _now()
        self._write_record(record)
        return record

    def apply_worker_result_archive(
        self,
        *,
        owner_key: str,
        run_id: str,
        archive_bytes: bytes,
    ) -> RunRecord:
        record = self._require_record(owner_key, run_id)
        result_payload: dict[str, Any] | None = None
        result_archive = record.workspace_dir / "worker-result.zip"
        result_archive.write_bytes(archive_bytes)
        with zipfile.ZipFile(result_archive) as archive:
            for member in archive.infolist():
                relative = Path(member.filename)
                if member.is_dir() or relative.is_absolute() or ".." in relative.parts:
                    continue
                relative_posix = relative.as_posix()
                if relative_posix == "worker-result.json":
                    result_payload = json.loads(archive.read(member).decode("utf-8"))
                    continue
                if not (
                    relative_posix.startswith("outputs/")
                    or relative_posix.startswith("logs/")
                ):
                    continue
                destination = _safe_workspace_path(record.workspace_dir, relative_posix)
                if destination is None:
                    continue
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(archive.read(member))

        if result_payload is None:
            return self.mark_failed(
                run_id,
                owner_key=owner_key,
                error="Worker result archive did not include worker-result.json.",
            )

        state = str(result_payload.get("state") or "failed")
        if state == "completed":
            record = self.mark_completed(run_id, owner_key=owner_key)
        else:
            record = self.mark_failed(
                run_id,
                owner_key=owner_key,
                error=str(result_payload.get("error") or "Worker failed."),
            )
        status_message = result_payload.get("status_message")
        if isinstance(status_message, str) and status_message.strip():
            record.status_message = status_message.strip()
        record.logs = self._logs_in_dir(record.workspace_dir, record.workspace_dir / "logs")
        record.output_files = self._stored_files_in_dir(
            record.workspace_dir,
            record.workspace_dir / "outputs",
        )
        self._write_record(record)
        return record

    def reconcile_interrupted_runs(self) -> list[RunRecord]:
        reconciled: list[RunRecord] = []
        runs_root = self.root / "users"
        if not runs_root.exists():
            return reconciled

        for metadata_path in sorted(runs_root.glob("*/runs/*/run.json")):
            record = RunRecord.from_dict(_read_json_with_retry(metadata_path))
            if record.state not in ACTIVE_STATES:
                continue
            record.state = "failed"
            record.logs = self._logs_in_dir(
                record.workspace_dir,
                record.workspace_dir / "logs",
            )
            record.error = "Run was interrupted by application restart."
            record.status_message = "Failed after application restart."
            record.completed_at = _now()
            record.updated_at = record.completed_at
            self._write_record(record)
            reconciled.append(record)
        return reconciled

    def output_path(
        self,
        *,
        owner: UserIdentity,
        run_id: str,
        filename: str,
    ) -> Path | None:
        # CREATOR_AGENT_CONTRACT: Downloads are resolved through owner-scoped
        # metadata and safe filenames. Never construct paths from raw client
        # values alone.
        record = self.get_run(owner=owner, run_id=run_id)
        if record is None or record.state != "completed":
            return None
        requested_name = safe_filename(filename)
        for output_file in record.output_files:
            if output_file.stored_name != requested_name:
                continue
            output_path = _safe_workspace_path(record.workspace_dir, output_file.relative_path)
            if output_path is not None and output_path.exists():
                return output_path
        return None

    def log_text(self, *, owner: UserIdentity, run_id: str) -> str | None:
        record = self.get_run(owner=owner, run_id=run_id)
        if record is None:
            return None
        chunks = []
        logs = record.logs
        if record.state in ACTIVE_STATES or not logs:
            logs = self._logs_in_dir(record.workspace_dir, record.workspace_dir / "logs")
        for log in logs:
            log_path = _safe_workspace_path(record.workspace_dir, log.relative_path)
            if log_path is not None and log_path.exists():
                chunks.append(log_path.read_text(encoding="utf-8", errors="replace"))
        return "\n".join(chunks)

    def _require_record(self, owner_key: str, run_id: str) -> RunRecord:
        record = self.get_by_owner_key(owner_key=owner_key, run_id=run_id)
        if record is None:
            raise RuntimeError(f"Unknown run: {run_id}")
        return record

    def _run_dir(self, owner_key: str, run_id: str) -> Path:
        return self.root / "users" / owner_key / "runs" / run_id

    def _metadata_path(self, owner_key: str, run_id: str) -> Path:
        return self._run_dir(owner_key, run_id) / "run.json"

    def _write_record(self, record: RunRecord) -> None:
        with self._lock:
            metadata_path = self._metadata_path(record.owner_key, record.run_id)
            metadata_path.parent.mkdir(parents=True, exist_ok=True)
            # CREATOR_AGENT_CONTRACT: Keep metadata inside the owner-scoped run
            # directory. Generated POCs may replace this with atomic persistence
            # if they need stronger crash-safety guarantees.
            tmp_path = metadata_path.with_suffix(".json.tmp")
            tmp_path.write_text(
                json.dumps(record.to_dict(), indent=2) + "\n",
                encoding="utf-8",
            )
            try:
                tmp_path.replace(metadata_path)
            except PermissionError:
                # Windows development sandboxes can deny replace() even when
                # direct file writes work. Keep the atomic path above for normal
                # filesystems and fall back so local POCs remain runnable.
                metadata_path.write_text(
                    tmp_path.read_text(encoding="utf-8"),
                    encoding="utf-8",
                )
                with suppress(OSError):
                    tmp_path.unlink()

    def _ensure_workspace(self, workspace_dir: Path) -> None:
        for path in (
            workspace_dir,
            workspace_dir / "inputs",
            workspace_dir / "outputs",
            workspace_dir / "logs",
            workspace_dir / ".runtime",
        ):
            path.mkdir(parents=True, exist_ok=True)

    def _store_uploads(
        self,
        *,
        workspace_dir: Path,
        destination_dir: Path,
        uploads: list[UploadItem],
    ) -> list[StoredFile]:
        stored: list[StoredFile] = []
        used_names: set[str] = set()
        remaining_bytes = self.max_upload_size_bytes
        for upload in uploads:
            filename = safe_filename(upload.filename)
            stored_name = _deduplicate_filename(filename, used_names)
            destination = destination_dir / stored_name
            if hasattr(upload.stream, "seek"):
                upload.stream.seek(0)
            size_bytes, remaining_bytes = _copy_stream(
                upload.stream,
                destination,
                remaining_bytes=remaining_bytes,
                max_upload_size_bytes=self.max_upload_size_bytes,
            )
            stored.append(
                StoredFile(
                    original_name=filename,
                    stored_name=stored_name,
                    relative_path=destination.relative_to(workspace_dir).as_posix(),
                    size_bytes=size_bytes,
                )
            )
        return stored

    def _stored_files_in_dir(self, workspace_dir: Path, directory: Path) -> list[StoredFile]:
        files: list[StoredFile] = []
        if not directory.exists():
            return files
        for path in sorted(directory.iterdir()):
            if not path.is_file():
                continue
            files.append(
                StoredFile(
                    original_name=path.name,
                    stored_name=path.name,
                    relative_path=path.relative_to(workspace_dir).as_posix(),
                    size_bytes=path.stat().st_size,
                )
            )
        return files

    def _logs_in_dir(self, workspace_dir: Path, directory: Path) -> list[RunLog]:
        logs: list[RunLog] = []
        if not directory.exists():
            return logs
        for path in sorted(directory.iterdir()):
            if not path.is_file():
                continue
            logs.append(
                RunLog(
                    name=path.name,
                    relative_path=path.relative_to(workspace_dir).as_posix(),
                    size_bytes=path.stat().st_size,
                )
            )
        return logs


def safe_filename(filename: str) -> str:
    # CREATOR_AGENT_CONTRACT: Keep filenames simple. Upload names must not be
    # paths, absolute paths, or names with shell-sensitive characters.
    candidate = Path(filename or "").name.strip()
    if not candidate or candidate != filename.strip():
        raise ValueError("Invalid upload filename.")
    if not SAFE_FILENAME_RE.fullmatch(candidate):
        raise ValueError("Invalid upload filename.")
    return candidate


def _copy_stream(
    source: BinaryIO,
    destination: Path,
    *,
    remaining_bytes: int,
    max_upload_size_bytes: int,
) -> tuple[int, int]:
    bytes_written = 0
    with destination.open("wb") as handle:
        while True:
            chunk = source.read(1024 * 1024)
            if not chunk:
                break
            if isinstance(chunk, str):
                chunk = chunk.encode("utf-8")
            if len(chunk) > remaining_bytes:
                raise ValueError(
                    "Upload limit exceeded: total upload size must be at most "
                    f"{max_upload_size_bytes} bytes."
                )
            handle.write(chunk)
            bytes_written += len(chunk)
            remaining_bytes -= len(chunk)
    return bytes_written, remaining_bytes


def _deduplicate_filename(filename: str, used_names: set[str]) -> str:
    if filename not in used_names:
        used_names.add(filename)
        return filename
    stem = Path(filename).stem
    suffix = Path(filename).suffix
    index = 2
    while True:
        candidate = f"{stem}-{index}{suffix}"
        if candidate not in used_names:
            used_names.add(candidate)
            return candidate
        index += 1


def _safe_workspace_path(workspace_dir: Path, value: str) -> Path | None:
    relative = Path(value)
    if relative.is_absolute() or ".." in relative.parts:
        return None
    destination = (workspace_dir / relative).resolve()
    if not destination.is_relative_to(workspace_dir.resolve()):
        return None
    return destination


def _worker_manifest(record: RunRecord) -> dict[str, Any]:
    return {
        "run_id": record.run_id,
        "title": record.title,
        "owner_key": record.owner_key,
        "owner_email": record.owner_email,
        "created_at": record.created_at,
        "updated_at": record.updated_at,
        "workflow_delay_seconds": record.workflow_delay_seconds,
        "output_tag": record.output_tag,
        "input_files": [asdict(item) for item in record.input_files],
    }


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _parse_datetime(value: str) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed


def _read_json_with_retry(path: Path) -> dict[str, Any]:
    last_error: Exception | None = None
    for _ in range(5):
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (PermissionError, json.JSONDecodeError) as exc:
            last_error = exc
            time.sleep(0.01)
    if last_error is not None:
        raise last_error
    raise RuntimeError(f"Unable to read JSON file: {path}")
