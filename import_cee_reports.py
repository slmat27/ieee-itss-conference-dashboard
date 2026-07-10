from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Any

import pandas as pd
from sqlalchemy import select

from app.dashboard import (
    Alias,
    Conference,
    Contact,
    ImportBatch,
    app_path,
    create_snapshot,
    detect_issues,
    get_state,
    init_dashboard,
    normalize_acronym,
    normalize_record_number,
    normalize_status,
    parse_date,
    recalculate,
)


REPORT_FILES = {
    "progress": "202606 - ITSS Conference Progress Report.xlsm",
    "finances": "202606 - ITSS Finances.xlsm",
    "publication": "202606 - ITSS Pub Report.xlsx",
    "overview": "IEEE-ITSS-Conferences-Overview.xlsx",
    "application": "202606 - ITSS App.xlsx",
}

REPORT_DATE = date(2026, 6, 30)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("report_dir", type=Path)
    args = parser.parse_args()
    init_dashboard()
    state = get_state()
    with state.session_factory() as session:
        total = 0
        for source, filename in REPORT_FILES.items():
            path = args.report_dir / filename
            if not path.exists():
                raise SystemExit(f"Missing report file: {path}")
            rows = read_rows(path, source)
            batch = ImportBatch(
                original_filename=filename,
                file_type=path.suffix.lower().lstrip("."),
                file_hash=file_hash(path),
                report_date=REPORT_DATE,
                import_status="Applied",
                rows_count=len(rows),
                new_count=0,
                changed_count=0,
                unchanged_count=0,
                conflict_count=0,
                notes=f"CEE {source} report imported from {path}",
                preview_json=json.dumps({"source": source, "rows": len(rows)}),
            )
            session.add(batch)
            session.flush()
            created, changed = import_rows(session, rows, source, filename)
            batch.new_count = created
            batch.changed_count = changed
            total += len(rows)
        for conference in session.scalars(select(Conference)):
            detect_issues(conference, session)
            recalculate(conference, session)
            create_snapshot(conference, session, reason="cee report import")
        session.commit()
    print(f"Imported {total} CEE rows into {app_path('APP_DATABASE_PATH', './data/itss_dashboard.db')}")


def read_rows(path: Path, source: str) -> list[dict[str, Any]]:
    if source == "overview":
        frame = pd.read_excel(path, header=1)
    elif source == "finances":
        frame = pd.read_excel(path, sheet_name=0)
    else:
        frame = pd.read_excel(path, sheet_name=0)
    frame = frame.dropna(how="all")
    frame.columns = [clean_header(column) for column in frame.columns]
    rows = []
    for raw in frame.to_dict(orient="records"):
        row = {key: clean_value(value) for key, value in raw.items() if key and not key.startswith("unnamed")}
        if any(value is not None for value in row.values()):
            rows.append(row)
    return rows


def import_rows(session: Any, rows: list[dict[str, Any]], source: str, filename: str) -> tuple[int, int]:
    created = 0
    changed = 0
    for row in rows:
        if is_non_conference_row(row, source):
            continue
        facts = normalize_row(row, source)
        if not facts.get("official_title"):
            continue
        conference = find_conference(session, facts)
        if conference is None:
            conference = Conference(
                conference_number=facts.get("conference_number"),
                acronym=facts["acronym"],
                normalized_acronym=normalize_acronym(facts["acronym"]),
                year=facts["year"],
                official_title=facts["official_title"],
                canonical_name=f"{facts['acronym']} {facts['year']}",
                conference_series=series_name(facts["acronym"]),
                sponsorship_type=facts.get("sponsorship_type") or "Technically Co-Sponsored",
                lifecycle_phase=facts.get("lifecycle_phase") or "Detailed Planning",
                phase_override=False,
            )
            session.add(conference)
            session.flush()
            created += 1
        else:
            changed += 1
        apply_facts(conference, facts)
        merge_source_detail(conference, source, filename, row)
        add_aliases(session, conference, facts)
        add_contacts(session, conference, facts)
    return created, changed


