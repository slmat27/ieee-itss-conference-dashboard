from __future__ import annotations

import argparse
import json
from typing import Any

from sqlalchemy import func, select

from .config import AppSettings
from .dashboard import (
    Conference,
    DashboardSettings,
    MilestoneDefinition,
    StatusMapping,
    recalculate,
    seed_configuration,
)
from .database import (
    create_database_engine,
    create_session_factory,
    verify_database_ready,
)


def seed_database(
    settings: AppSettings,
    *,
    recalculate_existing: bool = False,
) -> dict[str, Any]:
    """Run reviewed, idempotent reference-data initialization explicitly."""

    engine = create_database_engine(settings)
    try:
        verify_database_ready(engine, require_revision=True)
        session_factory = create_session_factory(engine)
        with session_factory() as session:
            seed_configuration(session)
            recalculated = 0
            if recalculate_existing:
                for conference in session.scalars(select(Conference)):
                    recalculate(conference, session, record_history=False)
                    recalculated += 1
            session.commit()
            return {
                "status": "ok",
                "milestone_definitions": session.scalar(
                    select(func.count()).select_from(MilestoneDefinition)
                ),
                "status_mappings": session.scalar(
                    select(func.count()).select_from(StatusMapping)
                ),
                "dashboard_settings": session.scalar(
                    select(func.count()).select_from(DashboardSettings)
                ),
                "recalculated_conferences": recalculated,
            }
    finally:
        engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seed reviewed dashboard reference data after Alembic upgrade."
    )
    parser.add_argument("--recalculate-existing", action="store_true")
    args = parser.parse_args()
    result = seed_database(
        AppSettings.from_env(),
        recalculate_existing=args.recalculate_existing,
    )
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
