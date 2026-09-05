"""baseline schema

Revision ID: dd20ec3dadff
Revises:
Create Date: 2026-09-05 16:03:50.926814
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision: str = "dd20ec3dadff"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

PORTABLE_BINARY = (
    sa.LargeBinary()
    .with_variant(mysql.LONGBLOB(), "mysql")
    .with_variant(mysql.LONGBLOB(), "mariadb")
)
PORTABLE_DATETIME = (
    sa.DateTime()
    .with_variant(mysql.DATETIME(fsp=6), "mysql")
    .with_variant(mysql.DATETIME(fsp=6), "mariadb")
)
PORTABLE_FLOAT = (
    sa.Float()
    .with_variant(mysql.DOUBLE(asdecimal=False), "mysql")
    .with_variant(mysql.DOUBLE(asdecimal=False), "mariadb")
)
PORTABLE_TEXT = (
    sa.Text()
    .with_variant(mysql.LONGTEXT(), "mysql")
    .with_variant(mysql.LONGTEXT(), "mariadb")
)


def upgrade() -> None:
    # Reviewed against ORM metadata and a copied existing SQLite schema.
    op.create_table(
        "conferences",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("conference_number", sa.String(length=64), nullable=True),
        sa.Column("acronym", sa.String(length=24), nullable=False),
        sa.Column("normalized_acronym", sa.String(length=24), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("official_title", sa.String(length=500), nullable=False),
        sa.Column("canonical_name", sa.String(length=64), nullable=False),
        sa.Column("conference_series", sa.String(length=160), nullable=False),
        sa.Column("conference_category", sa.String(length=80), nullable=False),
        sa.Column("sponsorship_type", sa.String(length=80), nullable=False),
        sa.Column("parent_conference_id", sa.String(length=36), nullable=True),
        sa.Column("lifecycle_phase", sa.String(length=120), nullable=False),
        sa.Column("suggested_phase", sa.String(length=120), nullable=False),
        sa.Column("phase_override", sa.Boolean(), nullable=False),
        sa.Column("conference_status", sa.String(length=80), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("submission_deadline", sa.Date(), nullable=True),
        sa.Column("notification_date", sa.Date(), nullable=True),
        sa.Column("camera_ready_deadline", sa.Date(), nullable=True),
        sa.Column("city", sa.String(length=120), nullable=True),
        sa.Column("state_province", sa.String(length=120), nullable=True),
        sa.Column("country", sa.String(length=120), nullable=True),
        sa.Column("ieee_region", sa.String(length=40), nullable=True),
        sa.Column("venue", sa.String(length=240), nullable=True),
        sa.Column("website", sa.String(length=400), nullable=True),
        sa.Column("estimated_attendees", sa.Integer(), nullable=True),
        sa.Column("actual_attendees", sa.Integer(), nullable=True),
        sa.Column("estimated_paper_submissions", sa.Integer(), nullable=True),
        sa.Column("actual_paper_submissions", sa.Integer(), nullable=True),
        sa.Column("last_reviewed_date", sa.Date(), nullable=True),
        sa.Column("comments", PORTABLE_TEXT, nullable=True),
        sa.Column("project_code", sa.String(length=80), nullable=True),
        sa.Column("project_indicator", sa.String(length=80), nullable=True),
        sa.Column("financial_analyst", sa.String(length=160), nullable=True),
        sa.Column("committee_contact", sa.String(length=160), nullable=True),
        sa.Column("application_status_raw", sa.String(length=160), nullable=True),
        sa.Column("application_status", sa.String(length=80), nullable=False),
        sa.Column("application_submitted_date", sa.Date(), nullable=True),
        sa.Column("application_approved_date", sa.Date(), nullable=True),
        sa.Column("mou_status_raw", sa.String(length=160), nullable=True),
        sa.Column("mou_status", sa.String(length=80), nullable=False),
        sa.Column("mou_signed_date", sa.Date(), nullable=True),
        sa.Column("finance_status", sa.String(length=80), nullable=False),
        sa.Column("currency", sa.String(length=12), nullable=True),
        sa.Column("total_income_current", PORTABLE_FLOAT, nullable=True),
        sa.Column("total_expense_current", PORTABLE_FLOAT, nullable=True),
        sa.Column("budgeted_income_total", PORTABLE_FLOAT, nullable=True),
        sa.Column("budgeted_expense_total", PORTABLE_FLOAT, nullable=True),
        sa.Column(
            "itss_loan_requested",
            sa.Boolean(),
            server_default=sa.text("0"),
            nullable=True,
        ),
        sa.Column("itss_loan_amount", PORTABLE_FLOAT, nullable=True),
        sa.Column("accounting_close_date", sa.Date(), nullable=True),
        sa.Column("publication_status", sa.String(length=80), nullable=False),
        sa.Column("proceedings_submitted_date", sa.Date(), nullable=True),
        sa.Column("xplore_posting_date", sa.Date(), nullable=True),
        sa.Column("last_source_update", sa.Date(), nullable=True),
        sa.Column(
            "source_details_json",
            PORTABLE_TEXT,
            server_default=sa.text("'{}'"),
            nullable=True,
        ),
        sa.Column("score", PORTABLE_FLOAT, nullable=False),
        sa.Column("base_score", PORTABLE_FLOAT, nullable=False),
        sa.Column("issue_penalty", PORTABLE_FLOAT, nullable=False),
        sa.Column("data_completeness", PORTABLE_FLOAT, nullable=False),
        sa.Column("status_band", sa.String(length=80), nullable=False),
        sa.Column("score_details_json", PORTABLE_TEXT, nullable=False),
        sa.Column("created_at", PORTABLE_DATETIME, nullable=False),
        sa.Column("updated_at", PORTABLE_DATETIME, nullable=False),
        sa.ForeignKeyConstraint(
            ["parent_conference_id"],
            ["conferences.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("conference_number", name="uq_conference_number"),
        sa.UniqueConstraint(
            "normalized_acronym",
            "year",
            "parent_conference_id",
            name="uq_acronym_year_parent",
        ),
    )
    with op.batch_alter_table("conferences", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_conferences_acronym"), ["acronym"], unique=False
        )
        batch_op.create_index(
            batch_op.f("ix_conferences_active"), ["active"], unique=False
        )
        batch_op.create_index(
            batch_op.f("ix_conferences_canonical_name"),
            ["canonical_name"],
            unique=False,
        )
        batch_op.create_index(
            batch_op.f("ix_conferences_conference_series"),
            ["conference_series"],
            unique=False,
        )
        batch_op.create_index(
            batch_op.f("ix_conferences_normalized_acronym"),
            ["normalized_acronym"],
            unique=False,
        )
        batch_op.create_index(
            batch_op.f("ix_conferences_sponsorship_type"),
            ["sponsorship_type"],
            unique=False,
        )
        batch_op.create_index(batch_op.f("ix_conferences_year"), ["year"], unique=False)

    op.create_table(
        "dashboard_settings",
        sa.Column("key", sa.String(length=120), nullable=False),
        sa.Column("value_json", PORTABLE_TEXT, nullable=False),
        sa.PrimaryKeyConstraint("key"),
    )
    op.create_table(
        "import_batches",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("original_filename", sa.String(length=260), nullable=False),
        sa.Column("file_type", sa.String(length=20), nullable=False),
        sa.Column("file_hash", sa.String(length=64), nullable=False),
        sa.Column("report_date", sa.Date(), nullable=True),
        sa.Column("upload_date", PORTABLE_DATETIME, nullable=False),
        sa.Column("import_status", sa.String(length=80), nullable=False),
        sa.Column("rows_count", sa.Integer(), nullable=False),
        sa.Column("new_count", sa.Integer(), nullable=False),
        sa.Column("changed_count", sa.Integer(), nullable=False),
        sa.Column("unchanged_count", sa.Integer(), nullable=False),
        sa.Column("conflict_count", sa.Integer(), nullable=False),
        sa.Column("notes", PORTABLE_TEXT, nullable=True),
        sa.Column("preview_json", PORTABLE_TEXT, nullable=False),
        sa.Column(
            "file_data",
            PORTABLE_BINARY,
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("import_batches", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_import_batches_file_hash"), ["file_hash"], unique=False
        )

    op.create_table(
        "milestone_definitions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("code", sa.String(length=40), nullable=False),
        sa.Column("name", sa.String(length=240), nullable=False),
        sa.Column("description", PORTABLE_TEXT, nullable=False),
        sa.Column("score_dimension", sa.String(length=120), nullable=False),
        sa.Column("default_weight", PORTABLE_FLOAT, nullable=False),
        sa.Column("applicable_sponsorship_types_json", PORTABLE_TEXT, nullable=False),
        sa.Column("applicable_series_json", PORTABLE_TEXT, nullable=False),
        sa.Column("required_lifecycle_phase", sa.String(length=120), nullable=True),
        sa.Column("due_days_from_start", sa.Integer(), nullable=False),
        sa.Column("mandatory", sa.Boolean(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )
    op.create_table(
        "status_mappings",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("source_value", sa.String(length=160), nullable=False),
        sa.Column("normalized_value", sa.String(length=80), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source_value"),
    )
    op.create_table(
        "template_files",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("template_name", sa.String(length=260), nullable=False),
        sa.Column("short_description", PORTABLE_TEXT, nullable=False),
        sa.Column("category", sa.String(length=120), nullable=False),
        sa.Column("template_type", sa.String(length=80), nullable=False),
        sa.Column("file_name", sa.String(length=260), nullable=False),
        sa.Column("original_filename", sa.String(length=260), nullable=False),
        sa.Column(
            "file_data",
            PORTABLE_BINARY,
            nullable=True,
        ),
        sa.Column("upload_date", PORTABLE_DATETIME, nullable=False),
        sa.Column("updated_at", PORTABLE_DATETIME, nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("template_files", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_template_files_category"), ["category"], unique=False
        )

    op.create_table(
        "conference_aliases",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("conference_id", sa.String(length=36), nullable=False),
        sa.Column("alias", sa.String(length=240), nullable=False),
        sa.Column("alias_type", sa.String(length=80), nullable=False),
        sa.Column("source", sa.String(length=160), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(
            ["conference_id"],
            ["conferences.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("conference_aliases", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_conference_aliases_alias"), ["alias"], unique=False
        )
        batch_op.create_index(
            batch_op.f("ix_conference_aliases_conference_id"),
            ["conference_id"],
            unique=False,
        )

    op.create_table(
        "conference_comments",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("conference_id", sa.String(length=36), nullable=False),
        sa.Column("comment", PORTABLE_TEXT, nullable=False),
        sa.Column("author", sa.String(length=160), nullable=False),
        sa.Column("created_at", PORTABLE_DATETIME, nullable=False),
        sa.Column("updated_at", PORTABLE_DATETIME, nullable=False),
        sa.ForeignKeyConstraint(
            ["conference_id"],
            ["conferences.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("conference_comments", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_conference_comments_conference_id"),
            ["conference_id"],
            unique=False,
        )

    op.create_table(
        "conference_milestones",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("conference_id", sa.String(length=36), nullable=False),
        sa.Column("definition_id", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=80), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("completed_date", sa.Date(), nullable=True),
        sa.Column("manual_override", sa.Boolean(), nullable=False),
        sa.Column("comments", PORTABLE_TEXT, nullable=True),
        sa.Column("source", sa.String(length=80), nullable=False),
        sa.Column("last_updated", PORTABLE_DATETIME, nullable=False),
        sa.ForeignKeyConstraint(
            ["conference_id"],
            ["conferences.id"],
        ),
        sa.ForeignKeyConstraint(
            ["definition_id"],
            ["milestone_definitions.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("conference_id", "definition_id", name="uq_conf_milestone"),
    )
    with op.batch_alter_table("conference_milestones", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_conference_milestones_conference_id"),
            ["conference_id"],
            unique=False,
        )
        batch_op.create_index(
            batch_op.f("ix_conference_milestones_definition_id"),
            ["definition_id"],
            unique=False,
        )

    op.create_table(
        "contacts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("conference_id", sa.String(length=36), nullable=False),
        sa.Column("role", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("email", sa.String(length=240), nullable=True),
        sa.Column("organization", sa.String(length=240), nullable=True),
        sa.Column("phone", sa.String(length=80), nullable=True),
        sa.Column("is_primary", sa.Boolean(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(
            ["conference_id"],
            ["conferences.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("contacts", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_contacts_conference_id"), ["conference_id"], unique=False
        )

    op.create_table(
        "dashboard_pins",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("conference_id", sa.String(length=36), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False),
        sa.Column("pin_group", sa.String(length=80), nullable=False),
        sa.Column("date_pinned", PORTABLE_DATETIME, nullable=False),
        sa.ForeignKeyConstraint(
            ["conference_id"],
            ["conferences.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("conference_id"),
    )
    op.create_table(
        "documents",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=260), nullable=False),
        sa.Column("file_name", sa.String(length=260), nullable=False),
        sa.Column("document_category", sa.String(length=120), nullable=False),
        sa.Column("knowledge_scope", sa.String(length=120), nullable=False),
        sa.Column("conference_id", sa.String(length=36), nullable=True),
        sa.Column("conference_series", sa.String(length=160), nullable=True),
        sa.Column("version", sa.String(length=80), nullable=True),
        sa.Column("effective_date", sa.Date(), nullable=True),
        sa.Column("source_url", sa.String(length=500), nullable=True),
        sa.Column("upload_date", PORTABLE_DATETIME, nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("extraction_state", sa.String(length=80), nullable=False),
        sa.Column("indexing_state", sa.String(length=80), nullable=False),
        sa.Column("page_count", sa.Integer(), nullable=False),
        sa.Column("chunk_count", sa.Integer(), nullable=False),
        sa.Column("metadata_json", PORTABLE_TEXT, nullable=False),
        sa.Column("extracted_text", PORTABLE_TEXT, nullable=False),
        sa.ForeignKeyConstraint(
            ["conference_id"],
            ["conferences.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "email_drafts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("conference_id", sa.String(length=36), nullable=False),
        sa.Column("related_issues_json", PORTABLE_TEXT, nullable=False),
        sa.Column("recipient_names", PORTABLE_TEXT, nullable=False),
        sa.Column("recipient_addresses", PORTABLE_TEXT, nullable=False),
        sa.Column("cc_addresses", PORTABLE_TEXT, nullable=False),
        sa.Column("subject", sa.String(length=260), nullable=False),
        sa.Column("body", PORTABLE_TEXT, nullable=False),
        sa.Column("tone", sa.String(length=80), nullable=False),
        sa.Column(
            "generator",
            sa.String(length=80),
            server_default=sa.text("'Local composer'"),
            nullable=True,
        ),
        sa.Column("created_at", PORTABLE_DATETIME, nullable=False),
        sa.Column("updated_at", PORTABLE_DATETIME, nullable=False),
        sa.Column("saved", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(
            ["conference_id"],
            ["conferences.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("email_drafts", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_email_drafts_conference_id"), ["conference_id"], unique=False
        )

    op.create_table(
        "field_change_history",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("conference_id", sa.String(length=36), nullable=False),
        sa.Column("entity", sa.String(length=80), nullable=False),
        sa.Column("field_name", sa.String(length=120), nullable=False),
        sa.Column("old_value", PORTABLE_TEXT, nullable=True),
        sa.Column("new_value", PORTABLE_TEXT, nullable=True),
        sa.Column("change_type", sa.String(length=80), nullable=False),
        sa.Column("source", sa.String(length=160), nullable=False),
        sa.Column("import_batch_id", sa.String(length=36), nullable=True),
        sa.Column("timestamp", PORTABLE_DATETIME, nullable=False),
        sa.Column("comment", PORTABLE_TEXT, nullable=True),
        sa.ForeignKeyConstraint(
            ["conference_id"],
            ["conferences.id"],
        ),
        sa.ForeignKeyConstraint(
            ["import_batch_id"],
            ["import_batches.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("field_change_history", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_field_change_history_conference_id"),
            ["conference_id"],
            unique=False,
        )

    op.create_table(
        "issues",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("conference_id", sa.String(length=36), nullable=False),
        sa.Column("issue_key", sa.String(length=120), nullable=False),
        sa.Column("title", sa.String(length=240), nullable=False),
        sa.Column("description", PORTABLE_TEXT, nullable=False),
        sa.Column("category", sa.String(length=80), nullable=False),
        sa.Column("severity", sa.String(length=40), nullable=False),
        sa.Column("issue_status", sa.String(length=80), nullable=False),
        sa.Column("review_assessment", sa.String(length=80), nullable=False),
        sa.Column("source_type", sa.String(length=80), nullable=False),
        sa.Column("source_field", sa.String(length=120), nullable=True),
        sa.Column("rule_identifier", sa.String(length=120), nullable=True),
        sa.Column("owner", sa.String(length=160), nullable=True),
        sa.Column("date_detected", PORTABLE_DATETIME, nullable=False),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("last_reviewed_date", sa.Date(), nullable=True),
        sa.Column("resolution_date", sa.Date(), nullable=True),
        sa.Column("user_comment", PORTABLE_TEXT, nullable=True),
        sa.Column("ai_recommendation", PORTABLE_TEXT, nullable=True),
        sa.Column("recommendation_generated_date", PORTABLE_DATETIME, nullable=True),
        sa.Column("policy_references_json", PORTABLE_TEXT, nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(
            ["conference_id"],
            ["conferences.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("issues", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_issues_conference_id"), ["conference_id"], unique=False
        )
        batch_op.create_index(
            batch_op.f("ix_issues_issue_key"), ["issue_key"], unique=False
        )

    op.create_table(
        "monthly_snapshots",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("conference_id", sa.String(length=36), nullable=False),
        sa.Column("snapshot_timestamp", PORTABLE_DATETIME, nullable=False),
        sa.Column("payload_json", PORTABLE_TEXT, nullable=False),
        sa.ForeignKeyConstraint(
            ["conference_id"],
            ["conferences.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("monthly_snapshots", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_monthly_snapshots_conference_id"),
            ["conference_id"],
            unique=False,
        )

    op.create_table(
        "score_history",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("conference_id", sa.String(length=36), nullable=False),
        sa.Column("score", PORTABLE_FLOAT, nullable=False),
        sa.Column("data_completeness", PORTABLE_FLOAT, nullable=False),
        sa.Column("dimension_scores_json", PORTABLE_TEXT, nullable=False),
        sa.Column("created_at", PORTABLE_DATETIME, nullable=False),
        sa.ForeignKeyConstraint(
            ["conference_id"],
            ["conferences.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("score_history", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_score_history_conference_id"),
            ["conference_id"],
            unique=False,
        )

    op.create_table(
        "issue_comments",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("issue_id", sa.String(length=36), nullable=False),
        sa.Column("comment", PORTABLE_TEXT, nullable=False),
        sa.Column("author", sa.String(length=160), nullable=False),
        sa.Column("created_at", PORTABLE_DATETIME, nullable=False),
        sa.ForeignKeyConstraint(
            ["issue_id"],
            ["issues.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("issue_comments", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_issue_comments_issue_id"), ["issue_id"], unique=False
        )


def downgrade() -> None:
    with op.batch_alter_table("issue_comments", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_issue_comments_issue_id"))

    op.drop_table("issue_comments")
    with op.batch_alter_table("score_history", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_score_history_conference_id"))

    op.drop_table("score_history")
    with op.batch_alter_table("monthly_snapshots", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_monthly_snapshots_conference_id"))

    op.drop_table("monthly_snapshots")
    with op.batch_alter_table("issues", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_issues_issue_key"))
        batch_op.drop_index(batch_op.f("ix_issues_conference_id"))

    op.drop_table("issues")
    with op.batch_alter_table("field_change_history", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_field_change_history_conference_id"))

    op.drop_table("field_change_history")
    with op.batch_alter_table("email_drafts", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_email_drafts_conference_id"))

    op.drop_table("email_drafts")
    op.drop_table("documents")
    op.drop_table("dashboard_pins")
    with op.batch_alter_table("contacts", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_contacts_conference_id"))

    op.drop_table("contacts")
    with op.batch_alter_table("conference_milestones", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_conference_milestones_definition_id"))
        batch_op.drop_index(batch_op.f("ix_conference_milestones_conference_id"))

    op.drop_table("conference_milestones")
    with op.batch_alter_table("conference_comments", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_conference_comments_conference_id"))

    op.drop_table("conference_comments")
    with op.batch_alter_table("conference_aliases", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_conference_aliases_conference_id"))
        batch_op.drop_index(batch_op.f("ix_conference_aliases_alias"))

    op.drop_table("conference_aliases")
    with op.batch_alter_table("template_files", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_template_files_category"))

    op.drop_table("template_files")
    op.drop_table("status_mappings")
    op.drop_table("milestone_definitions")
    with op.batch_alter_table("import_batches", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_import_batches_file_hash"))

    op.drop_table("import_batches")
    op.drop_table("dashboard_settings")
    with op.batch_alter_table("conferences", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_conferences_year"))
        batch_op.drop_index(batch_op.f("ix_conferences_sponsorship_type"))
        batch_op.drop_index(batch_op.f("ix_conferences_normalized_acronym"))
        batch_op.drop_index(batch_op.f("ix_conferences_conference_series"))
        batch_op.drop_index(batch_op.f("ix_conferences_canonical_name"))
        batch_op.drop_index(batch_op.f("ix_conferences_active"))
        batch_op.drop_index(batch_op.f("ix_conferences_acronym"))

    op.drop_table("conferences")
