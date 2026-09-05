from __future__ import annotations

import ipaddress
import os
import re
import tempfile
from collections.abc import Mapping, MutableMapping
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError

APP_ROOT = Path(__file__).resolve().parents[1]
SUPPORTED_APP_ENVIRONMENTS = frozenset({"local", "test", "staging", "production"})
DEPLOYED_APP_ENVIRONMENTS = frozenset({"staging", "production"})
DEFAULT_STORAGE_SECRET = "local-development-secret"
VALID_LOG_LEVELS = frozenset({"trace", "debug", "info", "warning", "error", "critical"})
HOSTNAME_RE = re.compile(
    r"(?=^.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(?:\.(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?))*$"
)


class ConfigurationError(RuntimeError):
    """Raised when application configuration is unsafe or invalid."""


@dataclass(frozen=True, slots=True)
class AppSettings:
    app_env: str
    database_url: str | None = field(repr=False)
    database_path: Path
    host: str
    port: int
    backend_port: int
    frontend_port: int
    document_path: Path
    import_path: Path
    export_path: Path
    vector_path: Path
    template_path: Path
    storage_dir: Path
    storage_secret: str = field(repr=False)
    worker_api_token_secret: str = field(repr=False)
    frontend_dist_dir: Path | None
    allow_anonymous_local: bool
    log_level: str
    display_name: str
    description: str
    max_upload_files: int
    max_upload_size_bytes: int
    max_concurrent_runs: int
    workflow_delay_seconds: float
    workflow_output_tag: str

    @property
    def is_deployed(self) -> bool:
        return self.app_env in DEPLOYED_APP_ENVIRONMENTS

    @property
    def persistent_paths(self) -> tuple[tuple[str, Path], ...]:
        return (
            ("APP_DOCUMENT_PATH", self.document_path),
            ("APP_IMPORT_PATH", self.import_path),
            ("APP_EXPORT_PATH", self.export_path),
            ("APP_VECTOR_PATH", self.vector_path),
            ("APP_TEMPLATE_PATH", self.template_path),
            ("APP_STORAGE_DIR", self.storage_dir),
        )

    @classmethod
    def from_env(
        cls,
        *,
        environ: Mapping[str, str] | None = None,
        storage_dir: Path | None = None,
    ) -> "AppSettings":
        if environ is None:
            load_local_env()
            values: Mapping[str, str] = os.environ
        else:
            values = environ

        app_env = _required_value(values, "APP_ENV")
        if app_env not in SUPPORTED_APP_ENVIRONMENTS:
            allowed = ", ".join(sorted(SUPPORTED_APP_ENVIRONMENTS))
            raise ConfigurationError(f"APP_ENV must be one of: {allowed}.")
        deployed = app_env in DEPLOYED_APP_ENVIRONMENTS

        database_url = _optional_value(values, "DATABASE_URL")
        if database_url is not None:
            _validate_database_url(database_url)
        if deployed and database_url is None:
            raise ConfigurationError(
                "DATABASE_URL is required when APP_ENV is staging or production."
            )

        backend_port = _port_value(values, "BACKEND_PORT", default=8029)
        frontend_port = _port_value(values, "FRONTEND_PORT", default=5191)
        host = _host_value(values, required=deployed)
        port = _listener_port(values, backend_port=backend_port, required=deployed)

        database_path = _path_value(
            values,
            "APP_DATABASE_PATH",
            "./data/itss_dashboard.db",
        )
        document_path = _persistent_path(
            values,
            "APP_DOCUMENT_PATH",
            "./data/documents",
            deployed=deployed,
        )
        import_path = _persistent_path(
            values,
            "APP_IMPORT_PATH",
            "./data/imports",
            deployed=deployed,
        )
        export_path = _persistent_path(
            values,
            "APP_EXPORT_PATH",
            "./data/exports",
            deployed=deployed,
        )
        vector_path = _persistent_path(
            values,
            "APP_VECTOR_PATH",
            "./data/vector_store",
            deployed=deployed,
        )
        template_path = _persistent_path(
            values,
            "APP_TEMPLATE_PATH",
            "./data/templates",
            deployed=deployed,
        )
        resolved_storage_dir = _persistent_path(
            values,
            "APP_STORAGE_DIR",
            "storage",
            deployed=deployed,
            override=storage_dir,
        )

        frontend_dist_dir = _optional_path(values, "FRONTEND_DIST_DIR")
        if deployed and frontend_dist_dir is not None:
            raw_frontend_path = Path(_required_value(values, "FRONTEND_DIST_DIR"))
            if not raw_frontend_path.expanduser().is_absolute():
                raise ConfigurationError(
                    "FRONTEND_DIST_DIR must be absolute in staging and production."
                )

        allow_anonymous_local = _bool_value(
            values,
            "ALLOW_ANONYMOUS_LOCAL",
            default=False,
        )
        storage_secret = (
            _optional_value(values, "APP_STORAGE_SECRET") or DEFAULT_STORAGE_SECRET
        )
        worker_api_token_secret = (
            _optional_value(values, "WORKER_API_TOKEN_SECRET") or storage_secret
        )
        if deployed and allow_anonymous_local:
            raise ConfigurationError(
                "ALLOW_ANONYMOUS_LOCAL must be false in staging and production."
            )
        if deployed and storage_secret == DEFAULT_STORAGE_SECRET:
            raise ConfigurationError(
                "APP_STORAGE_SECRET is required and must not use the development default "
                "in staging or production."
            )
        if deployed and worker_api_token_secret == DEFAULT_STORAGE_SECRET:
            raise ConfigurationError(
                "The worker token secret must not use the development default in "
                "staging or production."
            )

        log_level = (_optional_value(values, "LOG_LEVEL") or "INFO").lower()
        if log_level not in VALID_LOG_LEVELS:
            allowed_levels = ", ".join(sorted(VALID_LOG_LEVELS))
            raise ConfigurationError(f"LOG_LEVEL must be one of: {allowed_levels}.")

        settings = cls(
            app_env=app_env,
            database_url=database_url,
            database_path=database_path,
            host=host,
            port=port,
            backend_port=backend_port,
            frontend_port=frontend_port,
            document_path=document_path,
            import_path=import_path,
            export_path=export_path,
            vector_path=vector_path,
            template_path=template_path,
            storage_dir=resolved_storage_dir,
            storage_secret=storage_secret,
            worker_api_token_secret=worker_api_token_secret,
            frontend_dist_dir=frontend_dist_dir,
            allow_anonymous_local=allow_anonymous_local,
            log_level=log_level,
            display_name=_optional_value(values, "APP_DISPLAY_NAME")
            or "IEEE ITSS Conference Status Dashboard",
            description=_optional_value(values, "APP_DESCRIPTION")
            or (
                "Local-first dashboard for monitoring IEEE ITSS conference portfolio "
                "readiness, issues, imports, reports, documents, and AI-assisted "
                "operations."
            ),
            max_upload_files=_positive_int_value(
                values,
                "MAX_UPLOAD_FILES",
                default=20,
            ),
            max_upload_size_bytes=_positive_int_value(
                values,
                "MAX_UPLOAD_SIZE_BYTES",
                default=52_428_800,
            ),
            max_concurrent_runs=_positive_int_value(
                values,
                "MAX_CONCURRENT_RUNS",
                default=2,
            ),
            workflow_delay_seconds=_nonnegative_float_value(
                values,
                "WORKFLOW_DELAY_SECONDS",
                default=0.0,
            ),
            workflow_output_tag=_optional_value(values, "WORKFLOW_OUTPUT_TAG")
            or "ITSS dashboard import processed",
        )

        if settings.is_deployed:
            for name, path in settings.persistent_paths:
                _ensure_writable_directory(name, path)
            raise ConfigurationError(
                f"APP_ENV={settings.app_env} startup is intentionally blocked until "
                "Prompt 4 implements DATABASE_URL engine support, dialect-neutral "
                "health checks, and Alembic migrations."
            )
        return settings


