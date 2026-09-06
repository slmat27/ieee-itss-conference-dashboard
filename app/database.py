from __future__ import annotations

from pathlib import Path
from typing import Any

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.engine import Engine, URL, make_url
from sqlalchemy.exc import ArgumentError, SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from .config import APP_ROOT, AppSettings, ConfigurationError

ALEMBIC_CONFIG_PATH = APP_ROOT / "alembic.ini"
ALEMBIC_SCRIPT_PATH = APP_ROOT / "migrations"
SQLITE_TIMEOUT_SECONDS = 30
MARIADB_POOL_RECYCLE_SECONDS = 1_800


def sqlite_database_url(path: Path) -> URL:
    """Build a platform-correct SQLite URL without string interpolation."""

    return URL.create("sqlite+pysqlite", database=str(path.resolve(strict=False)))


def effective_database_url(settings: AppSettings) -> URL:
    if settings.database_url is not None:
        return make_url(settings.database_url)
    return sqlite_database_url(settings.database_path)


def redacted_database_url(value: str | URL) -> str:
    """Render a URL safely for diagnostics without exposing its password."""

    try:
        url = make_url(value) if isinstance(value, str) else value
    except (ArgumentError, TypeError, ValueError):
        return "<invalid-database-url>"
    return url.render_as_string(hide_password=True)


def is_mariadb_url(value: str | URL) -> bool:
    try:
        url = make_url(value) if isinstance(value, str) else value
    except (ArgumentError, TypeError, ValueError):
        return False
    return url.drivername in {"mysql+pymysql", "mariadb+pymysql"}


def create_sqlite_readonly_engine(path: Path) -> Engine:
    """Open an existing SQLite database without write capability."""

    resolved = path.expanduser().resolve(strict=True)
    url = URL.create(
        "sqlite+pysqlite",
        database=f"file:{resolved.as_posix()}",
        query={"mode": "ro", "uri": "true"},
    )
    engine = create_engine(
        url,
        connect_args={
            "check_same_thread": False,
            "timeout": SQLITE_TIMEOUT_SECONDS,
        },
        future=True,
    )
    _configure_sqlite_connections(engine)
    return engine


def create_database_engine(settings: AppSettings) -> Engine:
    url = effective_database_url(settings)
    if url.get_backend_name() == "sqlite":
        if settings.is_deployed:
            raise ConfigurationError(
                "SQLite deployment is not enabled; staging and production require "
                "a reviewed MariaDB DATABASE_URL."
            )
        _ensure_sqlite_parent(url)
        engine = create_engine(
            url,
            connect_args={
                "check_same_thread": False,
                "timeout": SQLITE_TIMEOUT_SECONDS,
            },
            future=True,
        )
        _configure_sqlite_connections(engine)
        return engine

    if not is_mariadb_url(url):
        raise ConfigurationError(
            "DATABASE_URL must select SQLite or MariaDB through PyMySQL."
        )
    return create_engine(
        url,
        future=True,
        pool_pre_ping=True,
        pool_recycle=MARIADB_POOL_RECYCLE_SECONDS,
    )


def create_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(engine, expire_on_commit=False, future=True)


def build_alembic_config(
    settings: AppSettings,
    *,
    connection: Any | None = None,
) -> Config:
    config = Config(str(ALEMBIC_CONFIG_PATH))
    config.set_main_option("script_location", str(ALEMBIC_SCRIPT_PATH))
    config.set_main_option(
        "sqlalchemy.url",
        redacted_database_url(effective_database_url(settings)).replace("%", "%%"),
    )
    config.attributes["app_settings"] = settings
    if connection is not None:
        config.attributes["connection"] = connection
    return config


def expected_alembic_revision() -> str:
    config = Config(str(ALEMBIC_CONFIG_PATH))
    config.set_main_option("script_location", str(ALEMBIC_SCRIPT_PATH))
    heads = ScriptDirectory.from_config(config).get_heads()
    if len(heads) != 1:
        raise ConfigurationError(
            "The Alembic migration history must contain exactly one head revision."
        )
    return heads[0]


def current_alembic_revision(engine: Engine) -> str | None:
    inspector = inspect(engine)
    if not inspector.has_table("alembic_version"):
        return None
    with engine.connect() as connection:
        revisions = list(
            connection.execute(
                text("SELECT version_num FROM alembic_version")
            ).scalars()
        )
    if len(revisions) > 1:
        raise ConfigurationError(
            "The database contains multiple Alembic revisions; startup is refused."
        )
    return revisions[0] if revisions else None


def verify_database_ready(engine: Engine, *, require_revision: bool) -> None:
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1")).scalar_one()
    except SQLAlchemyError:
        raise ConfigurationError("Database connectivity validation failed.") from None

    if not require_revision:
        return
    try:
        current = current_alembic_revision(engine)
        expected = expected_alembic_revision()
    except SQLAlchemyError:
        raise ConfigurationError(
            "Database schema revision validation failed."
        ) from None
    if current != expected:
        raise ConfigurationError(
            "Database migrations are pending or incompatible; run Alembic upgrade "
            "before starting the application."
        )


def database_health(
    engine: Engine,
    *,
    require_revision: bool,
) -> dict[str, str]:
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1")).scalar_one()
        if require_revision:
            current = current_alembic_revision(engine)
            if current != expected_alembic_revision():
                return {
                    "status": "error",
                    "database": "ok",
                    "schema": "out_of_date",
                }
    except (ConfigurationError, SQLAlchemyError):
        return {
            "status": "error",
            "database": "unavailable",
            "schema": "unknown",
        }
    return {
        "status": "ok",
        "database": "ok",
        "schema": "current" if require_revision else "not_required",
    }


def _ensure_sqlite_parent(url: URL) -> None:
    database = url.database
    if not database or database == ":memory:" or database.startswith("file:"):
        return
    Path(database).expanduser().resolve(strict=False).parent.mkdir(
        parents=True,
        exist_ok=True,
    )


def _configure_sqlite_connections(engine: Engine) -> None:
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragmas(dbapi_connection: Any, _record: Any) -> None:
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute(f"PRAGMA busy_timeout={SQLITE_TIMEOUT_SECONDS * 1_000}")
        finally:
            cursor.close()
