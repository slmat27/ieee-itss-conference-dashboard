from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
from collections.abc import Iterable, Mapping
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

from alembic import command
from sqlalchemy import Connection, Engine, and_, func, inspect, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.engine import make_url

from .config import AppSettings, ConfigurationError
from .dashboard import Base
from .database import (
    build_alembic_config,
    create_database_engine,
    create_sqlite_readonly_engine,
    current_alembic_revision,
    expected_alembic_revision,
    is_mariadb_url,
)
from .database_adoption import validate_sqlite_baseline

FILE_CATEGORIES = ("documents", "vectors", "templates", "imports", "exports", "runs")
KNOWN_LOCAL_COUNTS = {
    "conferences": 61,
    "issues": 7,
    "documents": 10,
    "import_batches": 13,
    "contacts": 351,
    "conference_milestones": 610,
    "monthly_snapshots": 1_681,
    "score_history": 7_499,
}
BATCH_SIZE = 100


def migrate_sqlite_database(
    *,
    source_path: Path,
    target_database_url: str,
    apply: bool = False,
    resume: bool = False,
    file_pairs: Mapping[str, tuple[Path, Path]] | None = None,
    verify_known_local_counts: bool = False,
    allow_sqlite_target_for_tests: bool = False,
) -> dict[str, Any]:
    source_validation = validate_sqlite_baseline(source_path)
    source_path = source_path.expanduser().resolve(strict=True)
    source_engine = create_sqlite_readonly_engine(source_path)
    target_settings = AppSettings.from_env(
        environ={"APP_ENV": "test", "DATABASE_URL": target_database_url}
    )
    target_url = make_url(target_database_url)
    if not is_mariadb_url(target_url) and not allow_sqlite_target_for_tests:
        source_engine.dispose()
        raise ConfigurationError(
            "The migration target must be MariaDB through mysql+pymysql or "
            "mariadb+pymysql."
        )
    target_engine = create_database_engine(target_settings)

    try:
        source_metrics = collect_database_metrics(source_engine)
        source_fk_violations = foreign_key_violations(source_engine)
        source_pk_duplicates = primary_key_duplicate_counts(source_engine)
        file_plan = plan_file_migration(file_pairs or {}, resume=resume)
        try:
            target_state = inspect_target(target_engine)
        except SQLAlchemyError:
            return {
                "mode": "apply" if apply else "dry-run",
                "status": "blocked",
                "source": {
                    "schema_compatible": source_validation.compatible,
                    "integrity_check": source_validation.integrity_check,
                    "foreign_key_violations": source_fk_violations,
                    "primary_key_duplicate_counts": source_pk_duplicates,
                    "metrics": source_metrics,
                },
                "target": {
                    "schema": "unavailable",
                    "revision": None,
                    "has_data": None,
                    "row_counts": {},
                },
                "files": file_plan,
                "errors": [
                    "target database connectivity or schema inspection failed"
                ],
            }

        errors = list(source_validation.errors)
        if source_validation.integrity_check.lower() != "ok":
            errors.append("source SQLite integrity check failed")
        if source_fk_violations:
            errors.append("source contains foreign-key violations")
        if any(source_pk_duplicates.values()):
            errors.append("source contains duplicate primary keys")
        if verify_known_local_counts:
            for table_name, expected in KNOWN_LOCAL_COUNTS.items():
                actual = source_metrics["tables"][table_name]["row_count"]
                if actual != expected:
                    errors.append(
                        f"{table_name} count is {actual}; expected {expected}"
                    )
        if target_state["schema"] == "incompatible":
            errors.append("target schema is incomplete or incompatible")
        if (
            target_state["schema"] == "current"
            and target_state["has_data"]
            and not resume
        ):
            errors.append("target database is non-empty; use reviewed resume mode")
        errors.extend(file_plan["errors"])

        report: dict[str, Any] = {
            "mode": "apply" if apply else "dry-run",
            "status": "blocked" if errors else "ready",
            "source": {
                "schema_compatible": source_validation.compatible,
                "integrity_check": source_validation.integrity_check,
                "foreign_key_violations": source_fk_violations,
                "primary_key_duplicate_counts": source_pk_duplicates,
                "metrics": source_metrics,
            },
            "target": target_state,
            "files": file_plan,
            "errors": errors,
        }
        if not apply or errors:
            return report

        try:
            if target_state["schema"] == "absent":
                command.upgrade(build_alembic_config(target_settings), "head")
            _copy_database_rows(
                source_engine,
                target_engine,
                resume=resume,
            )
            _copy_file_trees(file_plan, resume=resume)
        except ConfigurationError as exc:
            report["status"] = "failed"
            report["errors"] = [*report["errors"], str(exc)]
            report["target"] = inspect_target(target_engine)
            return report
        except SQLAlchemyError:
            report["status"] = "failed"
            report["errors"] = [
                *report["errors"],
                "Database migration operation failed; no row values or credentials "
                "were included in this report.",
            ]
            return report

        try:
            target_metrics = collect_database_metrics(target_engine)
            target_fk_violations = foreign_key_violations(target_engine)
            target_pk_duplicates = primary_key_duplicate_counts(target_engine)
            reconciliation_errors = compare_metrics(source_metrics, target_metrics)
            if target_fk_violations:
                reconciliation_errors.append(
                    "target contains foreign-key violations"
                )
            if any(target_pk_duplicates.values()):
                reconciliation_errors.append(
                    "target contains duplicate primary keys"
                )
            if reconciliation_errors:
                report["status"] = "failed"
                report["errors"] = reconciliation_errors
            else:
                report["status"] = "completed"
            report["target"] = {
                **inspect_target(target_engine),
                "foreign_key_violations": target_fk_violations,
                "primary_key_duplicate_counts": target_pk_duplicates,
                "metrics": target_metrics,
            }
        except SQLAlchemyError:
            report["status"] = "failed"
            report["errors"] = [
                "Post-migration reconciliation failed; no row values or "
                "credentials were included in this report."
            ]
        return report
    finally:
        source_engine.dispose()
        target_engine.dispose()


