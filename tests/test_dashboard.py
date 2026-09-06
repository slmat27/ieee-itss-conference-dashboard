from __future__ import annotations

from datetime import date
from pathlib import Path
import io
import json
from types import SimpleNamespace

import pandas as pd
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect

from app import dashboard
from app.main import create_app


def _client(tmp_path: Path, monkeypatch) -> TestClient:
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("DATABASE_URL", "")
    monkeypatch.setenv("ALLOW_ANONYMOUS_LOCAL", "true")
    monkeypatch.setenv("APP_DATABASE_PATH", str(tmp_path / "data" / "itss_dashboard.db"))
    monkeypatch.setenv("APP_DOCUMENT_PATH", str(tmp_path / "data" / "documents"))
    monkeypatch.setenv("APP_IMPORT_PATH", str(tmp_path / "data" / "imports"))
    monkeypatch.setenv("APP_EXPORT_PATH", str(tmp_path / "data" / "exports"))
    monkeypatch.setenv("APP_VECTOR_PATH", str(tmp_path / "data" / "vector_store"))
    monkeypatch.setenv("APP_TEMPLATE_PATH", str(tmp_path / "data" / "templates"))
    monkeypatch.setenv("APP_STORAGE_DIR", str(tmp_path / "storage"))
    monkeypatch.setenv("AZURE_OPENAI_ENDPOINT", "https://example.openai.azure.com/")
    monkeypatch.setenv("AZURE_OPENAI_API_KEY", "local-test-key")
    monkeypatch.setenv("AZURE_OPENAI_API_VERSION", "2024-02-15-preview")
    monkeypatch.setenv("AZURE_OPENAI_CHAT_DEPLOYMENT", "gpt-test")
    monkeypatch.setenv("TEI_EMBEDDING_BASE_URL", "https://tei.test")
    monkeypatch.setenv("TEI_EMBEDDING_MODEL", "qwen3-test")
    monkeypatch.setattr(dashboard, "embed_texts", lambda texts: [[0.1, 0.2, 0.3] for _ in texts])
    app = create_app(storage_dir=tmp_path / "runs")
    return TestClient(app)


