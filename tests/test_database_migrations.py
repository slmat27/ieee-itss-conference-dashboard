from __future__ import annotations

import sqlite3
from datetime import date
from pathlib import Path

import pytest
from alembic import command
from sqlalchemy import inspect, select, text
from sqlalchemy.dialects.mysql import dialect as mysql_dialect
from sqlalchemy.exc import OperationalError, SQLAlchemyError
from sqlalchemy.orm import Session

from app import dashboard
from app.config import AppSettings, ConfigurationError
from app.dashboard import Base, Conference, Document, ImportBatch, TemplateFile
from app.database import (
    build_alembic_config,
    create_database_engine,
    create_sqlite_readonly_engine,
    current_alembic_revision,
    database_health,
    expected_alembic_revision,
    is_mariadb_url,
    redacted_database_url,
    sqlite_database_url,
)
from app.database_adoption import adopt_sqlite_database
from app.database_seed import seed_database
from app.sqlite_to_mariadb import migrate_sqlite_database, write_reports


def _sqlite_settings(path: Path) -> AppSettings:
    return AppSettings.from_env(
        environ={
            "APP_ENV": "test",
            "DATABASE_URL": sqlite_database_url(path).render_as_string(
                hide_password=False
            ),
        }
    )


def _upgrade(path: Path) -> AppSettings:
    settings = _sqlite_settings(path)
    command.upgrade(build_alembic_config(settings), "head")
    return settings


