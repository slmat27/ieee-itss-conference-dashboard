from __future__ import annotations

from pathlib import Path
import traceback

import pytest

from app import dashboard
from app.config import APP_ROOT, AppSettings, ConfigurationError


def _deployed_env(tmp_path: Path, **overrides: str) -> dict[str, str]:
    env = {
        "APP_ENV": "production",
        "DATABASE_URL": "postgresql+psycopg://app:database-secret@db.example/itss",
        "HOST": "0.0.0.0",
        "PORT": "8080",
        "APP_DOCUMENT_PATH": str(tmp_path / "documents"),
        "APP_IMPORT_PATH": str(tmp_path / "imports"),
        "APP_EXPORT_PATH": str(tmp_path / "exports"),
        "APP_VECTOR_PATH": str(tmp_path / "vectors"),
        "APP_TEMPLATE_PATH": str(tmp_path / "templates"),
        "APP_STORAGE_DIR": str(tmp_path / "runs"),
        "APP_STORAGE_SECRET": "deployment-storage-secret",
        "WORKER_API_TOKEN_SECRET": "deployment-worker-secret",
        "ALLOW_ANONYMOUS_LOCAL": "false",
    }
    env.update(overrides)
    return env


def test_local_defaults_preserve_sqlite_and_listener_contract() -> None:
    settings = AppSettings.from_env(environ={"APP_ENV": "local"})

    assert settings.app_env == "local"
    assert settings.database_url is None
    assert settings.database_path == APP_ROOT / "data" / "itss_dashboard.db"
    assert settings.host == "127.0.0.1"
    assert settings.port == 8029
    assert settings.backend_port == 8029
    assert settings.frontend_port == 5191


def test_test_environment_uses_explicit_isolated_paths(tmp_path: Path) -> None:
    settings = AppSettings.from_env(
        environ={
            "APP_ENV": "test",
            "APP_DATABASE_PATH": str(tmp_path / "database" / "test.db"),
            "APP_DOCUMENT_PATH": str(tmp_path / "documents"),
            "APP_IMPORT_PATH": str(tmp_path / "imports"),
            "APP_EXPORT_PATH": str(tmp_path / "exports"),
            "APP_VECTOR_PATH": str(tmp_path / "vectors"),
            "APP_TEMPLATE_PATH": str(tmp_path / "templates"),
            "APP_STORAGE_DIR": str(tmp_path / "runs"),
        }
    )

    assert settings.app_env == "test"
    assert settings.database_path == tmp_path / "database" / "test.db"
    assert all(path.is_relative_to(tmp_path) for _, path in settings.persistent_paths)


@pytest.mark.parametrize("app_env", ["", "preview", "LOCAL"])
def test_missing_or_unknown_app_environment_is_rejected(app_env: str) -> None:
    with pytest.raises(ConfigurationError, match="APP_ENV"):
        AppSettings.from_env(environ={"APP_ENV": app_env})


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("HOST", "http://127.0.0.1"),
        ("HOST", "host.example:8029"),
        ("HOST", "999.999.999.999"),
        ("PORT", "0"),
        ("PORT", "65536"),
        ("PORT", "not-a-port"),
    ],
)
def test_invalid_host_and_port_are_rejected(name: str, value: str) -> None:
    env = {"APP_ENV": "local", name: value}

    with pytest.raises(ConfigurationError, match=name):
        AppSettings.from_env(environ=env)


def test_production_requires_database_url(tmp_path: Path) -> None:
    env = _deployed_env(tmp_path)
    del env["DATABASE_URL"]

    with pytest.raises(ConfigurationError, match="DATABASE_URL is required"):
        AppSettings.from_env(environ=env)


def test_production_rejects_relative_persistent_paths(tmp_path: Path) -> None:
    env = _deployed_env(tmp_path, APP_DOCUMENT_PATH="relative/documents")

    with pytest.raises(ConfigurationError, match="APP_DOCUMENT_PATH must be an absolute"):
        AppSettings.from_env(environ=env)


def test_production_rejects_paths_inside_release(tmp_path: Path) -> None:
    env = _deployed_env(
        tmp_path,
        APP_DOCUMENT_PATH=str(APP_ROOT / "data" / "documents"),
    )

    with pytest.raises(ConfigurationError, match="immutable application release"):
        AppSettings.from_env(environ=env)


def test_production_rejects_unavailable_persistent_path(tmp_path: Path) -> None:
    unavailable = tmp_path / "not-a-directory"
    unavailable.write_text("file", encoding="utf-8")
    env = _deployed_env(tmp_path, APP_DOCUMENT_PATH=str(unavailable))

    with pytest.raises(ConfigurationError, match="available writable directory"):
        AppSettings.from_env(environ=env)


def test_production_rejects_anonymous_access(tmp_path: Path) -> None:
    env = _deployed_env(tmp_path, ALLOW_ANONYMOUS_LOCAL="true")

    with pytest.raises(ConfigurationError, match="ALLOW_ANONYMOUS_LOCAL"):
        AppSettings.from_env(environ=env)


@pytest.mark.parametrize("storage_secret", ["", "local-development-secret"])
def test_production_rejects_missing_or_default_storage_secret(
    tmp_path: Path,
    storage_secret: str,
) -> None:
    env = _deployed_env(tmp_path, APP_STORAGE_SECRET=storage_secret)

    with pytest.raises(ConfigurationError, match="APP_STORAGE_SECRET"):
        AppSettings.from_env(environ=env)


def test_configuration_errors_do_not_expose_database_secrets(tmp_path: Path) -> None:
    secret = "do-not-print-this-secret"
    env = _deployed_env(
        tmp_path,
        DATABASE_URL=f"postgresql://user:{secret}@[invalid-host/db",
    )

    with pytest.raises(ConfigurationError) as caught:
        AppSettings.from_env(environ=env)

    rendered_error = "".join(
        traceback.format_exception(caught.type, caught.value, caught.tb)
    )
    assert secret not in rendered_error
    assert env["DATABASE_URL"] not in rendered_error


def test_database_url_is_accepted_as_secret_configuration() -> None:
    secret = "database-password"
    settings = AppSettings.from_env(
        environ={
            "APP_ENV": "test",
            "DATABASE_URL": f"postgresql://user:{secret}@db.example/test",
        }
    )

    assert settings.database_url is not None
    assert secret not in repr(settings)


def test_deployed_startup_remains_blocked_until_prompt_4(tmp_path: Path) -> None:
    with pytest.raises(ConfigurationError, match="Prompt 4"):
        AppSettings.from_env(environ=_deployed_env(tmp_path))


def test_local_dashboard_initialization_still_uses_sqlite(tmp_path: Path) -> None:
    settings = AppSettings.from_env(
        environ={
            "APP_ENV": "test",
            "APP_DATABASE_PATH": str(tmp_path / "data" / "itss_dashboard.db"),
            "APP_DOCUMENT_PATH": str(tmp_path / "data" / "documents"),
            "APP_IMPORT_PATH": str(tmp_path / "data" / "imports"),
            "APP_EXPORT_PATH": str(tmp_path / "data" / "exports"),
            "APP_VECTOR_PATH": str(tmp_path / "data" / "vector_store"),
            "APP_TEMPLATE_PATH": str(tmp_path / "data" / "templates"),
            "APP_STORAGE_DIR": str(tmp_path / "storage"),
        }
    )

    state = dashboard.init_dashboard(settings)

    assert state.engine.url.drivername == "sqlite"
    assert settings.database_path.exists()
