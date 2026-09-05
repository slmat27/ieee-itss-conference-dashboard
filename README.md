# IEEE ITSS Conference Status Dashboard

Local-first web application for the IEEE Intelligent Transportation Systems Society VP for Conference Activities. It manages conference records, lifecycle phase suggestions, phase-aware scores, issues, imports, exports, knowledge documents, retrieval-assisted answers, and AI-assisted email drafts.

## Architecture

- **Backend:** FastAPI, SQLAlchemy 2, Alembic, local SQLite, MariaDB 10.6 through PyMySQL, pandas/openpyxl, PyMuPDF, python-docx, and the OpenAI Python SDK for optional Azure OpenAI calls.
- **Frontend:** React, TypeScript, Vite, React Router, TanStack Query, Ant Design, and Recharts.
- **Storage:** repository-local `data/` and `storage/` directories by default. These runtime directories are ignored by Git.
- **Portable workflow:** `app.workflow.run(input_dir, output_dir)` validates conference CSV inputs independently of the web UI.

## Requirements

- Python 3.12
- [uv](https://docs.astral.sh/uv/)
- Node.js 24 or another version supported by the checked-in frontend dependencies
- npm

## Setup

From the repository root:

```powershell
uv sync
Push-Location frontend
npm ci
Pop-Location
Copy-Item .env.example .env  # optional; do not commit .env
```

Windows users can run the equivalent setup helper:

```powershell
.\setup.ps1
```

The public Python and npm registries are used by default. If your environment requires an approved mirror, set `UV_DEFAULT_INDEX` and/or `NPM_CONFIG_REGISTRY` in the current process; no private registry is required by the repository.

## Run

Backend:

```powershell
$env:APP_ENV = "local"
uv run python -m app.server
```

The portable Python entrypoint validates `HOST` and `PORT`. Local defaults are
`127.0.0.1:8029`; `BACKEND_PORT` remains supported by the local scripts and Vite
proxy.

Frontend, in a second terminal:

```powershell
Push-Location frontend
npm run dev -- --host 127.0.0.1 --port 5191
```

Windows launchers are also provided:

```powershell
.\run-backend.ps1
.\run-frontend.ps1
# or start both:
.\run-all.ps1
```

Open `http://127.0.0.1:5191`. The Vite development server proxies `/api` to the backend on port `8029`.

## Configuration and secrets

`.env.example` contains safe placeholders. Real `.env` files are ignored and must never be committed. `APP_ENV` must be one of `local`, `test`, `staging`, or `production`; tests explicitly use `test`, and the Windows launchers provide `local` when it is absent.

`DATABASE_URL` is authoritative when supplied. Local/test development otherwise keeps the existing `APP_DATABASE_PATH` SQLite fallback and relative storage defaults. `HOST` and `PORT` control the portable backend listener, while `BACKEND_PORT` and `FRONTEND_PORT` remain local Vite conveniences.

Staging and production require a MariaDB URL such as `mysql+pymysql://user:<password>@host/database?charset=utf8mb4`, absolute persistent storage paths, anonymous access disabled, and non-default storage/worker secrets. Application startup validates connectivity and the Alembic head revision before accepting traffic. It does not create tables, alter schema, run migrations, seed defaults, or recalculate all conferences in deployed environments.

Conference management, scoring, imports, exports, and document storage work without AI configuration. Optional Azure OpenAI settings include:

```env
AZURE_OPENAI_ENDPOINT=
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_API_VERSION=
AZURE_OPENAI_CHAT_DEPLOYMENT=
AZURE_OPENAI_EMBEDDING_DEPLOYMENT=
```

The Settings page masks the API key and can verify the configured chat deployment.

## Data storage

Default local paths:

```text
data/itss_dashboard.db
data/imports/
data/documents/
data/vector_store/
data/exports/
storage/
```

The first local/test SQLite startup retains a clearly isolated legacy compatibility path that creates missing tables, applies the historical additive columns, seeds local reference data, and recalculates conferences. Deployed environments never use that path. They require an explicit Alembic migration step and explicit absolute persistent paths; no existing database or uploaded files are copied by configuration setup.

## Database schema and migration

Alembic is the schema source of truth for new databases. Application workers only verify the current revision. The reviewed baseline preserves SQLite semantics while mapping unrestricted text to MariaDB `LONGTEXT`, binary payloads to `LONGBLOB`, Python/SQLite floating-point values to MariaDB `DOUBLE`, and timestamps to `DATETIME(6)` so existing document text, import previews, file payloads, scores, and microseconds are not narrowed during transfer.

Create or upgrade a database:

```powershell
$env:APP_ENV = "test"
$env:DATABASE_URL = "sqlite+pysqlite:///D:/absolute/path/new-dashboard.db"
uv run alembic upgrade head

# MariaDB 10.6 example; run in the fully configured deployment environment.
$env:APP_ENV = "staging"
$env:DATABASE_URL = "mysql+pymysql://user:<password>@host/database?charset=utf8mb4"
uv run alembic upgrade head
uv run python -m app.database_seed
```

`app.database_seed` is the explicit, idempotent reference-data step for a new empty database. It does not recalculate existing conferences unless the operator deliberately adds `--recalculate-existing`.

Adopt an existing SQLite schema only after working on a copy. Dry-run is the default; apply creates a backup before adding the Alembic revision and never runs schema upgrades:

```powershell
uv run python -m app.database_adoption --database D:\backup\dashboard-copy.db
uv run python -m app.database_adoption `
  --database D:\backup\dashboard-copy.db `
  --apply `
  --backup-path D:\backup\dashboard-copy.pre-alembic.db
```

The command refuses the default local database path unless `--confirm-original` is explicitly supplied. A schema mismatch or unexpected Alembic revision is never stamped.

The SQLite-to-MariaDB command is also dry-run by default. The target URL may be read from `DATABASE_URL`, preventing credentials from appearing in command output:

```powershell
$env:DATABASE_URL = "mysql+pymysql://user:<password>@host/database?charset=utf8mb4"
uv run python -m app.sqlite_to_mariadb `
  --source D:\backup\dashboard-copy.db `
  --target-database-url-env DATABASE_URL `
  --verify-known-local-counts `
  --report-dir migration-reports

# Add --apply only after reviewing both reconciliation reports.
```

The target must have no application data unless the explicit `--resume` mode is used. Reports contain counts, null distributions, deterministic checksums, primary-key checks, and grouped foreign-key violations, but no row contents or credentials. Optional file trees can be included with paired options such as `--documents-source`/`--documents-target`, `--vectors-source`/`--vectors-target`, and equivalent pairs for templates, imports, exports, and runs.

For rollback, retain the untouched SQLite source, the adoption backup, the MariaDB backup or empty pre-cutover database, and one consistent backup of all persistent file trees. Database and file migration are separate operational steps; do not switch application traffic until reconciliation succeeds.

## Main features

- Add and enrich conferences with duplicate acronym-year and record-number checks.
- Track conference series, lifecycle phases, suggested phase differences, and archive/restore state.
- Calculate transparent phase-aware scores, issue penalties, completeness, status bands, score history, and snapshots.
- Detect rule-based issues and manage review assessments.
- Download canonical Excel and CSV templates and validate imports before applying selected changes.
- Export portfolio Excel and executive PDF reports.
- Upload PDF, DOCX, TXT, and Markdown guidance documents and retrieve cited excerpts.
- Generate assistant answers and editable email drafts with Azure OpenAI when configured, with local fallbacks otherwise.

## Validation

Backend quality and tests:

```powershell
uv run pytest
uv run ruff check .
uv run mypy app
```

Frontend quality and build:

```powershell
Push-Location frontend
npm ci
npm run lint
npm run build
```

Focused workflow smoke test:

```powershell
uv run pytest tests/test_workflow.py
```

The test suite also covers Alembic upgrades, SQLite adoption and mismatch refusal, migration dry-runs, non-empty target refusal, data-type reconciliation, database health, fresh local initialization, imports, exports, document retrieval, template lifecycle operations, scoring, and secret masking.

## Docker

Build from the repository root:

```powershell
docker build -t ieee-itss-conference-dashboard .
```

Public registries are Dockerfile defaults. Approved mirrors can be supplied through the `NPM_REGISTRY_URL` and `PYPI_INDEX_URL` build arguments. The image includes `alembic.ini` and the reviewed migration history, uses the same `python -m app.server` entrypoint, and reads `APP_ENV`, `HOST`, and `PORT`. It verifies but never runs migrations automatically, and it is not a production-ready deployment definition.

## Visual baselines

After UI changes, with the app running:

```powershell
.\scripts\capture-page-screenshots.ps1 -FrontendUrl http://127.0.0.1:5191
```

Screenshots are written to ignored `webapp-backup/screenshots/` for local review.

## License

No software license was present in the source project, so none has been added. The repository owner should choose and add an appropriate license before inviting external reuse or contributions.
