from __future__ import annotations

import json
import re
import subprocess
import sys
import tomllib
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[2]
ALLOWED_ENV_FILE = ".env.example"
DATABASE_SUFFIXES = (
    ".db",
    ".db3",
    ".sqlite",
    ".sqlite3",
    ".sql",
    ".sql.gz",
    ".dump",
    ".dump.gz",
)
FORBIDDEN_DIRECTORY_NAMES = {
    ".local",
    "__pycache__",
    "data",
    "node_modules",
    "storage",
}
REQUIRED_FILES = (
    "alembic.ini",
    "migrations/env.py",
    "migrations/README.md",
    "migrations/script.py.mako",
    "LICENSE",
    "NOTICE.md",
)


def tracked_paths() -> list[str]:
    result = subprocess.run(
        ["git", "ls-files", "-z"],
        cwd=ROOT,
        check=True,
        capture_output=True,
    )
    return [path for path in result.stdout.decode("utf-8").split("\0") if path]


def forbidden_path_reason(path_text: str) -> str | None:
    path = PurePosixPath(path_text)
    parts_lower = tuple(part.lower() for part in path.parts)
    name_lower = path.name.lower()

    if name_lower.startswith(".env") and name_lower != ALLOWED_ENV_FILE:
        return "environment file"
    if any(part in FORBIDDEN_DIRECTORY_NAMES for part in parts_lower):
        return "generated or private directory"
    if parts_lower[:2] == ("frontend", "dist"):
        return "frontend build output"
    if name_lower.endswith(DATABASE_SUFFIXES):
        return "database or database dump"
    if "migration-report" in name_lower or "migration-reports" in parts_lower:
        return "generated migration report"

    marker = bytes((105, 97, 118)).decode("ascii")
    if marker in name_lower:
        return "legacy organization asset or filename"

    if len(path.parts) == 1:
        if path.suffix.lower() == ".py":
            return "obsolete root-level Python script"
        if re.fullmatch(r"(?:run|setup)(?:[-_].*)?\.(?:bat|ps1)", name_lower):
            return "obsolete root-level launcher"
    return None


def legacy_content_matches(path_text: str) -> list[int]:
    path = ROOT / Path(path_text)
    try:
        content = path.read_bytes()
    except OSError as exc:
        raise RuntimeError(f"could not read tracked file {path_text}: {exc}") from exc
    if b"\0" in content:
        return []

    marker = bytes((73, 65, 86)).decode("ascii")
    patterns = (
        re.compile(rf"(?i)(?<![A-Za-z0-9]){marker}(?![A-Za-z0-9])"),
        re.compile(rf"(?i){marker}(?:group|[_-])"),
    )
    text = content.decode("utf-8", errors="ignore")
    return [
        line_number
        for line_number, line in enumerate(text.splitlines(), start=1)
        if any(pattern.search(line) for pattern in patterns)
    ]


def version_errors() -> list[str]:
    errors: list[str] = []
    project = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    package = json.loads(
        (ROOT / "frontend" / "package.json").read_text(encoding="utf-8")
    )
    package_lock = json.loads(
        (ROOT / "frontend" / "package-lock.json").read_text(encoding="utf-8")
    )
    backend_version = str(project["project"]["version"])
    frontend_version = str(package["version"])
    lock_version = str(package_lock["packages"][""]["version"])

    if frontend_version != backend_version:
        errors.append("frontend/package.json version does not match pyproject.toml")
    if lock_version != backend_version:
        errors.append(
            "frontend/package-lock.json version does not match pyproject.toml"
        )

    changelog = (ROOT / "CHANGELOG.md").read_text(encoding="utf-8")
    if f"## [{backend_version}]" not in changelog:
        errors.append(f"CHANGELOG.md does not contain version {backend_version}")
    return errors


def required_file_errors(tracked: set[str]) -> list[str]:
    errors = [
        f"required file is missing or untracked: {path}"
        for path in REQUIRED_FILES
        if path not in tracked
    ]
    migration_versions = [
        path
        for path in tracked
        if path.startswith("migrations/versions/")
        and path.endswith(".py")
        and not path.endswith("/__init__.py")
    ]
    if not migration_versions:
        errors.append("no tracked Alembic revision exists under migrations/versions")
    return errors


def main() -> int:
    paths = tracked_paths()
    tracked = set(paths)
    errors: list[str] = []

    for path in paths:
        reason = forbidden_path_reason(path)
        if reason is not None:
            errors.append(f"{path}: {reason}")
        for line_number in legacy_content_matches(path):
            errors.append(f"{path}:{line_number}: legacy organization reference")

    errors.extend(version_errors())
    errors.extend(required_file_errors(tracked))

    if errors:
        print("Repository hygiene check failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print(
        "Repository hygiene check passed: tracked artifacts, versions, migration "
        "files, licensing, and legacy-branding rules are compliant."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
