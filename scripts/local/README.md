# Local development scripts

These tracked scripts are generic helpers for reproducible Windows development:

- `setup.ps1` creates local runtime directories and installs locked Python and
  frontend dependencies.
- `run-backend.ps1` starts the FastAPI backend with local defaults.
- `run-frontend.ps1` starts the Vite development server and API proxy.
- `run-all.ps1` and `run-all.bat` start both services.

Each script resolves the repository root from its own location, so it can be
invoked from the repository root or directly from `scripts/local/`.

The entire repository-root `.local/` directory is ignored. Use it for personal
machine-specific wrappers or notes that must never be published. Do not store
secrets, credentials, databases, uploaded documents, generated reports, or
other sensitive data there.
