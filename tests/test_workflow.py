from __future__ import annotations

import json
from pathlib import Path

from app.workflow import run


def test_workflow_validates_canonical_csv(tmp_path: Path) -> None:
    input_dir = tmp_path / "input"
    output_dir = tmp_path / "output"
    input_dir.mkdir()
    (input_dir / "portfolio.csv").write_text(
        "acronym,year,official_title,conference_series,sponsorship_type,lifecycle_phase\n"
        "ITSC,2028,IEEE ITSC,ITSC,Flagship,Expression of Interest\n",
        encoding="utf-8",
    )

    run(input_dir, output_dir)

    report = json.loads((output_dir / "portfolio-import-review.json").read_text(encoding="utf-8"))
    assert report["files_reviewed"] == 1
    assert report["valid_files"] == 1
    detail = json.loads((output_dir / "portfolio-validation.json").read_text(encoding="utf-8"))
    assert detail["valid"] is True


def test_workflow_flags_duplicate_acronym_year(tmp_path: Path) -> None:
    input_dir = tmp_path / "input"
    output_dir = tmp_path / "output"
    input_dir.mkdir()
    (input_dir / "portfolio.csv").write_text(
        "acronym,year,official_title,conference_series,sponsorship_type,lifecycle_phase\n"
        "IV,2027,IEEE IV,IV,Flagship,Expression of Interest\n"
        "IV,2027,IEEE IV Duplicate,IV,Flagship,Expression of Interest\n",
        encoding="utf-8",
    )

    run(input_dir, output_dir)

    detail = json.loads((output_dir / "portfolio-validation.json").read_text(encoding="utf-8"))
    assert detail["valid"] is False
    assert "Duplicate acronym-year rows" in detail["errors"][0]