def normalize_row(row: dict[str, Any], source: str) -> dict[str, Any]:
    title = first(row, "conference_title", "full_title", "conference_title_")
    short_title = first(row, "short_title")
    acronym = first(row, "acronym") or acronym_from_short_title(short_title) or acronym_from_title(title)
    start = parse_any_date(first(row, "conference_start_date", "start_date"))
    year = as_int(first(row, "year")) or (start.year if start else year_from_title(title) or REPORT_DATE.year)
    conference_type = first(row, "conference_type_description")
    sponsor_percent = first(row, "sponsor_percent", "sponsor_percent_", "ieee_sponsor_percentage_string")
    status = first(row, "conference_status_description", "conference_status")
    finance_status = first(row, "finance_status_description")
    publication_status = first(row, "publication_status_description")
    comments = first(row, "comments", "comments_", "overall_comments")
    return {
        "source": source,
        "conference_number": normalize_record_number(first(row, "conference_number", "conference_number_")),
        "acronym": acronym or "CONF",
        "year": year,
        "official_title": as_text(title or short_title or f"{acronym or 'Conference'} {year}"),
        "short_title": as_text(short_title),
        "start_date": start,
        "end_date": parse_any_date(first(row, "conference_end_date", "end_date")),
        "city": as_text(first(row, "conference_location_city_name", "city")),
        "state_province": as_text(first(row, "conference_location_state_name")),
        "country": as_text(first(row, "conference_location_country_name", "country")),
        "ieee_region": as_text(first(row, "conference_location_region")),
        "website": as_text(first(row, "website")),
        "conference_status": normalize_status(status),
        "sponsorship_type": sponsorship_type(conference_type, sponsor_percent),
        "estimated_attendees": as_int(first(row, "estimated_attendees_number_", "estimated_no_of_attendees")),
        "actual_attendees": as_int(first(row, "actual_no_of_attendees")),
        "mou_status": mou_status(first(row, "mou_approved_flag"), first(row, "mou_signed_date")),
        "mou_signed_date": parse_any_date(first(row, "mou_signed_date")),
        "application_submitted_date": parse_any_date(first(row, "conference_submission_date")),
        "application_status": "Submitted" if source == "application" else None,
        "application_status_raw": comments if source == "application" else None,
        "finance_status": normalize_status(finance_status) if finance_status else None,
        "accounting_close_date": parse_any_date(first(row, "accounting_close_date")),
        "financial_analyst": as_text(first(row, "fc_name")),
        "publication_status": normalize_status(publication_status) if publication_status else None,
        "proceedings_submitted_date": parse_any_date(first(row, "pub_form_submitted_date", "media_received_date")),
        "xplore_posting_date": parse_any_date(first(row, "xplore_posting_date")),
        "budgeted_income_total": as_float(first(row, "pre_income", "interim_income")),
        "budgeted_expense_total": as_float(first(row, "pre_expense", "interim_expense")),
        "total_income_current": as_float(first(row, "actual_income")),
        "total_expense_current": as_float(first(row, "actual_expense")),
        "comments": as_text(comments),
        "submitter_name": as_text(first(row, "submitter_name")),
        "gc_name": as_text(first(row, "gc_name")),
        "gc_email": as_text(first(row, "gc_email")),
        "pc_name": as_text(first(row, "pc_name")),
        "pc_email": as_text(first(row, "pc_email")),
        "fc_name": as_text(first(row, "fc_name")),
        "fc_email": as_text(first(row, "fc_email")),
    }


def apply_facts(conference: Conference, facts: dict[str, Any]) -> None:
    fields = [
        "conference_number",
        "official_title",
        "start_date",
        "end_date",
        "city",
        "state_province",
        "country",
        "ieee_region",
        "website",
        "estimated_attendees",
        "actual_attendees",
        "conference_status",
        "sponsorship_type",
        "mou_status",
        "mou_signed_date",
        "application_status",
        "application_status_raw",
        "application_submitted_date",
        "finance_status",
        "accounting_close_date",
        "financial_analyst",
        "publication_status",
        "proceedings_submitted_date",
        "xplore_posting_date",
        "budgeted_income_total",
        "budgeted_expense_total",
        "total_income_current",
        "total_expense_current",
    ]
    for field in fields:
        value = facts.get(field)
        if value is not None and value != "":
            setattr(conference, field, value)
    if facts.get("comments") and not conference.comments:
        conference.comments = facts["comments"]
    conference.acronym = facts["acronym"]
    conference.normalized_acronym = normalize_acronym(facts["acronym"])
    conference.canonical_name = f"{facts['acronym']} {facts['year']}"
    conference.conference_series = series_name(facts["acronym"])
    conference.last_source_update = REPORT_DATE


def merge_source_detail(conference: Conference, source: str, filename: str, row: dict[str, Any]) -> None:
    details = json.loads(conference.source_details_json or "{}")
    entries = details.setdefault(source, [])
    payload = {"source_file": filename, "report_date": REPORT_DATE.isoformat(), "row": json_safe(row)}
    key = json.dumps(payload["row"], sort_keys=True, default=str)
    existing_keys = {json.dumps(item.get("row", {}), sort_keys=True, default=str) for item in entries}
    if key not in existing_keys:
        entries.append(payload)
    conference.source_details_json = json.dumps(details, default=str)


def add_aliases(session: Any, conference: Conference, facts: dict[str, Any]) -> None:
    for alias in {facts.get("short_title"), facts.get("official_title"), conference.canonical_name}:
        if not alias:
            continue
        exists = session.scalar(select(Alias).where(Alias.conference_id == conference.id, Alias.alias == alias))
        if not exists:
            session.add(Alias(conference_id=conference.id, alias=alias, alias_type="CEE", source=facts["source"]))