def inspect_target(engine: Engine) -> dict[str, Any]:
    inspector = inspect(engine)
    expected_tables = set(Base.metadata.tables)
    actual_tables = set(inspector.get_table_names())
    actual_views = set(inspector.get_view_names())
    revision = current_alembic_revision(engine)
    application_tables = actual_tables - {"alembic_version"}
    if not actual_tables and not actual_views:
        return {
            "schema": "absent",
            "revision": None,
            "has_data": False,
            "row_counts": {},
        }
    if application_tables != expected_tables or actual_views:
        return {
            "schema": "incompatible",
            "revision": revision,
            "has_data": bool(application_tables or actual_views),
            "row_counts": {},
        }
    if revision != expected_alembic_revision():
        return {
            "schema": "incompatible",
            "revision": revision,
            "has_data": True,
            "row_counts": {},
        }
    with engine.connect() as connection:
        counts = {
            table.name: int(
                connection.execute(select(func.count()).select_from(table)).scalar_one()
            )
            for table in Base.metadata.sorted_tables
        }
    return {
        "schema": "current",
        "revision": revision,
        "has_data": any(counts.values()),
        "row_counts": counts,
    }


def collect_database_metrics(bind: Engine | Connection) -> dict[str, Any]:
    tables: dict[str, Any] = {}
    connection_context = (
        bind.connect() if isinstance(bind, Engine) else _existing_connection(bind)
    )
    with connection_context as connection:
        for table in Base.metadata.sorted_tables:
            rows = list(
                connection.execute(
                    select(table).order_by(*table.primary_key.columns)
                ).mappings()
            )
            digest = hashlib.sha256()
            null_counts = {column.name: 0 for column in table.columns}
            for row in rows:
                normalized = []
                for column in table.columns:
                    value = row[column.name]
                    if value is None:
                        null_counts[column.name] += 1
                    normalized.append(_normalize_value(value))
                digest.update(
                    json.dumps(
                        normalized,
                        ensure_ascii=False,
                        separators=(",", ":"),
                    ).encode("utf-8")
                )
                digest.update(b"\n")
            tables[table.name] = {
                "row_count": len(rows),
                "null_counts": null_counts,
                "checksum": digest.hexdigest(),
            }
    return {"tables": tables}


