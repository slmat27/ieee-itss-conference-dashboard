from __future__ import annotations

import argparse
import json
import os
import shutil
import zipfile
from collections.abc import Sequence
from dataclasses import asdict
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen

from .storage import RunLog, RunRecord, StoredFile
from .workflow import run as run_workflow


class WorkerStore:
    def __init__(self, record: RunRecord, *, progress_url: str, token: str) -> None:
        self.record = record
        self.progress_url = progress_url
        self.token = token

    def mark_running(self, status_message: str = "Running workflow.") -> None:
        self.record.state = "running"
        self.record.status_message = status_message
        self._write_record()

    def mark_completed(self) -> None:
        self.record.state = "completed"
        self.record.status_message = "Completed."
        self.record.error = None
        self.record.output_files = _stored_files_in_dir(
            self.record.workspace_dir,
            self.record.workspace_dir / "outputs",
        )
        self.record.logs = _logs_in_dir(
            self.record.workspace_dir,
            self.record.workspace_dir / "logs",
        )
        self._write_record()

    def mark_failed(self, error: str) -> None:
        self.record.state = "failed"
        self.record.status_message = "Failed."
        self.record.error = error
        self.record.logs = _logs_in_dir(
            self.record.workspace_dir,
            self.record.workspace_dir / "logs",
        )
        self._write_record()

    def worker_result(self) -> dict[str, Any]:
        return {
            "run_id": self.record.run_id,
            "state": self.record.state,
            "status_message": self.record.status_message,
            "error": self.record.error,
            "output_files": [asdict(item) for item in self.record.output_files],
            "logs": [asdict(item) for item in self.record.logs],
        }

    def worker_progress(self) -> dict[str, Any]:
        payload = self.worker_result()
        payload["logs"] = [
            {
                **asdict(item),
                "content": _read_text(self.record.workspace_dir / item.relative_path),
            }
            for item in self.record.logs
        ]
        return payload

    def sync_progress(self) -> None:
        if not self.progress_url:
            return
        try:
            _upload_json(self.progress_url, self.worker_progress(), token=self.token)
        except OSError:
            pass

    def _write_record(self) -> None:
        (self.record.workspace_dir / "run.json").write_text(
            json.dumps(self.record.to_dict(), indent=2) + "\n",
            encoding="utf-8",
        )
        self.sync_progress()


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run one isolated POC worker.")
    parser.add_argument("--bundle-url", required=True)
    parser.add_argument("--result-url", required=True)
    parser.add_argument("--progress-url", required=True)
    parser.add_argument("--workspace-dir", required=True)
    args = parser.parse_args(list(argv) if argv is not None else None)

    workspace_dir = Path(args.workspace_dir)
    workspace_dir.mkdir(parents=True, exist_ok=True)
    _clear_directory_contents(workspace_dir)
    bundle_path = workspace_dir / "worker-input-bundle.zip"
    result_path = workspace_dir / "worker-result.zip"

    token = os.environ.get("WORKER_API_TOKEN", "")
    _download(args.bundle_url, bundle_path, token=token)
    with zipfile.ZipFile(bundle_path) as archive:
        _extract_safe(archive, workspace_dir)

    record = _record_from_manifest(workspace_dir)
    store = WorkerStore(record, progress_url=args.progress_url, token=token)
    log_path = record.workspace_dir / "logs" / "workflow.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        store.mark_running()
        with log_path.open("w", encoding="utf-8") as log:
            log.write(f"Starting workflow run {record.run_id}\n")
            log.flush()
            run_workflow(
                record.workspace_dir / "inputs",
                record.workspace_dir / "outputs",
                delay_seconds=record.workflow_delay_seconds,
                output_tag=record.output_tag,
            )
            log.write("Workflow completed successfully.\n")
        store.mark_completed()
    except Exception as exc:
        with log_path.open("a", encoding="utf-8") as log:
            log.write(f"Workflow failed: {exc}\n")
        store.mark_failed(str(exc))
    _write_result_archive(store, result_path)
    _upload(args.result_url, result_path, token=token)
    return 0 if store.record.state == "completed" else 1


