from __future__ import annotations

from typing import Any

from sqlalchemy import inspect


def ensure_database_schema(engine: Any) -> None:
    """Apply the historical additive SQLite compatibility changes locally."""

    inspector = inspect(engine)
    table_names = inspector.get_table_names()
    if "conferences" not in table_names:
        return
    columns = {column["name"] for column in inspector.get_columns("conferences")}
    additions = {
        "last_source_update": "DATE",
        "source_details_json": "TEXT DEFAULT '{}'",
        "itss_loan_requested": "BOOLEAN DEFAULT 0",
        "itss_loan_amount": "FLOAT",
        "estimated_paper_submissions": "INTEGER",
        "actual_paper_submissions": "INTEGER",
    }
    with engine.begin() as connection:
        for name, ddl_type in additions.items():
            if name not in columns:
                connection.exec_driver_sql(
                    f"ALTER TABLE conferences ADD COLUMN {name} {ddl_type}"
                )
        if "email_drafts" in table_names:
            email_columns = {
                column["name"] for column in inspector.get_columns("email_drafts")
            }
            if "generator" not in email_columns:
                connection.exec_driver_sql(
                    "ALTER TABLE email_drafts ADD COLUMN generator "
                    "VARCHAR(80) DEFAULT 'Local composer'"
                )
        if "template_files" in table_names:
            template_columns = {
                column["name"] for column in inspector.get_columns("template_files")
            }
            if "file_data" not in template_columns:
                connection.exec_driver_sql(
                    "ALTER TABLE template_files ADD COLUMN file_data BLOB"
                )
        if "import_batches" in table_names:
            import_columns = {
                column["name"] for column in inspector.get_columns("import_batches")
            }
            if "file_data" not in import_columns:
                connection.exec_driver_sql(
                    "ALTER TABLE import_batches ADD COLUMN file_data BLOB"
                )
