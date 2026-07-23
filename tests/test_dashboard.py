from __future__ import annotations

from pathlib import Path
import io
import json
from types import SimpleNamespace

import pandas as pd
from fastapi.testclient import TestClient

from app import dashboard
from app.main import create_app


def _client(tmp_path: Path, monkeypatch) -> TestClient:
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


def test_first_run_creates_database_and_reference_data(tmp_path: Path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch) as client:
        response = client.get("/api/reference-data")
        assert response.status_code == 200
        data = response.json()
        assert "ITSC" in [item["code"] for item in data["conference_series"]]
        assert "Financially Co-Sponsored" in data["sponsorship_types"]
        assert (tmp_path / "data" / "itss_dashboard.db").exists()


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
                "primary_contact": "Conference Chair",
                "primary_contact_email": "chair@example.org",
            },
        )
        assert response.status_code == 201
        created = response.json()
        assert created["canonical_name"] == "ITSC 2028"
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
        assert conferences[0]["start_date"] is None
        assert conferences[0]["end_date"] is None


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

        deleted = client.delete(f"/api/templates/{item['id']}")
        assert deleted.status_code == 200
        assert client.get("/api/templates").json()["items"] == []


def test_settings_masks_azure_openai_secret(tmp_path: Path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch) as client:
        response = client.get("/api/settings")
        assert response.status_code == 200
        azure = response.json()["azure_openai"]
        assert azure["configured"] is True
        assert azure["chat_deployment"] == "gpt-test"
        assert "local-test-key" not in str(azure)
