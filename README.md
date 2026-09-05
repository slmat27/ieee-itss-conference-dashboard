# IEEE ITSS Conference Status Dashboard

Local-first web application for the IEEE Intelligent Transportation Systems Society VP for Conference Activities. It manages conference records, lifecycle phase suggestions, phase-aware scores, issues, imports, exports, knowledge documents, retrieval-assisted answers, and AI-assisted email drafts.

## Architecture

- **Backend:** FastAPI, SQLAlchemy 2, SQLite, pandas/openpyxl, PyMuPDF, python-docx, and the OpenAI Python SDK for optional Azure OpenAI calls.
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

Local development keeps the existing SQLite and relative storage defaults. `HOST` and `PORT` control the portable backend listener, while `BACKEND_PORT` and `FRONTEND_PORT` remain local Vite conveniences. Staging and production require `DATABASE_URL`, absolute persistent storage paths, anonymous access disabled, and a non-default `APP_STORAGE_SECRET`. They are intentionally blocked until server-database support and Alembic migrations are implemented in the next database-portability phase.

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

The first local/test backend startup creates the SQLite schema, data directories, lifecycle phases, statuses, conference series, milestone definitions, issue settings, and score weights. Deployed environments must use explicit absolute persistent paths; no existing database or uploaded files are copied by configuration setup.

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

The test suite also covers fresh database initialization, health-facing application setup, import previews and application, exports, document retrieval, template lifecycle operations, scoring, and secret masking.

## Docker

Build from the repository root:

```powershell
docker build -t ieee-itss-conference-dashboard .
```

Public registries are Dockerfile defaults. Approved mirrors can be supplied through the `NPM_REGISTRY_URL` and `PYPI_INDEX_URL` build arguments. The image uses the same `python -m app.server` entrypoint and reads `APP_ENV`, `HOST`, and `PORT`; it is not a production-ready deployment definition.

## Visual baselines

After UI changes, with the app running:

```powershell
.\scripts\capture-page-screenshots.ps1 -FrontendUrl http://127.0.0.1:5191
```

Screenshots are written to ignored `webapp-backup/screenshots/` for local review.

## License

No software license was present in the source project, so none has been added. The repository owner should choose and add an appropriate license before inviting external reuse or contributions.