def foreign_key_violations(bind: Engine | Connection) -> list[dict[str, Any]]:
    violations: list[dict[str, Any]] = []
    connection_context = (
        bind.connect() if isinstance(bind, Engine) else _existing_connection(bind)
    )
    with connection_context as connection:
        for table in Base.metadata.sorted_tables:
            for constraint in table.foreign_key_constraints:
                elements = list(constraint.elements)
                parent = elements[0].column.table
                parent_alias = parent.alias(f"{parent.name}_fk_parent")
                join_condition = and_(
                    *[
                        element.parent == parent_alias.c[element.column.name]
                        for element in elements
                    ]
                )
                child_present = and_(
                    *[element.parent.is_not(None) for element in elements]
                )
                parent_missing = parent_alias.c[elements[0].column.name].is_(None)
                count = int(
                    connection.execute(
                        select(func.count())
                        .select_from(table.outerjoin(parent_alias, join_condition))
                        .where(child_present, parent_missing)
                    ).scalar_one()
                )
                if count:
                    violations.append(
                        {
                            "table": table.name,
                            "target_table": parent.name,
                            "columns": [element.parent.name for element in elements],
                            "count": count,
                        }
                    )
    return violations


def primary_key_duplicate_counts(
    bind: Engine | Connection,
) -> dict[str, int]:
    duplicates: dict[str, int] = {}
    connection_context = (
        bind.connect() if isinstance(bind, Engine) else _existing_connection(bind)
    )
    with connection_context as connection:
        for table in Base.metadata.sorted_tables:
            primary_key = list(table.primary_key.columns)
            grouped = (
                select(*primary_key)
                .group_by(*primary_key)
                .having(func.count() > 1)
                .subquery()
            )
            duplicates[table.name] = int(
                connection.execute(
                    select(func.count()).select_from(grouped)
                ).scalar_one()
            )
    return duplicates


