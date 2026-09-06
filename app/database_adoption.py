from __future__ import annotations

import argparse
import json
import sqlite3
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from alembic import command
from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
    inspect,
)
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError

from .config import APP_ROOT, AppSettings, ConfigurationError
from .dashboard import Base
from .database import (
    build_alembic_config,
    create_database_engine,
    create_sqlite_readonly_engine,
    current_alembic_revision,
    expected_alembic_revision,
    sqlite_database_url,
)


@dataclass(frozen=True, slots=True)
class SchemaValidation:
    compatible: bool
    errors: tuple[str, ...]
    integrity_check: str
    foreign_key_violations: int
    current_revision: str | None
    expected_revision: str


@dataclass(frozen=True, slots=True)
class AdoptionResult:
    mode: str
    compatible: bool
    stamped: bool
    backup_created: bool
    integrity_check: str
    foreign_key_violations: int
    revision: str | None


def sqlite_settings(path: Path) -> AppSettings:
    return AppSettings.from_env(
        environ={
            "APP_ENV": "test",
            "DATABASE_URL": sqlite_database_url(path).render_as_string(
                hide_password=False
            ),
        }
    )


def validate_sqlite_baseline(path: Path) -> SchemaValidation:
    resolved = path.expanduser().resolve(strict=True)
    if not resolved.is_file():
        raise ConfigurationError("The SQLite adoption path must be a file.")
    engine = create_sqlite_readonly_engine(resolved)
    try:
        return _validate_engine_schema(engine)
    except SQLAlchemyError:
        raise ConfigurationError(
            "The SQLite database could not be inspected safely."
        ) from None
    finally:
        engine.dispose()


def adopt_sqlite_database(
    path: Path,
    *,
    apply: bool = False,
    backup_path: Path | None = None,
    confirm_original: bool = False,
) -> AdoptionResult:
    resolved = path.expanduser().resolve(strict=True)
    _guard_original_database(resolved, confirm_original=confirm_original)
    validation = validate_sqlite_baseline(resolved)
    if not validation.compatible:
        summary = "; ".join(validation.errors[:5])
        raise ConfigurationError(f"SQLite schema is incompatible: {summary}")
    if validation.current_revision not in {None, validation.expected_revision}:
        raise ConfigurationError("SQLite database has an unexpected Alembic revision.")
    if not apply or validation.current_revision == validation.expected_revision:
        return AdoptionResult(
            mode="dry-run" if not apply else "already-stamped",
            compatible=True,
            stamped=validation.current_revision == validation.expected_revision,
            backup_created=False,
            integrity_check=validation.integrity_check,
            foreign_key_violations=validation.foreign_key_violations,
            revision=validation.current_revision,
        )

    backup = backup_path or _default_backup_path(resolved)
    backup = backup.expanduser().resolve(strict=False)
    if backup.exists():
        raise ConfigurationError("The requested SQLite backup path already exists.")
    backup.parent.mkdir(parents=True, exist_ok=True)
    try:
        _backup_sqlite_database(resolved, backup)
    except sqlite3.Error:
        raise ConfigurationError("The SQLite backup could not be created.") from None

    settings = sqlite_settings(resolved)
    engine = create_database_engine(settings)
    try:
        with engine.begin() as connection:
            command.stamp(
                build_alembic_config(settings, connection=connection),
                "head",
            )
        revision = current_alembic_revision(engine)
    finally:
        engine.dispose()
    if revision != validation.expected_revision:
        raise ConfigurationError(
            "Alembic stamping did not reach the expected revision."
        )
    return AdoptionResult(
        mode="apply",
        compatible=True,
        stamped=True,
        backup_created=True,
        integrity_check=validation.integrity_check,
        foreign_key_violations=validation.foreign_key_violations,
        revision=revision,
    )