def load_local_env(
    root: Path | None = None,
    *,
    environ: MutableMapping[str, str] | None = None,
) -> None:
    """Load a repository .env without overriding process-provided values."""

    target = environ if environ is not None else os.environ
    env_path = (root or APP_ROOT) / ".env"
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key and key not in target:
            target[key] = value.strip().strip('"').strip("'")


def _required_value(values: Mapping[str, str], name: str) -> str:
    value = _optional_value(values, name)
    if value is None:
        raise ConfigurationError(f"{name} is required.")
    return value


def _optional_value(values: Mapping[str, str], name: str) -> str | None:
    raw = values.get(name)
    if raw is None:
        return None
    value = str(raw).strip()
    return value or None


def _validate_database_url(value: str) -> None:
    try:
        parsed = make_url(value)
    except (ArgumentError, ValueError):
        raise ConfigurationError("DATABASE_URL is invalid.") from None
    if not parsed.drivername or "://" not in value:
        raise ConfigurationError("DATABASE_URL is invalid.")


def _host_value(values: Mapping[str, str], *, required: bool) -> str:
    raw = _optional_value(values, "HOST")
    if raw is None:
        if required:
            raise ConfigurationError(
                "HOST is required when APP_ENV is staging or production."
            )
        return "127.0.0.1"
    if "://" in raw or "/" in raw or "\\" in raw or any(char.isspace() for char in raw):
        raise ConfigurationError("HOST must be a valid bind address without a scheme or path.")
    try:
        ipaddress.ip_address(raw)
    except ValueError:
        if re.fullmatch(r"[0-9.]+", raw) or not HOSTNAME_RE.fullmatch(raw):
            raise ConfigurationError(
                "HOST must be a valid IP address or hostname without a port."
            )
    return raw