def compare_metrics(source: dict[str, Any], target: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    for table_name, source_table in source["tables"].items():
        target_table = target["tables"].get(table_name)
        if target_table is None:
            errors.append(f"target is missing table metrics for {table_name}")
            continue
        if source_table["row_count"] != target_table["row_count"]:
            errors.append(f"{table_name} row count mismatch")
        if source_table["null_counts"] != target_table["null_counts"]:
            errors.append(f"{table_name} null distribution mismatch")
        if source_table["checksum"] != target_table["checksum"]:
            errors.append(f"{table_name} deterministic checksum mismatch")
    return errors


def plan_file_migration(
    file_pairs: Mapping[str, tuple[Path, Path]],
    *,
    resume: bool,
) -> dict[str, Any]:
    errors: list[str] = []
    categories: dict[str, Any] = {}
    for name, pair in file_pairs.items():
        if name not in FILE_CATEGORIES:
            errors.append(f"unknown file category {name}")
            continue
        source, target = pair
        source = source.expanduser().resolve(strict=False)
        target = target.expanduser().resolve(strict=False)
        if not source.is_dir():
            errors.append(f"{name} source directory is unavailable")
            continue
        if target.exists() and not target.is_dir():
            errors.append(f"{name} target path is not a directory")
            continue
        if (
            source == target
            or target.is_relative_to(source)
            or source.is_relative_to(target)
        ):
            errors.append(f"{name} source and target directories must not overlap")
            continue
        files = [item for item in source.rglob("*") if item.is_file()]
        conflicts = 0
        identical = 0
        for source_file in files:
            target_file = target / source_file.relative_to(source)
            if target_file.exists():
                if _file_checksum(source_file) == _file_checksum(target_file):
                    identical += 1
                else:
                    conflicts += 1
        if target.exists() and any(target.rglob("*")) and not resume:
            errors.append(f"{name} target directory is non-empty")
        if conflicts:
            errors.append(f"{name} target contains conflicting files")
        categories[name] = {
            "source": source,
            "target": target,
            "file_count": len(files),
            "total_bytes": sum(item.stat().st_size for item in files),
            "identical_existing_files": identical,
            "conflicts": conflicts,
        }
    return {"categories": categories, "errors": errors}


def write_reports(report: dict[str, Any], report_dir: Path) -> tuple[Path, Path]:
    report_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    json_path = report_dir / f"sqlite-to-mariadb-{stamp}.migration-report.json"
    text_path = report_dir / f"sqlite-to-mariadb-{stamp}.migration-report.txt"
    safe_report = _json_safe_report(report)
    json_path.write_text(
        json.dumps(safe_report, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    lines = [
        "SQLite to MariaDB migration reconciliation",
        f"Mode: {report['mode']}",
        f"Status: {report['status']}",
        "",
        "Source row counts:",
    ]
    for table_name, metrics in report["source"]["metrics"]["tables"].items():
        lines.append(f"- {table_name}: {metrics['row_count']}")
    target_metrics = report.get("target", {}).get("metrics", {}).get("tables", {})
    if target_metrics:
        lines.extend(["", "Target row counts:"])
        for table_name, metrics in target_metrics.items():
            lines.append(f"- {table_name}: {metrics['row_count']}")
        lines.append("")
        if report["status"] == "completed":
            lines.append(
                "Reconciliation: source and target counts, null distributions, "
                "and deterministic checksums match."
            )
        else:
            lines.append(
                "Reconciliation: target metrics were recorded, but validation did "
                "not complete successfully."
            )
    errors = report.get("errors", [])
    lines.extend(["", f"Errors: {len(errors)}"])
    lines.extend(f"- {error}" for error in errors)
    text_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return json_path, text_path


def _copy_database_rows(
    source_engine: Engine,
    target_engine: Engine,
    *,
    resume: bool,
) -> None:
    with source_engine.connect() as source, target_engine.begin() as target:
        for table in Base.metadata.sorted_tables:
            rows: list[Mapping[str, Any]] = [
                dict(row)
                for row in source.execute(
                    select(table).order_by(*table.primary_key.columns)
                ).mappings()
            ]
            if table.name == "conferences":
                rows = _parent_first_conferences(rows)
            if resume:
                rows = _rows_missing_from_target(target, table, rows)
            for batch in _batches(rows, BATCH_SIZE):
                target.execute(table.insert(), [dict(row) for row in batch])

        source_metrics = collect_database_metrics(source)
        target_metrics = collect_database_metrics(target)
        reconciliation_errors = compare_metrics(source_metrics, target_metrics)
        if reconciliation_errors:
            raise ConfigurationError(
                "Database reconciliation failed before commit: "
                + "; ".join(reconciliation_errors[:5])
            )
        if foreign_key_violations(target):
            raise ConfigurationError(
                "Target foreign-key validation failed before commit."
            )


def _rows_missing_from_target(
    connection: Connection,
    table: Any,
    source_rows: list[Mapping[str, Any]],
) -> list[Mapping[str, Any]]:
    primary_key = list(table.primary_key.columns)
    target_rows: list[Mapping[str, Any]] = [
        dict(row)
        for row in connection.execute(select(table).order_by(*primary_key)).mappings()
    ]
    source_by_key = {_row_key(row, primary_key): row for row in source_rows}
    target_by_key = {_row_key(row, primary_key): row for row in target_rows}
    extra_keys = target_by_key.keys() - source_by_key.keys()
    if extra_keys:
        raise ConfigurationError(
            f"Resume refused because target table {table.name} has rows absent "
            "from the source."
        )
    for key in target_by_key.keys() & source_by_key.keys():
        if _row_digest(target_by_key[key], table) != _row_digest(
            source_by_key[key], table
        ):
            raise ConfigurationError(
                f"Resume refused because target table {table.name} differs "
                "from the source."
            )
    return [row for key, row in source_by_key.items() if key not in target_by_key]


def _parent_first_conferences(
    rows: list[Mapping[str, Any]],
) -> list[Mapping[str, Any]]:
    by_id = {str(row["id"]): row for row in rows}
    ordered: list[Mapping[str, Any]] = []
    visited: set[str] = set()
    visiting: set[str] = set()

    def visit(identifier: str) -> None:
        if identifier in visited:
            return
        if identifier in visiting:
            raise ConfigurationError("Conference parent relationships contain a cycle.")
        visiting.add(identifier)
        row = by_id[identifier]
        parent = row["parent_conference_id"]
        if parent is not None:
            parent_id = str(parent)
            if parent_id not in by_id:
                raise ConfigurationError(
                    "Conference parent relationship references a missing row."
                )
            visit(parent_id)
        visiting.remove(identifier)
        visited.add(identifier)
        ordered.append(row)

    for identifier in sorted(by_id):
        visit(identifier)
    return ordered


def _copy_file_trees(plan: dict[str, Any], *, resume: bool) -> None:
    for category in plan["categories"].values():
        source: Path = category["source"]
        target: Path = category["target"]
        for source_file in (item for item in source.rglob("*") if item.is_file()):
            target_file = target / source_file.relative_to(source)
            if target_file.exists():
                if resume and _file_checksum(source_file) == _file_checksum(
                    target_file
                ):
                    continue
                raise ConfigurationError("File migration target conflict detected.")
            target_file.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source_file, target_file)


def _normalize_value(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, bool)):
        return value
    if isinstance(value, float):
        return format(value, ".17g")
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, (bytes, bytearray, memoryview)):
        raw = bytes(value)
        return {
            "bytes": hashlib.sha256(raw).hexdigest(),
            "length": len(raw),
        }
    return str(value)


