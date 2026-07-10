from __future__ import annotations

import csv
import json
import os
import time
from datetime import date
from pathlib import Path

DEFAULT_OUTPUT_TAG = "ITSS dashboard import processed"
DEFAULT_WORKFLOW_DELAY_SECONDS = 0.0
REQUIRED_COLUMNS = {
    "acronym",
    "year",
    "official_title",
    "conference_series",
    "sponsorship_type",
    "lifecycle_phase",
}


def run(
    input_dir: Path,
    output_dir: Path,
    *,
    delay_seconds: float | None = None,
    output_tag: str = DEFAULT_OUTPUT_TAG,
) -> None:
    """Validate local conference status files and create review artifacts."""
    resolved_delay_seconds = (
        _workflow_delay_seconds() if delay_seconds is None else max(delay_seconds, 0.0)
    )
    if resolved_delay_seconds > 0:
        time.sleep(resolved_delay_seconds)

    output_dir.mkdir(parents=True, exist_ok=True)
    summaries: list[dict[str, object]] = []
    for input_path in sorted(input_dir.iterdir()):
        if not input_path.is_file():
            continue
        summary = _summarize_file(input_path)
        summaries.append(summary)
        (output_dir / f"{input_path.stem}-validation.json").write_text(
            json.dumps(summary, indent=2),
            encoding="utf-8",
        )

    portfolio_report = {
        "generated_on": date.today().isoformat(),
        "output_tag": output_tag,
        "files_reviewed": len(summaries),
        "valid_files": sum(1 for item in summaries if item["valid"]),
        "files": summaries,
    }
    (output_dir / "portfolio-import-review.json").write_text(
        json.dumps(portfolio_report, indent=2),
        encoding="utf-8",
    )
    (output_dir / "README.txt").write_text(
        "IEEE ITSS Conference Status Dashboard workflow smoke output.\n"
        "Use the JSON review files to inspect import readiness before applying data.\n",
        encoding="utf-8",
    )


def _summarize_file(path: Path) -> dict[str, object]:
    if path.suffix.lower() != ".csv":
        return {
            "file": path.name,
            "valid": False,
            "errors": ["Only CSV files are inspected by the portable workflow smoke path."],
            "row_count": 0,
        }
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        columns = set(reader.fieldnames or [])
        missing = sorted(REQUIRED_COLUMNS - columns)
        rows = list(reader)
    errors: list[str] = []
    if missing:
        errors.append("Missing required columns: " + ", ".join(missing))
    duplicate_keys: set[tuple[str, str]] = set()
    seen: set[tuple[str, str]] = set()
    for row in rows:
        key = ((row.get("acronym") or "").strip().upper(), (row.get("year") or "").strip())
        if key in seen:
            duplicate_keys.add(key)
        seen.add(key)
    if duplicate_keys:
        errors.append("Duplicate acronym-year rows: " + ", ".join(f"{a} {y}" for a, y in sorted(duplicate_keys)))
    return {
        "file": path.name,
        "valid": not errors,
        "errors": errors,
        "row_count": len(rows),
        "columns": sorted(columns),
    }


def _workflow_delay_seconds() -> float:
    raw = os.environ.get("WORKFLOW_DELAY_SECONDS", str(DEFAULT_WORKFLOW_DELAY_SECONDS))
    try:
        return max(float(raw), 0.0)
    except ValueError:
        return DEFAULT_WORKFLOW_DELAY_SECONDS