def _validate_engine_schema(engine: Engine) -> SchemaValidation:
    inspector = inspect(engine)
    expected_tables = set(Base.metadata.tables)
    actual_tables = set(inspector.get_table_names())
    actual_application_tables = actual_tables - {"alembic_version"}
    errors: list[str] = []

    for name in sorted(expected_tables - actual_application_tables):
        errors.append(f"missing table {name}")
    for name in sorted(actual_application_tables - expected_tables):
        errors.append(f"unknown table {name}")

    for table_name in sorted(expected_tables & actual_application_tables):
        expected_table = Base.metadata.tables[table_name]
        actual_columns = {
            column["name"]: column for column in inspector.get_columns(table_name)
        }
        expected_columns = {column.name: column for column in expected_table.columns}
        for name in sorted(expected_columns.keys() - actual_columns.keys()):
            errors.append(f"{table_name}: missing column {name}")
        for name in sorted(actual_columns.keys() - expected_columns.keys()):
            errors.append(f"{table_name}: unknown column {name}")
        for name in sorted(expected_columns.keys() & actual_columns.keys()):
            expected_column = expected_columns[name]
            actual = actual_columns[name]
            if not _compatible_type(expected_column.type, actual["type"]):
                errors.append(
                    f"{table_name}.{name}: incompatible type {actual['type']}"
                )
            if bool(expected_column.nullable) != bool(actual["nullable"]):
                errors.append(f"{table_name}.{name}: incompatible nullability")
            if _normalized_server_default(
                expected_column.server_default
            ) != _normalized_server_default(actual["default"]):
                errors.append(f"{table_name}.{name}: incompatible server default")

        expected_pk = tuple(
            column.name for column in expected_table.primary_key.columns
        )
        actual_pk = tuple(
            inspector.get_pk_constraint(table_name)["constrained_columns"]
        )
        if expected_pk != actual_pk:
            errors.append(f"{table_name}: incompatible primary key")

        expected_fks = {
            (
                tuple(element.parent.name for element in constraint.elements),
                constraint.elements[0].column.table.name,
                tuple(element.column.name for element in constraint.elements),
            )
            for constraint in expected_table.foreign_key_constraints
        }
        actual_fks = {
            (
                tuple(item["constrained_columns"]),
                item["referred_table"],
                tuple(item["referred_columns"]),
            )
            for item in inspector.get_foreign_keys(table_name)
        }
        if expected_fks != actual_fks:
            errors.append(f"{table_name}: incompatible foreign keys")

        expected_unique = {
            tuple(column.name for column in constraint.columns)
            for constraint in expected_table.constraints
            if isinstance(constraint, UniqueConstraint)
        }
        actual_unique = {
            tuple(item["column_names"])
            for item in inspector.get_unique_constraints(table_name)
        }
        if expected_unique != actual_unique:
            errors.append(f"{table_name}: incompatible unique constraints")

        expected_indexes = {
            (
                index.name,
                tuple(column.name for column in index.columns),
                bool(index.unique),
            )
            for index in expected_table.indexes
        }
        actual_indexes = {
            (item["name"], tuple(item["column_names"]), bool(item["unique"]))
            for item in inspector.get_indexes(table_name)
        }
        if expected_indexes != actual_indexes:
            errors.append(f"{table_name}: incompatible indexes")

    with engine.connect() as connection:
        integrity_check = str(
            connection.exec_driver_sql("PRAGMA integrity_check").scalar_one()
        )
        foreign_key_violations = len(
            connection.exec_driver_sql("PRAGMA foreign_key_check").all()
        )
    if integrity_check.lower() != "ok":
        errors.append("SQLite integrity_check did not return ok")

    current = current_alembic_revision(engine)
    expected_revision = expected_alembic_revision()
    if current not in {None, expected_revision}:
        errors.append("unexpected Alembic revision")
    return SchemaValidation(
        compatible=not errors,
        errors=tuple(errors),
        integrity_check=integrity_check,
        foreign_key_violations=foreign_key_violations,
        current_revision=current,
        expected_revision=expected_revision,
    )


def _normalized_server_default(value: Any) -> str | None:
    if value is None:
        return None
    raw = getattr(value, "arg", value)
    normalized = str(raw).strip()
    while normalized.startswith("(") and normalized.endswith(")"):
        normalized = normalized[1:-1].strip()
    if (
        len(normalized) >= 2
        and normalized[0] == normalized[-1]
        and normalized[0] in {"'", '"'}
    ):
        normalized = normalized[1:-1]
    return normalized


def _compatible_type(expected: Any, actual: Any) -> bool:
    if isinstance(expected, Text):
        return isinstance(actual, Text)
    if isinstance(expected, String):
        return (
            isinstance(actual, String)
            and not isinstance(actual, Text)
            and expected.length == actual.length
        )
    if isinstance(expected, Boolean):
        return isinstance(actual, Boolean)
    if isinstance(expected, Integer):
        return isinstance(actual, Integer)
    if isinstance(expected, Float):
        return isinstance(actual, Float)
    if isinstance(expected, DateTime):
        return isinstance(actual, DateTime)
    if isinstance(expected, Date):
        return isinstance(actual, Date)
    if isinstance(expected, LargeBinary):
        return isinstance(actual, LargeBinary)
    return False


def _guard_original_database(path: Path, *, confirm_original: bool) -> None:
    default_path = (APP_ROOT / "data" / "itss_dashboard.db").resolve(strict=False)
    if path == default_path and not confirm_original:
        raise ConfigurationError(
            "Refusing the default local database path without --confirm-original."
        )


def _default_backup_path(path: Path) -> Path:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return path.with_name(f"{path.name}.pre-alembic-{stamp}.bak")


def _backup_sqlite_database(source: Path, target: Path) -> None:
    source_uri = source.resolve().as_uri() + "?mode=ro"
    with (
        sqlite3.connect(source_uri, uri=True) as source_connection,
        sqlite3.connect(target) as target_connection,
    ):
        source_connection.backup(target_connection)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Validate and safely stamp an existing SQLite database."
    )
    parser.add_argument("--database", required=True, type=Path)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--backup-path", type=Path)
    parser.add_argument("--confirm-original", action="store_true")
    args = parser.parse_args()
    try:
        result = adopt_sqlite_database(
            args.database,
            apply=args.apply,
            backup_path=args.backup_path,
            confirm_original=args.confirm_original,
        )
    except ConfigurationError as exc:
        print(
            json.dumps(
                {"status": "failed", "error": str(exc)},
                indent=2,
                sort_keys=True,
            )
        )
        raise SystemExit(2) from None
    print(json.dumps(asdict(result), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
