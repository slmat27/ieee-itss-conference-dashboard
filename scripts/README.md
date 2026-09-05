# Repository scripts

The repository keeps shared scripts grouped by intent:

- `scripts/local/` contains tracked, generic setup and launch helpers for
  reproducible local development. Run them from the repository root, for
  example `.\scripts\local\setup.ps1`, or invoke them directly from their
  directory.
- `scripts/dev/` contains developer-only utilities such as visual-baseline
  screenshot capture. They are not runtime dependencies.
- `scripts/maintenance/` is reserved for reusable, reviewed maintenance tools.
  One-time or data-specific scripts belong in private local documentation, not
  in the public repository.
- `scripts/deploy/` is reserved for future deployment automation after the
  hosting runtime and operational controls are approved.

Personal machine-specific wrappers belong under the ignored `.local/`
directory. Never commit secrets, credentials, databases, uploaded documents,
generated screenshots, or migration reports.