def add_contacts(session: Any, conference: Conference, facts: dict[str, Any]) -> None:
    contacts = [
        ("General Chair", facts.get("gc_name"), facts.get("gc_email")),
        ("Program Chair", facts.get("pc_name"), facts.get("pc_email")),
        ("Finance Chair or Treasurer", facts.get("fc_name"), facts.get("fc_email")),
        ("Conference Submitter", facts.get("submitter_name"), None),
    ]
    for role, name, email in contacts:
        if not name and not email:
            continue
        exists = session.scalar(
            select(Contact).where(Contact.conference_id == conference.id, Contact.role == role, Contact.name == (name or role))
        )
        if not exists:
            session.add(Contact(conference_id=conference.id, role=role, name=name or role, email=email, is_primary=role == "General Chair"))


def find_conference(session: Any, facts: dict[str, Any]) -> Conference | None:
    number = facts.get("conference_number")
    if number:
        found = session.scalar(select(Conference).where(Conference.conference_number == number))
        if found:
            return found
    return session.scalar(
        select(Conference).where(
            Conference.normalized_acronym == normalize_acronym(facts["acronym"]),
            Conference.year == facts["year"],
            Conference.parent_conference_id.is_(None),
        )
    )


def file_hash(path: Path) -> str:
    import hashlib

    return hashlib.sha256(path.read_bytes()).hexdigest()


def clean_header(value: Any) -> str:
    text = str(value or "").strip().lower()
    text = re.sub(r"[^a-z0-9]+", "_", text).strip("_")
    return text


def clean_value(value: Any) -> Any:
    if value is None or pd.isna(value):
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    return text or None


def first(row: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = row.get(key)
        if value is not None and value != "":
            return value
    return None


def as_text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip() or None


def as_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(float(str(value).replace(",", "")))
    except ValueError:
        return None


def as_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(str(value).replace(",", "").replace("%", ""))
    except ValueError:
        return None


def parse_any_date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    try:
        return parse_date(value)
    except ValueError:
        parsed = pd.to_datetime(value, errors="coerce")
        return None if pd.isna(parsed) else parsed.date()


def year_from_title(title: Any) -> int | None:
    match = re.search(r"\b(20\d{2})\b", str(title or ""))
    return int(match.group(1)) if match else None


def acronym_from_short_title(short_title: Any) -> str | None:
    text = str(short_title or "").strip()
    match = re.match(r"([A-Za-z0-9]+)", text)
    return match.group(1).upper() if match else None


def acronym_from_title(title: Any) -> str | None:
    text = str(title or "")
    if "Models and Technologies for Intelligent Transportation Systems" in text:
        return "MT-ITS"
    if "Neural Intelligence, Quantum Logic and Computing Systems" in text:
        return "NIQLCS"
    known = ["ITSC", "IV", "FISTS", "ICIRT", "ICVES", "ISI", "SOLI", "MESA", "VNC", "UV", "SM", "CTRG", "ICTIS", "TENSYMP"]
    for acronym in known:
        if re.search(rf"\b{re.escape(acronym)}\b", text, re.IGNORECASE):
            return acronym
    paren = re.findall(r"\(([A-Z0-9]{2,8})\)", text)
    return paren[-1] if paren else None


def series_name(acronym: str) -> str:
    flagship = {"ITSC": "International Conference on Intelligent Transportation Systems", "IV": "Intelligent Vehicles Symposium"}
    return flagship.get(acronym.upper(), acronym.upper())


def sponsorship_type(conference_type: Any, sponsor_percent: Any) -> str:
    text = str(conference_type or "").lower()
    percent = as_float(sponsor_percent)
    if "technical" in text or percent == 0:
        return "Technically Co-Sponsored"
    if "co" in text or (percent is not None and 0 < percent < 100):
        return "Financially Co-Sponsored"
    if "sponsor" in text or percent == 100:
        return "Financially Sponsored"
    return "Technically Co-Sponsored"


def mou_status(flag: Any, signed: Any) -> str:
    if parse_any_date(signed):
        return "Complete"
    text = str(flag or "").strip().upper()
    if text == "Y":
        return "Approved"
    if text == "N":
        return "Not Started"
    return "Unknown"


def json_safe(row: dict[str, Any]) -> dict[str, Any]:
    return {key: (value.isoformat() if isinstance(value, date) else value) for key, value in row.items()}


def is_non_conference_row(row: dict[str, Any], source: str) -> bool:
    if source != "overview":
        return False
    title = first(row, "full_title", "conference_title")
    number = first(row, "conference_number", "conference_number_")
    short_title = str(first(row, "short_title") or "").strip().lower()
    section_labels = {"gc", "pub", "local", "pc", "fc"}
    return not title and not number and short_title in section_labels


if __name__ == "__main__":
    sys.exit(main())