def _row_key(row: Mapping[str, Any], columns: list[Any]) -> tuple[Any, ...]:
    return tuple(row[column.name] for column in columns)


def _row_digest(row: Mapping[str, Any], table: Any) -> str:
    values = [_normalize_value(row[column.name]) for column in table.columns]
    return hashlib.sha256(
        json.dumps(values, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


def _file_checksum(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _batches(rows: list[Any], size: int) -> Iterable[list[Any]]:
    for start in range(0, len(rows), size):
        yield rows[start : start + size]


class _existing_connection:
    def __init__(self, connection: Connection):
        self.connection = connection

    def __enter__(self) -> Connection:
        return self.connection

    def __exit__(self, *_args: Any) -> None:
        return None


def _json_safe_report(report: dict[str, Any]) -> dict[str, Any]:
    safe = json.loads(
        json.dumps(
            report,
            default=lambda value: value.name if isinstance(value, Path) else str(value),
        )
    )
    for category in safe.get("files", {}).get("categories", {}).values():
        category.pop("source", None)
        category.pop("target", None)
    return safe


def _file_pairs_from_args(args: argparse.Namespace) -> dict[str, tuple[Path, Path]]:
    pairs: dict[str, tuple[Path, Path]] = {}
    for name in FILE_CATEGORIES:
        source = getattr(args, f"{name}_source")
        target = getattr(args, f"{name}_target")
        if bool(source) != bool(target):
            raise ConfigurationError(
                f"--{name}-source and --{name}-target must be supplied together."
            )
        if source and target:
            pairs[name] = (source, target)
    return pairs


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Safely migrate a SQLite dashboard database to MariaDB."
    )
    parser.add_argument("--source", required=True, type=Path)
    target_group = parser.add_mutually_exclusive_group()
    target_group.add_argument("--target-database-url")
    target_group.add_argument(
        "--target-database-url-env",
        default="DATABASE_URL",
    )
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--verify-known-local-counts", action="store_true")
    parser.add_argument(
        "--report-dir",
        type=Path,
        default=Path("migration-reports"),
    )
    for name in FILE_CATEGORIES:
        parser.add_argument(f"--{name}-source", type=Path)
        parser.add_argument(f"--{name}-target", type=Path)
    args = parser.parse_args()

    target_url = args.target_database_url
    if target_url is None:
        target_url = os.environ.get(args.target_database_url_env, "").strip()
    if not target_url:
        raise ConfigurationError(
            "Supply --target-database-url or a populated target URL environment "
            "variable."
        )
    try:
        report = migrate_sqlite_database(
            source_path=args.source,
            target_database_url=target_url,
            apply=args.apply,
            resume=args.resume,
            file_pairs=_file_pairs_from_args(args),
            verify_known_local_counts=args.verify_known_local_counts,
        )
    except ConfigurationError as exc:
        report = {
            "mode": "apply" if args.apply else "dry-run",
            "status": "failed",
            "source": {"metrics": {"tables": {}}},
            "target": {"schema": "unknown", "row_counts": {}},
            "files": {"categories": {}, "errors": []},
            "errors": [str(exc)],
        }
    json_path, text_path = write_reports(report, args.report_dir)
    print(
        json.dumps(
            {
                "status": report["status"],
                "machine_report": str(json_path),
                "human_report": str(text_path),
            },
            indent=2,
        )
    )
    if report["status"] in {"blocked", "failed"}:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
