# IEEE ITSS Conference Status Dashboard

Local-first web application for the IEEE Intelligent Transportation Systems Society VP for Conference Activities. It manages conference records, lifecycle phase suggestions, phase-aware scores, issues, imports, exports, knowledge documents, RAG assistant answers, and AI-assisted email drafts.

The app uses FastAPI, SQLAlchemy 2, SQLite, pandas/openpyxl, a built-in local PDF writer, PyMuPDF, python-docx, the official OpenAI Python SDK for Azure OpenAI, React, TypeScript, Vite, React Router, TanStack Query, TanStack Table-ready data flows, Ant Design, and Recharts.

## Local Setup

Requirements:

- Windows 11
- Python 3.12
- `uv`
- Node.js and npm
- Chromium-based browser

From this folder:

```powershell
.\setup.ps1
```

The setup script creates `data/`, installs backend dependencies with `uv`, and installs the React/Vite frontend dependencies from the internal Artifactory npm registry. If `.env` is missing, it creates one from `.env.example`.

This POC folder already contains a local `.env` copied from the workspace as requested. It is ignored by Git. Do not commit real Azure OpenAI credentials.

## Run

Backend:

```powershell
.\run-backend.ps1
```

Frontend:

```powershell
.\run-frontend.ps1
```

Both:

```powershell
.\run-all.ps1
```

Simplest Windows launcher:

```bat
run-all.bat
```

Open:

```text
http://127.0.0.1:5191
```

## Visual Baselines

After UI changes, refresh local page screenshots:

```powershell
.\scripts\capture-page-screenshots.ps1 -FrontendUrl http://127.0.0.1:5191
```

Screenshots are overwritten in `webapp-backup/screenshots/`. That folder is ignored by Git and is only for local review before future UI edits.

## Data Storage

Default local paths:

```text
data/itss_dashboard.db
data/imports/
data/documents/
data/vector_store/
data/exports/
storage/
```

The first backend startup creates the SQLite schema, data directories, seeded lifecycle phases, statuses, conference series, milestone definitions, issue settings, and score weights.

## Azure OpenAI

Backend-only settings:

```env
AZURE_OPENAI_ENDPOINT=
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_API_VERSION=
AZURE_OPENAI_CHAT_DEPLOYMENT=
AZURE_OPENAI_EMBEDDING_DEPLOYMENT=
```

The copied workspace `.env` also uses `AZURE_OPENAI_DEPLOYMENT`; the backend accepts that as a chat deployment fallback. The Settings page masks the key, shows deployment names, and verifies the chat deployment. Conference management, imports, exports, scoring, and document storage work without Azure OpenAI.

## Main Features

- Add and enrich conferences with duplicate acronym-year and Record Number checks.
- Track ITSS conference series, flagship rolling four-year ITSC and IV cards, lifecycle phases, suggested phase differences, and archive/restore.
- Calculate transparent phase-aware scores, issue penalties, data completeness, status bands, score history, and snapshots.
- Detect rule-based issues and manage review assessments.
- Download canonical Excel and CSV import templates plus a field guide.
- Validate imports, preview changes, apply approved rows, store original files, create history, and support rollback hooks.
- Export portfolio Excel and executive PDF reports.
- Upload PDF, DOCX, TXT, and Markdown guidance documents, extract text, index local chunks, and retrieve cited excerpts.
- Ask the Conference Operations Assistant questions against uploaded documents and selected conference facts.
- Generate editable email drafts from conferences and issues using Azure OpenAI when configured, with local fallback text otherwise.

## Validation

```powershell
uv run python -m pytest tests -p no:cacheprovider
```

Creator Agent strict validation from the workspace root:

```powershell
uv run python scripts/validate_poc.py pocs/ieee-itss-conference-dashboard --strict
```

If the workspace-level `uv` Python requirement conflicts with local Python 3.12, run the validator with the Python 3.12 interpreter directly:

```powershell
& "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe" scripts/validate_poc.py pocs/ieee-itss-conference-dashboard --strict
```

## Notes For Reviewers

The UI uses text-based IEEE/ITSS branding because no authorized logo assets were supplied. It uses IEEE Blue `#00629B` as the primary identity color and restrained neutral backgrounds for data-dense pages.

The POC is intentionally local-first. Promotion to `apps/experimental` should use the Creator Agent promotion flow so the platform manifest, image repository, LLM aliases, and deployment metadata are generated from this draft.