def _listener_port(
    values: Mapping[str, str],
    *,
    backend_port: int,
    required: bool,
) -> int:
    raw = _optional_value(values, "PORT")
    if raw is None:
        if required:
            raise ConfigurationError(
                "PORT is required when APP_ENV is staging or production."
            )
        return backend_port
    return _parse_port(raw, "PORT")


def _port_value(values: Mapping[str, str], name: str, *, default: int) -> int:
    raw = _optional_value(values, name)
    if raw is None:
        return default
    return _parse_port(raw, name)


def _parse_port(raw: str, name: str) -> int:
    try:
        value = int(raw)
    except ValueError as exc:
        raise ConfigurationError(
            f"{name} must be an integer from 1 through 65535."
        ) from exc
    if not 1 <= value <= 65_535:
        raise ConfigurationError(f"{name} must be an integer from 1 through 65535.")
    return value


def _bool_value(
    values: Mapping[str, str],
    name: str,
    *,
    default: bool,
) -> bool:
    raw = _optional_value(values, name)
    if raw is None:
        return default
    normalized = raw.lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ConfigurationError(f"{name} must be true or false.")


def _positive_int_value(
    values: Mapping[str, str],
    name: str,
    *,
    default: int,
) -> int:
    raw = _optional_value(values, name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError as exc:
        raise ConfigurationError(f"{name} must be a positive integer.") from exc
    if value <= 0:
        raise ConfigurationError(f"{name} must be a positive integer.")
    return value


def _nonnegative_float_value(
    values: Mapping[str, str],
    name: str,
    *,
    default: float,
) -> float:
    raw = _optional_value(values, name)
    if raw is None:
        return default
    try:
        value = float(raw)
    except ValueError as exc:
        raise ConfigurationError(f"{name} must be a non-negative number.") from exc
    if value < 0:
        raise ConfigurationError(f"{name} must be a non-negative number.")
    return value


def _path_value(
    values: Mapping[str, str],
    name: str,
    default: str,
    *,
    override: Path | None = None,
) -> Path:
    raw_path = override if override is not None else Path(
        _optional_value(values, name) or default
    )
    expanded = raw_path.expanduser()
    resolved = expanded if expanded.is_absolute() else APP_ROOT / expanded
    return resolved.resolve(strict=False)


def _optional_path(values: Mapping[str, str], name: str) -> Path | None:
    raw = _optional_value(values, name)
    if raw is None:
        return None
    return _path_value(values, name, raw)


def _persistent_path(
    values: Mapping[str, str],
    name: str,
    default: str,
    *,
    deployed: bool,
    override: Path | None = None,
) -> Path:
    raw = _optional_value(values, name)
    explicit = override is not None or raw is not None
    raw_path = override if override is not None else Path(raw or default)
    if deployed:
        if not explicit:
            raise ConfigurationError(
                f"{name} is required when APP_ENV is staging or production."
            )
        if not raw_path.expanduser().is_absolute():
            raise ConfigurationError(
                f"{name} must be an absolute path in staging and production."
            )
    path = _path_value(values, name, default, override=override)
    if deployed and path.is_relative_to(APP_ROOT.resolve()):
        raise ConfigurationError(
            f"{name} must not be inside the immutable application release directory."
        )
    return path


def _ensure_writable_directory(name: str, path: Path) -> None:
    probe_path: Path | None = None
    try:
        path.mkdir(parents=True, exist_ok=True)
        if not path.is_dir():
            raise OSError("configured path is not a directory")
        descriptor, probe_name = tempfile.mkstemp(prefix=".itss-write-test-", dir=path)
        os.close(descriptor)
        probe_path = Path(probe_name)
    except OSError as exc:
        raise ConfigurationError(
            f"{name} must be an available writable directory."
        ) from exc
    finally:
        if probe_path is not None:
            try:
                probe_path.unlink(missing_ok=True)
            except OSError:
                pass
