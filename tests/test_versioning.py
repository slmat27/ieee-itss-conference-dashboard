from __future__ import annotations

import json
import re
import tomllib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SEMVER_PATTERN = re.compile(
    r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)"
    r"(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?"
    r"(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$"
)


def _backend_version() -> str:
    project = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    return str(project["project"]["version"])


def _frontend_version() -> str:
    package = json.loads(
        (ROOT / "frontend" / "package.json").read_text(encoding="utf-8")
    )
    return str(package["version"])


def _frontend_lock_version() -> str:
    package_lock = json.loads(
        (ROOT / "frontend" / "package-lock.json").read_text(encoding="utf-8")
    )
    return str(package_lock["packages"][""]["version"])


def test_application_version_is_semantic() -> None:
    assert SEMVER_PATTERN.fullmatch(_backend_version())


def test_frontend_version_matches_authoritative_backend_version() -> None:
    assert _frontend_version() == _backend_version()


def test_frontend_lock_version_matches_authoritative_backend_version() -> None:
    assert _frontend_lock_version() == _backend_version()