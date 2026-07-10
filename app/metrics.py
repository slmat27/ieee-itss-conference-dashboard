from __future__ import annotations

import threading
import time


class Metrics:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._started_at = time.time()
        self._runs_submitted = 0
        self._runs_completed = 0
        self._runs_failed = 0
        self._uploaded_bytes = 0
        self._retention_cleanup_runs = 0
        self._retention_deleted = 0
        self._retention_cleanup_errors = 0

    def record_run_submitted(self, *, uploaded_bytes: int) -> None:
        with self._lock:
            self._runs_submitted += 1
            self._uploaded_bytes += uploaded_bytes

    def record_run_completed(self) -> None:
        with self._lock:
            self._runs_completed += 1

    def record_run_failed(self) -> None:
        with self._lock:
            self._runs_failed += 1

    def record_retention_cleanup(self, *, deleted: int, error: bool = False) -> None:
        with self._lock:
            self._retention_cleanup_runs += 1
            self._retention_deleted += max(deleted, 0)
            if error:
                self._retention_cleanup_errors += 1

    def prometheus_text(self) -> str:
        with self._lock:
            lines = [
                "# HELP creator_poc_process_uptime_seconds Process uptime.",
                "# TYPE creator_poc_process_uptime_seconds gauge",
                f"creator_poc_process_uptime_seconds {time.time() - self._started_at:.3f}",
                "# HELP creator_poc_runs_total POC workflow runs by state.",
                "# TYPE creator_poc_runs_total counter",
                f'creator_poc_runs_total{{state="submitted"}} {self._runs_submitted}',
                f'creator_poc_runs_total{{state="completed"}} {self._runs_completed}',
                f'creator_poc_runs_total{{state="failed"}} {self._runs_failed}',
                "# HELP creator_poc_uploaded_bytes_total Uploaded input bytes.",
                "# TYPE creator_poc_uploaded_bytes_total counter",
                f"creator_poc_uploaded_bytes_total {self._uploaded_bytes}",
                "# HELP creator_poc_retention_cleanup_runs_total Retention cleanup runs.",
                "# TYPE creator_poc_retention_cleanup_runs_total counter",
                (
                    "creator_poc_retention_cleanup_runs_total "
                    f"{self._retention_cleanup_runs}"
                ),
                "# HELP creator_poc_retention_deleted_total Runs deleted by retention cleanup.",
                "# TYPE creator_poc_retention_deleted_total counter",
                f"creator_poc_retention_deleted_total {self._retention_deleted}",
                "# HELP creator_poc_retention_cleanup_errors_total Retention cleanup errors.",
                "# TYPE creator_poc_retention_cleanup_errors_total counter",
                (
                    "creator_poc_retention_cleanup_errors_total "
                    f"{self._retention_cleanup_errors}"
                ),
            ]
        return "\n".join(lines) + "\n"
