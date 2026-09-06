# Database migrations

Alembic is the schema source of truth for new databases. Application workers
verify that the database is at the expected revision, but they never run
migrations automatically.

The complete migration environment must remain version-controlled:

- `env.py` loads the application metadata and deployment-aware database URL.
- `script.py.mako` is the template for future reviewed revisions.
- `versions/` contains the ordered migration history.
- `versions/dd20ec3dadff_baseline_schema.py` is the reviewed baseline that
  preserves the existing SQLite schema while providing MariaDB-compatible
  types.

Keeping these files together allows clean databases to be reproduced, existing
databases to be checked against the same history, and releases to identify the
schema revision they require. Do not delete, squash, or edit an applied
migration. Add a new reviewed revision instead.

Run migrations explicitly from a fully configured environment:

```powershell
uv run alembic upgrade head
```

Database files, backups, credentials, and generated migration reports are local
or operational artifacts and must not be committed.