def test_embedding_configuration_uses_neutral_names(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("TEI_EMBEDDING_BASE_URL", "")
    monkeypatch.setenv("TEI_EMBEDDING_MODEL", "")
    monkeypatch.setenv("EMBEDDING_BASE_URL", "https://embeddings.example")
    monkeypatch.setenv("EMBEDDING_MODEL", "neutral-test-model")

    assert dashboard.embedding_base_url() == "https://embeddings.example"
    assert dashboard.embedding_model() == "neutral-test-model"
    assert dashboard.embedding_status(mask=False)["provider"] == (
        "TEI-compatible embedding service"
    )


def test_first_run_creates_database_and_reference_data(tmp_path: Path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch) as client:
        response = client.get("/api/reference-data")
        assert response.status_code == 200
        data = response.json()
        assert "ITSC" in [item["code"] for item in data["conference_series"]]
        assert "TCS" in [item["code"] for item in data["conference_series"]]
        assert "Financially Co-Sponsored" in data["sponsorship_types"]
        assert (tmp_path / "data" / "itss_dashboard.db").exists()


def test_existing_database_schema_adds_paper_submission_columns() -> None:
    engine = create_engine("sqlite://", future=True)
    with engine.begin() as connection:
        connection.exec_driver_sql("CREATE TABLE conferences (id VARCHAR PRIMARY KEY)")

    dashboard.ensure_database_schema(engine)

    columns = {column["name"] for column in inspect(engine).get_columns("conferences")}
    assert {"estimated_paper_submissions", "actual_paper_submissions"}.issubset(columns)


def test_technically_cosponsored_conferences_use_tcs_without_finance_weight(tmp_path: Path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch) as client:
        tcs_response = client.post(
            "/api/conferences",
            json={
                "conference_number": "99101",
                "acronym": "TCSA",
                "year": 2028,
                "official_title": "Technical Co-Sponsorship Test",
                "conference_series": "UNKNOWN",
                "sponsorship_type": "Technically Co-Sponsored",
                "lifecycle_phase": "Detailed Planning",
            },
        )
        assert tcs_response.status_code == 201
        tcs = tcs_response.json()
        assert tcs["conference_series"] == "TCS"
        assert tcs["finance_status"] == "Not Applicable"
        assert tcs["score_details"]["series_policy"] == {
            "conference_series": "TCS",
            "tcs_finance_weight_zero": True,
            "excluded_milestone_codes": ["BANKING", "BUDGET", "FIN_CLOSE"],
        }
        milestones = {item["code"]: item for item in tcs["score_details"]["milestones"]}
        for code in ("BUDGET", "BANKING", "FIN_CLOSE"):
            assert milestones[code]["status"] == "Not Applicable"
            assert milestones[code]["effective_weight"] == 0
            assert milestones[code]["excluded"] is True
        assert "Finance and Banking" not in tcs["score_details"]["dimension_scores"]

        financial_response = client.post(
            "/api/conferences",
            json={
                "conference_number": "99102",
                "acronym": "FINA",
                "year": 2028,
                "official_title": "Financial Sponsorship Test",
                "conference_series": "UNKNOWN",
                "sponsorship_type": "Financially Sponsored",
                "lifecycle_phase": "Detailed Planning",
            },
        )
        assert financial_response.status_code == 201
        financial = financial_response.json()
        assert financial["score_details"]["series_policy"]["tcs_finance_weight_zero"] is False
        financial_milestones = {item["code"]: item for item in financial["score_details"]["milestones"]}
        assert financial_milestones["BUDGET"]["weight"] > 0
        assert financial_milestones["BANKING"]["weight"] > 0


def test_series_editing_compact_export_and_date_timeliness(tmp_path: Path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch) as client:
        settings = client.get("/api/settings").json()
        series = settings["reference_config"]["conference_series"]
        itsc = next(item for item in series if item["code"] == "ITSC")
        itsc["name"] = "Editable ITSC Display Name"
        saved = client.patch(
            "/api/settings/reference-config",
            json={"reference_config": {"conference_series": series}},
        )
        assert saved.status_code == 200
        saved_itsc = next(
            item
            for item in saved.json()["reference_config"]["conference_series"]
            if item["code"] == "ITSC"
        )
        assert saved_itsc["name"] == "Editable ITSC Display Name"

        created = client.post(
            "/api/conferences",
            json={
                "conference_number": "99001",
                "acronym": "DATE",
                "year": 2025,
                "official_title": "Date Status Test",
                "conference_series": "ITSC",
                "sponsorship_type": "Financially Sponsored",
                "lifecycle_phase": "Detailed Planning",
                "start_date": "2025-06-27",
                "end_date": "2025-06-30",
            },
        )
        conference_id = created.json()["id"]
        updated = client.patch(
            f"/api/conferences/{conference_id}",
            json={
                "xplore_posting_date": "2025-09-10",
                "accounting_close_date": "2026-07-01",
            },
        )
        assert updated.status_code == 200
        assert updated.json()["publication_timeliness"]["state"] == "warning"
        assert updated.json()["accounting_close_timeliness"]["state"] == "late"

        exported = client.get("/api/exports/portfolio.xlsx")
        workbook = pd.ExcelFile(io.BytesIO(exported.content))
        assert workbook.sheet_names == ["Conferences", "Milestones"]
        columns = set(pd.read_excel(workbook, sheet_name="Conferences").columns)
        assert {
            "conference_number",
            "conference_series",
            "itss_loan_requested",
            "xplore_posting_date",
            "accounting_close_date",
        }.issubset(columns)
        assert "publication_comments" not in columns
        assert "finance_report_type" not in columns


def test_conference_can_be_created_and_scored(tmp_path: Path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch) as client:
        response = client.post(
            "/api/conferences",
            json={
                "acronym": "ITSC",
                "year": 2028,
                "official_title": "IEEE International Conference on Intelligent Transportation Systems",
                "conference_series": "ITSC",
                "sponsorship_type": "Flagship",
                "lifecycle_phase": "Expression of Interest",
                "city": "Berlin",
                "country": "Germany",
                "estimated_paper_submissions": 500,
                "actual_paper_submissions": 540,
                "primary_contact": "Conference Chair",
                "primary_contact_email": "chair@example.org",
            },
        )
        assert response.status_code == 201
        created = response.json()
        assert created["canonical_name"] == "ITSC 2028"
        assert created["estimated_paper_submissions"] == 500
        assert created["actual_paper_submissions"] == 540
        assert created["data_completeness"] > 0
        assert created["status_band"] in {"Provisional", "Critical", "At Risk", "Attention Needed", "On Track"}

        duplicate = client.post(
            "/api/conferences",
            json={
                "acronym": "ITSC",
                "year": 2028,
                "official_title": "Duplicate",
                "conference_series": "ITSC",
                "sponsorship_type": "Flagship",
                "lifecycle_phase": "Expression of Interest",
            },
        )
        assert duplicate.status_code == 409


def test_conferences_can_be_filtered_by_multiple_lifecycle_phases(tmp_path: Path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch) as client:
        conference_ids: dict[str, str] = {}
        for index, acronym in enumerate(("PHASEA", "PHASEB", "PHASEC"), start=1):
            response = client.post(
                "/api/conferences",
                json={
                    "conference_number": f"9930{index}",
                    "acronym": acronym,
                    "year": 2032,
                    "official_title": f"{acronym} Conference",
                    "conference_series": "Custom Conference Series",
                    "sponsorship_type": "Financially Sponsored",
                    "lifecycle_phase": "Expression of Interest",
                },
            )
            assert response.status_code == 201
            conference_ids[acronym] = response.json()["id"]

        assert dashboard._state is not None
        with dashboard._state.session_factory() as session:
            phase_a = session.get(dashboard.Conference, conference_ids["PHASEA"])
            phase_b = session.get(dashboard.Conference, conference_ids["PHASEB"])
            phase_c = session.get(dashboard.Conference, conference_ids["PHASEC"])
            phase_a.lifecycle_phase = "Conference Delivery"
            phase_a.conference_status = "On Track"
            phase_b.lifecycle_phase = "Proceedings Processing"
            phase_b.conference_status = "Attention Needed"
            phase_c.lifecycle_phase = "Detailed Planning"
            phase_c.conference_status = "Critical"
            session.commit()

        response = client.get(
            "/api/conferences",
            params=[
                ("phase", "Conference Delivery"),
                ("phase", "Proceedings Processing"),
                ("status", "On Track"),
                ("status", "Attention Needed"),
            ],
        )
        assert response.status_code == 200
        assert {item["acronym"] for item in response.json()["items"]} == {"PHASEA", "PHASEB"}


def test_ai_issue_generation_reviews_watchlist_and_skips_duplicates(tmp_path: Path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch) as client:
        conferences = {}
        for index, acronym in enumerate(("RISK", "ATTN", "TRACK"), start=1):
            response = client.post(
                "/api/conferences",
                json={
                    "conference_number": f"9920{index}",
                    "acronym": acronym,
                    "year": 2028,
                    "official_title": f"{acronym} Conference",
                    "conference_series": "Custom Conference Series",
                    "sponsorship_type": "Financially Sponsored",
                    "lifecycle_phase": "Detailed Planning",
                },
            )
            assert response.status_code == 201
            conferences[acronym] = response.json()["id"]

        assert dashboard._state is not None
        with dashboard._state.session_factory() as session:
            session.get(dashboard.Conference, conferences["RISK"]).conference_status = "At Risk"
            session.get(dashboard.Conference, conferences["ATTN"]).conference_status = "Attention Needed"
            session.get(dashboard.Conference, conferences["TRACK"]).conference_status = "On Track"
            session.commit()

        monkeypatch.setattr(dashboard, "retrieve_sources", lambda payload, session: [])

        def fake_llm(**kwargs):
            if '"canonical_name": "ATTN 2028"' in kwargs["user_prompt"]:
                raise RuntimeError("simulated provider error")
            return json.dumps(
                {
                    "issues": [
                        {
                            "title": "Confirm overdue governance approval",
                            "description": "The approval milestone requires follow-up.",
                            "category": "Governance",
                            "severity": "High",
                            "review_assessment": "Needs Follow-up",
                        }
                    ]
                }
            )

        monkeypatch.setattr(dashboard, "llm_chat_completion_text", fake_llm)
        generated = client.post("/api/issues/generate-from-watchlist")
        assert generated.status_code == 200
        summary = generated.json()
        assert summary["reviewed"] == 2
        assert summary["created"] == 1
        assert summary["failed"] == 1
        assert {item["conference_name"] for item in summary["results"]} == {
            "RISK 2028",
            "ATTN 2028",
        }

        duplicate = client.post(f"/api/conferences/{conferences['RISK']}/generate-issues")
        assert duplicate.status_code == 200
        assert duplicate.json()["created"] == 0
        assert duplicate.json()["skipped_duplicates"] == 1

        issues = client.get("/api/issues").json()["items"]
        assert len(issues) == 1
        assert issues[0]["conference_id"] == conferences["RISK"]
        assert issues[0]["source_type"] == "LLM"


def test_dashboard_average_surplus_uses_actual_financials_only(tmp_path: Path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch) as client:
        conference_ids = []
        for index, acronym in enumerate(("ACTA", "ACTB", "BUDG"), start=1):
            created = client.post(
                "/api/conferences",
                json={
                    "conference_number": f"8800{index}",
                    "acronym": acronym,
                    "year": 2030,
                    "official_title": f"{acronym} Finance Test",
                    "conference_series": "UNKNOWN",
                    "sponsorship_type": "Financially Sponsored",
                    "lifecycle_phase": "Expression of Interest",
                },
            )
            assert created.status_code == 201
            conference_ids.append(created.json()["id"])

        assert client.patch(
            f"/api/conferences/{conference_ids[0]}",
            json={"total_income_current": 120.0, "total_expense_current": 100.0},
        ).status_code == 200
        assert client.patch(
            f"/api/conferences/{conference_ids[1]}",
            json={"total_income_current": 90.0, "total_expense_current": 100.0},
        ).status_code == 200
        assert client.patch(
            f"/api/conferences/{conference_ids[2]}",
            json={"budgeted_income_total": 1000.0, "budgeted_expense_total": 100.0},
        ).status_code == 200

        summary = client.get("/api/dashboard/summary").json()
        assert summary["average_surplus_percentage"] == 5.0
        assert summary["actual_surplus_conference_count"] == 2


def test_overview_kpi_period_is_persisted_and_filters_summary(tmp_path: Path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch) as client:
        created = {}
        for index, (acronym, year, series) in enumerate(
            (("ITSC", 2024, "ITSC"), ("IV", 2028, "IV"), ("FUTURE", 2030, "Custom Conference Series")),
            start=1,
        ):
            response = client.post(
                "/api/conferences",
                json={
                    "conference_number": f"8810{index}",
                    "acronym": acronym,
                    "year": year,
                    "official_title": f"{acronym} KPI Period Test",
                    "conference_series": series,
                    "sponsorship_type": "Flagship" if series in {"ITSC", "IV"} else "Financially Sponsored",
                    "lifecycle_phase": "Detailed Planning",
                },
            )
            assert response.status_code == 201
            created[year] = response.json()

        for year in (2024, 2028):
            issue = client.post(
                "/api/issues",
                json={
                    "conference_id": created[year]["id"],
                    "title": f"{year} follow-up",
                    "category": "Operations",
                    "severity": "Medium",
                },
            )
            assert issue.status_code == 201

        initial_settings = client.get("/api/settings").json()
        assert initial_settings["kpi_from_year"] == 2024
        assert initial_settings["kpi_to_year"] == 2030
        assert initial_settings["kpi_available_years"] == [2024, 2028, 2030]

        saved = client.patch(
            "/api/settings",
            json={"kpi_from_year": 2028, "kpi_to_year": 2030},
        )
        assert saved.status_code == 200
        assert saved.json()["kpi_from_year"] == 2028
        assert saved.json()["kpi_to_year"] == 2030

        persisted = client.get("/api/settings").json()
        assert persisted["kpi_from_year"] == 2028
        assert persisted["kpi_to_year"] == 2030

        summary = client.get("/api/dashboard/summary").json()
        assert summary["kpi_from_year"] == 2028
        assert summary["kpi_to_year"] == 2030
        assert summary["conference_count"] == 2
        assert summary["open_issue_count"] == 1
        assert sum(summary["status_counts"].values()) == 2
        assert sum(summary["phase_counts"].values()) == 2
        assert {item["year"] for item in summary["flagship_cards"]} == {2024, 2028}

        invalid = client.patch(
            "/api/settings",
            json={"kpi_from_year": 2030, "kpi_to_year": 2028},
        )
        assert invalid.status_code == 422


def test_milestone_offsets_handle_optional_values() -> None:
    setting = SimpleNamespace(
        value_json=json.dumps(
            {
                "APPLICATION": {
                    "anchor": None,
                    "months": None,
                    "days": None,
                    "warning_days": None,
                }
            }
        )
    )
    session = SimpleNamespace(get=lambda _model, _key: setting)

    offsets = dashboard.milestone_date_offsets(session)

    assert offsets["APPLICATION"] == {
        "anchor": "start",
        "months": -24,
        "days": 0,
        "warning_days": 0,
    }
    assert dashboard.milestone_due_date(
        "APPLICATION",
        date(2030, 6, 1),
        None,
        offsets=offsets,
    ) == date(2028, 6, 11)


def test_conference_status_uses_score_without_overdue_override(monkeypatch) -> None:
    monkeypatch.setattr(
        dashboard,
        "milestone_stats",
        lambda _conference: {
            "total": 10,
            "completed": [],
            "active": [],
            "blocked": [],
            "unfinished": [],
            "overdue": [object()],
            "due_soon": [],
            "max_overdue_days": 90,
            "completion_pct": 80.0,
        },
    )
    conference = SimpleNamespace(conference_status="Critical")

    assert dashboard.derive_conference_status(conference, 96.3, "Proceedings Processing") == "On Track"
    assert dashboard.score_status(84.9) == "Attention Needed"
    assert dashboard.score_status(69.9) == "At Risk"
    assert dashboard.score_status(49.9) == "Critical"


def test_import_templates_and_preview(tmp_path: Path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch) as client:
        template = client.get("/api/imports/template.csv")
        assert template.status_code == 200
        assert "conference_number,acronym,year" in template.text
        assert "estimated_paper_submissions,actual_paper_submissions" in template.text

        xlsx_template = client.get("/api/imports/template.xlsx")
        template_workbook = pd.ExcelFile(io.BytesIO(xlsx_template.content))
        template_columns = set(pd.read_excel(template_workbook, sheet_name="Conferences").columns)
        assert {"estimated_paper_submissions", "actual_paper_submissions"}.issubset(template_columns)

        csv_text = (
            "conference_number,acronym,year,official_title,conference_series,"
            "sponsorship_type,lifecycle_phase\n"
            "12345,IV,2027,IEEE Intelligent Vehicles Symposium,IV,Flagship,"
            "Expression of Interest\n"
        )
        response = client.post(
            "/api/imports/validate",
            files={"file": ("portfolio.csv", csv_text.encode("utf-8"), "text/csv")},
        )
        assert response.status_code == 200
        preview = response.json()
        assert preview["summary"]["new"] == 1
        assert preview["conflicts"] == []

        workbook = io.BytesIO()
        pd.DataFrame(
            [
                {
                    "conference_number": "12346",
                    "acronym": "ITSC",
                    "year": 2030,
                    "official_title": "IEEE ITSC Test",
                    "conference_series": "ITSC",
                    "sponsorship_type": "Flagship",
                    "lifecycle_phase": "Expression of Interest",
                }
            ]
        ).to_excel(workbook, index=False, sheet_name="Sheet1")
        xlsx_response = client.post(
            "/api/imports/validate",
            files={"file": ("portfolio.xlsx", workbook.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        assert xlsx_response.status_code == 200
        assert xlsx_response.json()["summary"]["new"] == 1


def test_paper_submission_facts_update_import_and_export(tmp_path: Path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch) as client:
        created = client.post(
            "/api/conferences",
            json={
                "conference_number": "12347",
                "acronym": "PAPER",
                "year": 2031,
                "official_title": "IEEE Paper Submission Test",
                "conference_series": "Custom Conference Series",
                "sponsorship_type": "Financially Sponsored",
                "lifecycle_phase": "Expression of Interest",
                "estimated_paper_submissions": 300,
                "actual_paper_submissions": 325,
            },
        )
        assert created.status_code == 201
        conference_id = created.json()["id"]

        updated = client.patch(
            f"/api/conferences/{conference_id}",
            json={"estimated_paper_submissions": 350, "actual_paper_submissions": 375},
        )
        assert updated.status_code == 200
        assert updated.json()["estimated_paper_submissions"] == 350
        assert updated.json()["actual_paper_submissions"] == 375

        csv_text = (
            "conference_number,acronym,year,official_title,conference_series,sponsorship_type,lifecycle_phase,"
            "estimated_paper_submissions,actual_paper_submissions\n"
            "12347,PAPER,2031,IEEE Paper Submission Test,Custom Conference Series,Financially Sponsored,"
            "Expression of Interest,400,420\n"
        )
        preview_response = client.post(
            "/api/imports/validate",
            files={"file": ("paper-submissions.csv", csv_text.encode("utf-8"), "text/csv")},
        )
        assert preview_response.status_code == 200
        assert {change["field"] for change in preview_response.json()["rows"][0]["changes"]} >= {
            "estimated_paper_submissions",
            "actual_paper_submissions",
        }

        apply_response = client.post(
            "/api/imports/apply",
            data={
                "selected_changes_json": json.dumps(
                    {"2": ["estimated_paper_submissions", "actual_paper_submissions"]}
                )
            },
            files={"file": ("paper-submissions.csv", csv_text.encode("utf-8"), "text/csv")},
        )
        assert apply_response.status_code == 200
        imported = client.get(f"/api/conferences/{conference_id}").json()
        assert imported["estimated_paper_submissions"] == 400
        assert imported["actual_paper_submissions"] == 420

        exported = client.get("/api/exports/portfolio.xlsx")
        export_frame = pd.read_excel(io.BytesIO(exported.content), sheet_name="Conferences")
        exported_row = export_frame.loc[export_frame["conference_number"] == 12347].iloc[0]
        assert exported_row["estimated_paper_submissions"] == 400
        assert exported_row["actual_paper_submissions"] == 420


def test_import_applies_selected_valid_fields_when_other_fields_have_errors(tmp_path: Path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch) as client:
        created = client.post(
            "/api/conferences",
            json={
                "conference_number": "98765",
                "acronym": "ITSC",
                "year": 2027,
                "official_title": "IEEE ITSC Partial Import Test",
                "conference_series": "ITSC",
                "sponsorship_type": "Flagship",
                "lifecycle_phase": "Expression of Interest",
                "application_status": "Complete",
                "mou_status": "Complete",
            },
        )
        assert created.status_code == 201

        csv_text = (
            "conference_number,acronym,year,official_title,conference_series,sponsorship_type,lifecycle_phase,"
            "application_status,mou_status,start_date,end_date\n"
            "98765,ITSC,2027,IEEE ITSC Partial Import Test,ITSC,Flagship,Expression of Interest,"
            "Approved,Approved,22-Jun-2027,25-Jun-2027\n"
        )
        preview_response = client.post(
            "/api/imports/validate",
            files={"file": ("portfolio.csv", csv_text.encode("utf-8"), "text/csv")},
        )
        assert preview_response.status_code == 200
        preview = preview_response.json()
        assert preview["summary"]["conflicts"] == 1
        assert preview["rows"][0]["validation_result"] == "error"
        assert {change["field"] for change in preview["rows"][0]["changes"]} >= {"application_status", "mou_status"}

        apply_response = client.post(
            "/api/imports/apply",
            data={"selected_changes_json": json.dumps({"2": ["application_status", "mou_status"]})},
            files={"file": ("portfolio.csv", csv_text.encode("utf-8"), "text/csv")},
        )
        assert apply_response.status_code == 200
        assert apply_response.json()["applied_rows"] == 1
        assert apply_response.json()["skipped_rows"] == 0

        conferences = client.get("/api/conferences", params={"q": "98765"}).json()["items"]
        assert conferences[0]["application_status"] == "Approved"
        assert conferences[0]["mou_status"] == "Approved"
        milestones = {item["code"]: item for item in conferences[0]["milestones"]}
        assert milestones["APPLICATION"]["status"] == "Approved"
        assert milestones["APPLICATION"]["manual_override"] is True
        assert milestones["MOU"]["status"] == "Approved"
        assert milestones["MOU"]["manual_override"] is True
        assert conferences[0]["start_date"] is None
        assert conferences[0]["end_date"] is None


def test_import_apply_serializes_date_changes_in_batch_preview(tmp_path: Path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch) as client:
        created = client.post(
            "/api/conferences",
            json={
                "conference_number": "98766",
                "acronym": "IV",
                "year": 2029,
                "official_title": "IEEE IV Date Import Test",
                "conference_series": "IV",
                "sponsorship_type": "Flagship",
                "lifecycle_phase": "Expression of Interest",
            },
        )
        assert created.status_code == 201

        csv_text = (
            "conference_number,acronym,year,official_title,conference_series,sponsorship_type,lifecycle_phase,"
            "start_date,end_date\n"
            "98766,IV,2029,IEEE IV Date Import Test,IV,Flagship,Expression of Interest,"
            "2029-06-18,2029-06-21\n"
        )
        applied = client.post(
            "/api/imports/apply",
            data={"selected_changes_json": json.dumps({"2": ["start_date", "end_date"]})},
            files={"file": ("portfolio.csv", csv_text.encode("utf-8"), "text/csv")},
        )

        assert applied.status_code == 200
        assert applied.json()["applied_rows"] == 1
        conference = client.get("/api/conferences", params={"q": "98766"}).json()["items"][0]
        assert conference["start_date"] == "2029-06-18"
        assert conference["end_date"] == "2029-06-21"


def test_document_upload_indexes_text_and_chat_retrieves_it(tmp_path: Path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch) as client:
        upload = client.post(
            "/api/documents",
            data={
                "title": "ITSS Operations Note",
                "document_category": "ITSS Conference Operations Manual",
                "knowledge_scope": "IEEE ITSS",
            },
            files={"file": ("note.txt", b"Publication close requires proceedings review.", "text/plain")},
        )
        assert upload.status_code == 201
        document_id = upload.json()["id"]
        assert upload.json()["chunk_count"] == 1
        assert upload.json()["embedding"]["embedded_count"] == 1

        download = client.get(f"/api/documents/{document_id}/download")
        assert download.status_code == 200
        assert download.content == b"Publication close requires proceedings review."

        chat = client.post(
            "/api/chat",
            json={"question": "What requires proceedings review?", "knowledge_scope": "IEEE ITSS"},
        )
        assert chat.status_code == 200
        assert chat.json()["sources"]
        assert chat.json()["sources"][0]["document_id"] == document_id
        assert "excerpt" not in chat.json()["sources"][0]

        all_kbs = client.post(
            "/api/chat",
            json={"question": "What requires proceedings review?", "knowledge_scope": "All KBs"},
        )
        assert all_kbs.status_code == 200
        assert all_kbs.json()["sources"]


def test_document_vectors_handles_absent_embeddings(monkeypatch) -> None:
    document = object()
    session = SimpleNamespace(get=lambda _model, _document_id: document)
    monkeypatch.setattr(
        dashboard,
        "document_vector_rows",
        lambda _document_id: [
            {"index": 0, "text": "No embedding key"},
            {"index": 1, "text": "Explicitly absent", "embedding": None},
        ],
    )
    monkeypatch.setattr(
        dashboard,
        "document_payload",
        lambda _document: {"id": "document-1"},
    )
    monkeypatch.setattr(dashboard, "vector_summary", lambda _document_id: {})

    result = dashboard.document_vectors("document-1", session)

    assert [chunk["has_embedding"] for chunk in result["chunks"]] == [False, False]
    assert [chunk["dimension"] for chunk in result["chunks"]] == [0, 0]


def test_template_upload_download_and_delete(tmp_path: Path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch) as client:
        upload = client.post(
            "/api/templates",
            data={
                "template_name": "Budget Template",
                "short_description": "Conference budget workbook.",
                "category": "Detailed Planning",
            },
            files={"file": ("budget.xlsx", b"template-bytes", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        assert upload.status_code == 201
        item = upload.json()
        assert item["template_type"] == "Excel"

        listing = client.get("/api/templates")
        assert listing.status_code == 200
        assert listing.json()["items"][0]["template_name"] == "Budget Template"

        download = client.get(f"/api/templates/{item['id']}/download")
        assert download.status_code == 200
        assert download.content == b"template-bytes"
        assert "budget.xlsx" in download.headers["content-disposition"]

        deleted = client.delete(f"/api/templates/{item['id']}")
        assert deleted.status_code == 200
        assert client.get("/api/templates").json()["items"] == []


@pytest.mark.parametrize("key", ["score_weights", "portfolio_start_year"])
def test_settings_reports_missing_required_database_setting(
    tmp_path: Path,
    monkeypatch,
    key: str,
) -> None:
    with _client(tmp_path, monkeypatch):
        state = dashboard.get_state()
        with state.session_factory() as session:
            setting = session.get(dashboard.DashboardSettings, key)
            assert setting is not None
            session.delete(setting)
            session.commit()

            with pytest.raises(
                RuntimeError,
                match=f"Required dashboard setting is missing: {key}",
            ):
                dashboard.settings(session)


def test_import_parsing_handles_missing_and_mixed_values() -> None:
    session = SimpleNamespace()

    assert dashboard.parse_import_integer("2032") == 2032
    with pytest.raises(TypeError, match="missing"):
        dashboard.parse_import_integer(None)
    assert (
        dashboard.import_value_for_field(
            "estimated_attendees",
            "125.0",
            session,
        )
        == 125
    )
    assert dashboard.import_value_for_field(
        "start_date",
        "2032-06-15",
        session,
    ) == date(2032, 6, 15)
    assert dashboard.import_value_for_field("city", "  Berlin  ", session) == "Berlin"
    assert (
        dashboard.import_value_for_field("actual_attendees", None, session)
        is dashboard._SKIP_IMPORT_VALUE
    )


def test_settings_masks_azure_openai_secret(tmp_path: Path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch) as client:
        response = client.get("/api/settings")
        assert response.status_code == 200
        azure = response.json()["azure_openai"]
        assert azure["configured"] is True
        assert azure["chat_deployment"] == "gpt-test"
        assert "local-test-key" not in str(azure)