def _production_settings(tmp_path: Path) -> AppSettings:
    return AppSettings.from_env(
        environ={
            "APP_ENV": "production",
            "DATABASE_URL": (
                "mysql+pymysql://app:database-secret@db.example/itss?charset=utf8mb4"
            ),
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
    )


def _create_source_database(path: Path) -> None:
    settings = _upgrade(path)
    engine = create_database_engine(settings)
    long_text = "portable text " * 8_000
    try:
        with Session(engine) as session:
            conference = Conference(
                conference_number="90001",
                acronym="PORT",
                normalized_acronym="PORT",
                year=2031,
                official_title="Portability Test Conference",
                canonical_name="PORT 2031",
                conference_series="ITSC",
                sponsorship_type="Financially Sponsored",
                start_date=date(2031, 4, 5),
                phase_override=True,
                score=87.1234567890123,
                comments=long_text,
                source_details_json='{"source":"migration-test"}',
            )
            session.add(conference)
            session.add(
                ImportBatch(
                    original_filename="source.xlsx",
                    file_type="xlsx",
                    file_hash="a" * 64,
                    preview_json='{"payload":"' + long_text + '"}',
                    file_data=b"x" * 70_000,
                )
            )
            session.add(
                TemplateFile(
                    template_name="Migration template",
                    short_description="Binary portability",
                    category="Test",
                    template_type="docx",
                    file_name="migration-template.docx",
                    original_filename="migration-template.docx",
                    file_data=b"y" * 80_000,
                )
            )
            session.add(
                Document(
                    title="Long document",
                    file_name="long-document.txt",
                    document_category="Test",
                    knowledge_scope="Migration",
                    extracted_text=long_text,
                )
            )
            session.commit()
    finally:
        engine.dispose()


def test_sqlite_url_creation_uses_absolute_path(tmp_path: Path) -> None:
    url = sqlite_database_url(tmp_path / "database" / "test.db")

    assert url.get_backend_name() == "sqlite"
    assert Path(url.database or "").is_absolute()


def test_sqlite_source_engine_is_read_only(tmp_path: Path) -> None:
    path = tmp_path / "source.db"
    with sqlite3.connect(path) as connection:
        connection.execute("CREATE TABLE example (id INTEGER PRIMARY KEY)")

    engine = create_sqlite_readonly_engine(path)
    try:
        with engine.begin() as connection:
            with pytest.raises(OperationalError, match="readonly"):
                connection.execute(text("INSERT INTO example (id) VALUES (1)"))
    finally:
        engine.dispose()


def test_mariadb_url_recognition_and_redaction() -> None:
    secret = "never-render-this"
    url = f"mysql+pymysql://dashboard:{secret}@db.example/itss?charset=utf8mb4"

    assert is_mariadb_url(url)
    assert secret not in redacted_database_url(url)
    assert url not in redacted_database_url(url)


def test_database_url_is_authoritative_and_sqlite_pragmas_are_explicit(
    tmp_path: Path,
) -> None:
    selected = tmp_path / "selected.db"
    ignored = tmp_path / "ignored.db"
    settings = AppSettings.from_env(
        environ={
            "APP_ENV": "test",
            "DATABASE_URL": sqlite_database_url(selected).render_as_string(
                hide_password=False
            ),
            "APP_DATABASE_PATH": str(ignored),
        }
    )
    engine = create_database_engine(settings)
    try:
        with engine.connect() as connection:
            assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one() == 1
            assert (
                connection.exec_driver_sql("PRAGMA busy_timeout").scalar_one() == 30_000
            )
        assert Path(engine.url.database or "") == selected.resolve()
        assert not ignored.exists()
    finally:
        engine.dispose()


def test_portable_types_compile_for_mariadb_without_narrowing_data() -> None:
    dialect = mysql_dialect()

    assert str(TemplateFile.__table__.c.file_data.type.compile(dialect=dialect)) == (
        "LONGBLOB"
    )
    assert str(Document.__table__.c.extracted_text.type.compile(dialect=dialect)) == (
        "LONGTEXT"
    )
    assert str(Conference.__table__.c.score.type.compile(dialect=dialect)) == "DOUBLE"
    assert str(Conference.__table__.c.created_at.type.compile(dialect=dialect)) == (
        "DATETIME(6)"
    )


def test_new_sqlite_database_upgrades_from_zero_to_head(tmp_path: Path) -> None:
    path = tmp_path / "new.db"
    settings = _upgrade(path)
    engine = create_database_engine(settings)
    try:
        assert set(Base.metadata.tables).issubset(inspect(engine).get_table_names())
        assert current_alembic_revision(engine) == expected_alembic_revision()
        command.check(build_alembic_config(settings))
    finally:
        engine.dispose()


def test_existing_sqlite_adoption_uses_backup_and_stamps_copy(
    tmp_path: Path,
) -> None:
    path = tmp_path / "legacy-copy.db"
    engine = create_database_engine(_sqlite_settings(path))
    try:
        Base.metadata.create_all(engine)
    finally:
        engine.dispose()
    backup = tmp_path / "legacy-copy.backup.db"

    dry_run = adopt_sqlite_database(path)
    applied = adopt_sqlite_database(path, apply=True, backup_path=backup)

    assert dry_run.mode == "dry-run"
    assert dry_run.stamped is False
    assert applied.stamped is True
    assert backup.is_file()


def test_existing_sqlite_adoption_refuses_schema_mismatch(
    tmp_path: Path,
) -> None:
    path = tmp_path / "mismatch.db"
    engine = create_database_engine(_sqlite_settings(path))
    try:
        Base.metadata.create_all(engine)
    finally:
        engine.dispose()
    with sqlite3.connect(path) as connection:
        connection.execute("ALTER TABLE conferences ADD COLUMN unexpected TEXT")

    with pytest.raises(ConfigurationError, match="incompatible"):
        adopt_sqlite_database(path)


def test_production_startup_refuses_pending_migrations(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = _production_settings(tmp_path)
    empty_engine = create_database_engine(_sqlite_settings(tmp_path / "empty.db"))
    monkeypatch.setattr(
        dashboard, "create_database_engine", lambda _settings: empty_engine
    )

    with pytest.raises(ConfigurationError, match="migrations are pending"):
        dashboard.init_dashboard(settings)
    empty_engine.dispose()


def test_adopted_local_database_does_not_use_legacy_bootstrap(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = _upgrade(tmp_path / "adopted.db")
    current_engine = create_database_engine(settings)
    monkeypatch.setattr(
        dashboard,
        "create_database_engine",
        lambda _settings: current_engine,
    )
    monkeypatch.setattr(
        dashboard.Base.metadata,
        "create_all",
        lambda *_args, **_kwargs: pytest.fail("legacy create_all was called"),
    )
    monkeypatch.setattr(
        dashboard,
        "ensure_database_schema",
        lambda *_args, **_kwargs: pytest.fail("legacy ALTER compatibility ran"),
    )
    monkeypatch.setattr(
        dashboard,
        "recalculate",
        lambda *_args, **_kwargs: pytest.fail("legacy recalculation ran"),
    )

    state = dashboard.init_dashboard(settings)

    assert state.engine is current_engine
    current_engine.dispose()


def test_production_startup_does_not_bootstrap_or_recalculate(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = _production_settings(tmp_path)
    current_engine = create_database_engine(_upgrade(tmp_path / "current.db"))
    monkeypatch.setattr(
        dashboard,
        "create_database_engine",
        lambda _settings: current_engine,
    )
    monkeypatch.setattr(
        dashboard.Base.metadata,
        "create_all",
        lambda *_args, **_kwargs: pytest.fail("production create_all was called"),
    )
    monkeypatch.setattr(
        dashboard,
        "ensure_database_schema",
        lambda *_args, **_kwargs: pytest.fail("production ALTER compatibility ran"),
    )
    monkeypatch.setattr(
        dashboard,
        "recalculate",
        lambda *_args, **_kwargs: pytest.fail("production recalculation ran"),
    )

    state = dashboard.init_dashboard(settings)

    assert state.engine is current_engine
    current_engine.dispose()


def test_database_health_checks_connectivity_and_revision(tmp_path: Path) -> None:
    current_engine = create_database_engine(_upgrade(tmp_path / "current.db"))
    behind_engine = create_database_engine(_sqlite_settings(tmp_path / "behind.db"))
    try:
        assert database_health(current_engine, require_revision=True) == {
            "status": "ok",
            "database": "ok",
            "schema": "current",
        }
        assert database_health(behind_engine, require_revision=True) == {
            "status": "error",
            "database": "ok",
            "schema": "out_of_date",
        }
    finally:
        current_engine.dispose()
        behind_engine.dispose()


def test_reference_data_seed_is_explicit_and_idempotent(tmp_path: Path) -> None:
    settings = _upgrade(tmp_path / "seed.db")

    first = seed_database(settings)
    second = seed_database(settings)

    assert first == second
    assert first["milestone_definitions"] == 10
    assert first["status_mappings"] == 16
    assert first["recalculated_conferences"] == 0


def test_migration_dry_run_apply_types_and_reconciliation(
    tmp_path: Path,
) -> None:
    source = tmp_path / "source.db"
    target = tmp_path / "target.db"
    _create_source_database(source)

    dry_run = migrate_sqlite_database(
        source_path=source,
        target_database_url=sqlite_database_url(target).render_as_string(
            hide_password=False
        ),
        allow_sqlite_target_for_tests=True,
    )
    applied = migrate_sqlite_database(
        source_path=source,
        target_database_url=sqlite_database_url(target).render_as_string(
            hide_password=False
        ),
        apply=True,
        allow_sqlite_target_for_tests=True,
    )

    assert dry_run["mode"] == "dry-run"
    assert dry_run["status"] == "ready"
    assert applied["status"] == "completed"
    assert applied["source"]["metrics"] == applied["target"]["metrics"]

    engine = create_database_engine(_sqlite_settings(target))
    try:
        with Session(engine) as session:
            conference = session.scalar(select(Conference))
            batch = session.scalar(select(ImportBatch))
            template = session.scalar(select(TemplateFile))
            document = session.scalar(select(Document))
            assert conference is not None
            assert conference.start_date == date(2031, 4, 5)
            assert conference.phase_override is True
            assert conference.score == 87.1234567890123
            assert conference.itss_loan_amount is None
            assert len(conference.comments or "") > 65_535
            assert batch is not None and len(batch.file_data or b"") == 70_000
            assert len(batch.preview_json) > 65_535
            assert template is not None and len(template.file_data or b"") == 80_000
            assert document is not None and len(document.extracted_text) > 65_535
    finally:
        engine.dispose()


def test_migration_target_failure_redacts_exception_details(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = tmp_path / "source.db"
    target = tmp_path / "target.db"
    secret = "never-report-this"
    _create_source_database(source)

    def fail_inspection(_engine: object) -> dict[str, object]:
        raise SQLAlchemyError(f"connection failed with {secret}")

    monkeypatch.setattr(
        "app.sqlite_to_mariadb.inspect_target",
        fail_inspection,
    )
    report = migrate_sqlite_database(
        source_path=source,
        target_database_url=sqlite_database_url(target).render_as_string(
            hide_password=False
        ),
        allow_sqlite_target_for_tests=True,
    )

    rendered = str(report)
    assert report["status"] == "blocked"
    assert secret not in rendered
    assert "connectivity or schema inspection failed" in rendered


def test_migration_refuses_nonempty_target_by_default(tmp_path: Path) -> None:
    source = tmp_path / "source.db"
    target = tmp_path / "target.db"
    _create_source_database(source)
    first = migrate_sqlite_database(
        source_path=source,
        target_database_url=sqlite_database_url(target).render_as_string(
            hide_password=False
        ),
        apply=True,
        allow_sqlite_target_for_tests=True,
    )
    second = migrate_sqlite_database(
        source_path=source,
        target_database_url=sqlite_database_url(target).render_as_string(
            hide_password=False
        ),
        allow_sqlite_target_for_tests=True,
    )
    resumed = migrate_sqlite_database(
        source_path=source,
        target_database_url=sqlite_database_url(target).render_as_string(
            hide_password=False
        ),
        apply=True,
        resume=True,
        allow_sqlite_target_for_tests=True,
    )

    assert first["status"] == "completed"
    assert second["status"] == "blocked"
    assert any("non-empty" in error for error in second["errors"])
    assert resumed["status"] == "completed"


def test_migration_refuses_target_with_unknown_tables(tmp_path: Path) -> None:
    source = tmp_path / "source.db"
    target = tmp_path / "target.db"
    _create_source_database(source)
    with sqlite3.connect(target) as connection:
        connection.execute("CREATE TABLE unrelated (id INTEGER PRIMARY KEY)")

    report = migrate_sqlite_database(
        source_path=source,
        target_database_url=sqlite_database_url(target).render_as_string(
            hide_password=False
        ),
        allow_sqlite_target_for_tests=True,
    )

    assert report["status"] == "blocked"
    assert any("incompatible" in error for error in report["errors"])


def test_file_migration_refuses_overlapping_directories(tmp_path: Path) -> None:
    source = tmp_path / "source.db"
    target = tmp_path / "target.db"
    documents = tmp_path / "documents"
    documents.mkdir()
    (documents / "guide.txt").write_text("portable", encoding="utf-8")
    _create_source_database(source)

    report = migrate_sqlite_database(
        source_path=source,
        target_database_url=sqlite_database_url(target).render_as_string(
            hide_password=False
        ),
        file_pairs={"documents": (documents, documents / "target")},
        allow_sqlite_target_for_tests=True,
    )

    assert report["status"] == "blocked"
    assert any("must not overlap" in error for error in report["errors"])


def test_migration_reports_source_foreign_key_violations(
    tmp_path: Path,
) -> None:
    source = tmp_path / "source.db"
    target = tmp_path / "target.db"
    _create_source_database(source)
    with sqlite3.connect(source) as connection:
        connection.execute(
            """
            INSERT INTO conference_aliases
                (id, conference_id, alias, alias_type, source, active)
            VALUES
                ('orphan-alias', 'missing-conference', 'Orphan', 'Manual', NULL, 1)
            """
        )

    report = migrate_sqlite_database(
        source_path=source,
        target_database_url=sqlite_database_url(target).render_as_string(
            hide_password=False
        ),
        allow_sqlite_target_for_tests=True,
    )

    assert report["status"] == "blocked"
    assert report["source"]["foreign_key_violations"] == [
        {
            "table": "conference_aliases",
            "target_table": "conferences",
            "columns": ["conference_id"],
            "count": 1,
        }
    ]


def test_optional_file_migration_and_reports(tmp_path: Path) -> None:
    source = tmp_path / "source.db"
    target = tmp_path / "target.db"
    documents_source = tmp_path / "source-documents"
    documents_target = tmp_path / "target-documents"
    documents_source.mkdir()
    (documents_source / "guide.txt").write_text("portable", encoding="utf-8")
    _create_source_database(source)

    report = migrate_sqlite_database(
        source_path=source,
        target_database_url=sqlite_database_url(target).render_as_string(
            hide_password=False
        ),
        apply=True,
        file_pairs={"documents": (documents_source, documents_target)},
        allow_sqlite_target_for_tests=True,
    )
    machine_report, human_report = write_reports(report, tmp_path / "reports")

    assert report["status"] == "completed"
    assert (documents_target / "guide.txt").read_text(encoding="utf-8") == "portable"
    assert machine_report.is_file()
    assert human_report.is_file()
    assert str(documents_source) not in machine_report.read_text(encoding="utf-8")