def _record_from_manifest(workspace_dir: Path) -> RunRecord:
    manifest = json.loads(
        (workspace_dir / "worker-manifest.json").read_text(encoding="utf-8")
    )
    return RunRecord(
        run_id=str(manifest["run_id"]),
        title=str(manifest["title"]),
        owner_key=str(manifest["owner_key"]),
        owner_email=str(manifest["owner_email"]),
        state="queued",
        created_at=str(manifest.get("created_at") or ""),
        updated_at=str(manifest.get("updated_at") or ""),
        workspace_dir=workspace_dir,
        input_files=[StoredFile(**item) for item in manifest.get("input_files", [])],
        workflow_delay_seconds=float(manifest.get("workflow_delay_seconds", 0)),
        output_tag=str(manifest.get("output_tag") or "<Processed>"),
    )


def _write_result_archive(store: WorkerStore, result_path: Path) -> None:
    worker_result_path = store.record.workspace_dir / "worker-result.json"
    worker_result_path.write_text(
        json.dumps(store.worker_result(), indent=2) + "\n",
        encoding="utf-8",
    )
    with zipfile.ZipFile(result_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for relative_root in ("outputs", "logs"):
            root = store.record.workspace_dir / relative_root
            if not root.exists():
                continue
            for path in sorted(root.rglob("*")):
                if path.is_file():
                    archive.write(path, path.relative_to(store.record.workspace_dir))
        archive.write(worker_result_path, "worker-result.json")


def _download(url: str, destination: Path, *, token: str) -> None:
    request = Request(url, headers={"Authorization": f"Bearer {token}"})
    with urlopen(request, timeout=60) as response:
        destination.write_bytes(response.read())


def _upload(url: str, source: Path, *, token: str) -> None:
    request = Request(
        url,
        data=source.read_bytes(),
        method="PUT",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/zip",
        },
    )
    with urlopen(request, timeout=60) as response:
        response.read()


def _upload_json(url: str, payload: dict[str, Any], *, token: str) -> None:
    request = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        method="PUT",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    with urlopen(request, timeout=15) as response:
        response.read()


def _extract_safe(archive: zipfile.ZipFile, destination_root: Path) -> None:
    resolved_root = destination_root.resolve()
    for member in archive.infolist():
        relative = Path(member.filename)
        if member.is_dir() or relative.is_absolute() or ".." in relative.parts:
            continue
        destination = (destination_root / relative).resolve()
        if not destination.is_relative_to(resolved_root):
            continue
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(archive.read(member))


def _clear_directory_contents(path: Path) -> None:
    for child in path.iterdir():
        if child.is_dir() and not child.is_symlink():
            shutil.rmtree(child)
        else:
            child.unlink()


def _stored_files_in_dir(workspace_dir: Path, directory: Path) -> list[StoredFile]:
    files: list[StoredFile] = []
    if not directory.exists():
        return files
    for path in sorted(directory.iterdir()):
        if path.is_file():
            files.append(
                StoredFile(
                    original_name=path.name,
                    stored_name=path.name,
                    relative_path=path.relative_to(workspace_dir).as_posix(),
                    size_bytes=path.stat().st_size,
                )
            )
    return files


def _logs_in_dir(workspace_dir: Path, directory: Path) -> list[RunLog]:
    logs: list[RunLog] = []
    if not directory.exists():
        return logs
    for path in sorted(directory.iterdir()):
        if path.is_file():
            logs.append(
                RunLog(
                    name=path.name,
                    relative_path=path.relative_to(workspace_dir).as_posix(),
                    size_bytes=path.stat().st_size,
                )
            )
    return logs


def _read_text(path: Path) -> str:
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8", errors="replace")


if __name__ == "__main__":
    raise SystemExit(main())
