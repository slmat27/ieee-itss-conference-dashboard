from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True, slots=True)
class AppSettings:
    display_name: str
    description: str
    storage_dir: Path
    allow_anonymous_local: bool
    max_upload_files: int
    max_upload_size_bytes: int
    max_concurrent_runs: int
    workflow_delay_seconds: float
    workflow_output_tag: str

    @classmethod
    def from_env(cls, *, storage_dir: Path | None = None) -> "AppSettings":
        return cls(
            display_name=os.environ.get("APP_DISPLAY_NAME", "IEEE ITSS Conference Status Dashboard"),
            description=os.environ.get(
                "APP_DESCRIPTION",
                "Local-first dashboard for monitoring IEEE ITSS conference portfolio readiness, issues, imports, reports, documents, and AI-assisted operations.",
            ),
            storage_dir=storage_dir
            or Path(os.environ.get("APP_STORAGE_DIR", "storage")),
            allow_anonymous_local=_env_bool("ALLOW_ANONYMOUS_LOCAL"),
            max_upload_files=_env_int("MAX_UPLOAD_FILES", default=20),
            max_upload_size_bytes=_env_int(
                "MAX_UPLOAD_SIZE_BYTES",
                default=52_428_800,
            ),
            max_concurrent_runs=_env_int("MAX_CONCURRENT_RUNS", default=2),
            workflow_delay_seconds=_env_float(
                "WORKFLOW_DELAY_SECONDS",
                default=0.0,
            ),
            workflow_output_tag=os.environ.get(
                "WORKFLOW_OUTPUT_TAG",
                "ITSS dashboard import processed",
            ).strip()
            or "ITSS dashboard import processed",
        )


def _env_bool(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() == "true"


def _env_int(name: str, *, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value > 0 else default


def _env_float(name: str, *, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        return default
    try:
        value = float(raw)
    except ValueError:
        return default
    return value if value >= 0 else default
