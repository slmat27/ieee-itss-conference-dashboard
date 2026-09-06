from __future__ import annotations

import os
import sys
import tempfile
from datetime import date
from pathlib import Path
from typing import NoReturn

from alembic import command
from sqlalchemy import URL, inspect, text
from sqlalchemy.orm import Session

from app.config import AppSettings
from app.dashboard import Conference, Document, ImportBatch, TemplateFile
from app.database import (
    build_alembic_config,
    create_database_engine,
    current_alembic_revision,
    database_health,
    expected_alembic_revision,
    is_mariadb_url,
    sqlite_database_url,
)
from app.database_seed import seed_database
from app.sqlite_to_mariadb import migrate_sqlite_database

ALLOWED_HOSTS = {"127.0.0.1", "localhost", "mariadb"}
EXPECTED_DATABASE = "itss_ci"


def required_environment(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


def target_database_url() -> tuple[str, str]:
    if os.environ.get("CI_MARIADB_INTEGRATION") != "true":
        raise RuntimeError("refusing to run outside the disposable CI integration job")

    host = required_environment("CI_MARIADB_HOST")
    database = required_environment("CI_MARIADB_DATABASE")
    user = required_environment("CI_MARIADB_USER")
    password = required_environment("CI_MARIADB_PASSWORD")
    if host not in ALLOWED_HOSTS or database != EXPECTED_DATABASE:
        raise RuntimeError("refusing to access a non-disposable database target")

    try:
        port = int(required_environment("CI_MARIADB_PORT"))
    except ValueError as exc:
        raise RuntimeError("CI_MARIADB_PORT must be an integer") from exc

    url = URL.create(
        "mysql+pymysql",
        username=user,
        password=password,
        host=host,
        port=port,
        database=database,
        query={"charset": "utf8mb4"},
    )
    return url.render_as_string(hide_password=False), password


def settings_for_url(database_url: str) -> AppSettings:
    return AppSettings.from_env(
        environ={"APP_ENV": "test", "DATABASE_URL": database_url}
    )


def create_synthetic_source(path: Path) -> None:
    source_url = sqlite_database_url(path).render_as_string(hide_password=False)
    settings = settings_for_url(source_url)
    command.upgrade(build_alembic_config(settings), "head")
    engine = create_database_engine(settings)
    try:
        with Session(engine) as session:
            conference = Conference(
                conference_number="CI-90001",
                acronym="CITEST",
                normalized_acronym="CITEST",
                year=2032,
                official_title="Synthetic CI Migration Conference",
                canonical_name="CITEST 2032",
                conference_series="ITSC",
                sponsorship_type="Financially Sponsored",
                start_date=date(2032, 5, 10),
                phase_override=True,
                score=91.25,
                comments="Synthetic CI data only.",
                source_details_json='{"source":"ci-synthetic"}',
            )
            session.add(conference)
            session.add(
                ImportBatch(
                    original_filename="synthetic.xlsx",
                    file_type="xlsx",
                    file_hash="c" * 64,
                    preview_json='{"source":"ci-synthetic"}',
                    file_data=b"synthetic import payload",
                )
            )
            session.add(
                TemplateFile(
                    template_name="Synthetic CI template",
                    short_description="Disposable migration verification",
                    category="Test",
                    template_type="docx",
                    file_name="synthetic.docx",
                    original_filename="synthetic.docx",
                    file_data=b"synthetic template payload",
                )
            )
            session.add(
                Document(
                    title="Synthetic CI document",
                    file_name="synthetic.txt",
                    document_category="Test",
                    knowledge_scope="CI",
                    extracted_text="Synthetic migration content.",
                )
            )
            session.commit()
    finally:
        engine.dispose()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def fail_safely(exc: Exception, database_url: str, password: str) -> NoReturn:
    message = str(exc)
    if database_url:
        message = message.replace(database_url, "<redacted-database-url>")
    if password:
        message = message.replace(password, "<redacted-password>")
    print(
        f"MariaDB integration verification failed ({type(exc).__name__}): {message}",
        file=sys.stderr,
    )
    raise SystemExit(1)


def main() -> int:
    database_url = ""
    password = ""
    try:
        database_url, password = target_database_url()
        require(is_mariadb_url(database_url), "target must use mysql+pymysql")
        settings = settings_for_url(database_url)
        engine = create_database_engine(settings)
        try:
            require(
                inspect(engine).get_table_names() == [],
                "disposable target database must start empty",
            )
            with engine.connect() as connection:
                require(
                    connection.execute(text("SELECT 1")).scalar_one() == 1,
                    "connection failed",
                )
                charset, collation = connection.execute(
                    text("SELECT @@character_set_database, @@collation_database")
                ).one()
                require(
                    str(charset).lower() == "utf8mb4", "database charset is not utf8mb4"
                )
                require(
                    str(collation).lower().startswith("utf8mb4"),
                    "database collation is not utf8mb4",
                )
        finally:
            engine.dispose()

        command.upgrade(build_alembic_config(settings), "head")
        engine = create_database_engine(settings)
        try:
            expected = expected_alembic_revision()
            require(
                current_alembic_revision(engine) == expected,
                "Alembic revision mismatch",
            )
            require(
                database_health(engine, require_revision=True)
                == {"status": "ok", "database": "ok", "schema": "current"},
                "application database health check failed",
            )
        finally:
            engine.dispose()

        with tempfile.TemporaryDirectory(prefix="itss-ci-migration-") as temp_dir:
            source_path = Path(temp_dir) / "synthetic-source.db"
            create_synthetic_source(source_path)
            dry_run = migrate_sqlite_database(
                source_path=source_path,
                target_database_url=database_url,
            )
            require(dry_run["status"] == "ready", "migration dry-run was not ready")

            migrated = migrate_sqlite_database(
                source_path=source_path,
                target_database_url=database_url,
                apply=True,
            )
            require(migrated["status"] == "completed", "migration did not complete")
            require(
                migrated["errors"] == [], "migration reported reconciliation errors"
            )
            require(
                migrated["source"]["metrics"] == migrated["target"]["metrics"],
                "source and target reconciliation metrics differ",
            )

        first_seed = seed_database(settings)
        second_seed = seed_database(settings)
        require(first_seed == second_seed, "reference-data seeding is not idempotent")
        require(
            first_seed["milestone_definitions"] == 10, "milestone seed count differs"
        )
        require(first_seed["status_mappings"] == 16, "status seed count differs")

        engine = create_database_engine(settings)
        try:
            require(
                database_health(engine, require_revision=True)["status"] == "ok",
                "post-migration database health check failed",
            )
        finally:
            engine.dispose()

        print(
            "MariaDB integration verification passed: connectivity, utf8mb4, "
            "Alembic, health, synthetic migration, reconciliation, and idempotent "
            "seeding are valid."
        )
        return 0
    except Exception as exc:
        fail_safely(exc, database_url, password)


if __name__ == "__main__":
    raise SystemExit(main())
