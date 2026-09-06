# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-09-06

**Release title:** v0.1.0 – Deployment Foundation

Version 0.1.0 is a pre-production foundation release. It prepares the
application for reviewed deployment work while preserving its existing local
SQLite workflow. It does not claim production or cPanel readiness.

### Added

- Environment-aware configuration for local, test, staging, and production
  modes, including production fail-fast validation.
- MariaDB connectivity through PyMySQL and a version-controlled Alembic schema
  baseline.
- Dry-run-first SQLite adoption and SQLite-to-MariaDB migration, validation,
  reconciliation, and idempotent reference-data seeding tools.
- Explicit database health, schema-revision, and deployment configuration
  checks.
- GitHub Actions CI for backend quality, frontend quality, disposable MariaDB
  10.6 integration, and repository hygiene.
- MIT licensing for original software code and documentation, owned by Ahmed
  Hussein.
- `NOTICE.md` covering IEEE and IEEE ITSS names, logos, assets, and trademarks,
  which remain the property of their respective owners and are not licensed
  under MIT.

### Changed

- Preserved local SQLite operation and the existing 61-conference development
  data flow.
- Improved backend type safety and runtime handling of optional database,
  embedding, Kubernetes, milestone, export, and import values.
- Resolved frontend lint and TypeScript safety findings without weakening
  ESLint, TypeScript, or Prettier configuration.
- Organized reusable local-development and maintenance scripts under
  `scripts/local/` and `scripts/maintenance/`.
- Standardized embedding configuration on `TEI_EMBEDDING_BASE_URL` and
  `EMBEDDING_BASE_URL`.
- Replaced organization-specific visual terminology and assets with neutral,
  accessible application styling while preserving IEEE ITSS product identity.
- Removed obsolete POC scaffolding, one-time/private migration artifacts, the
  legacy embedding configuration alias, and the tracked `.local/` example.
- Kept databases, local data, uploads, generated reports, secrets, and local
  deployment documentation outside version control.

### Validation

- Backend mypy, Ruff, and complete pytest validation passed.
- Frontend lint, TypeScript checking, and production build passed.
- Version-consistency, database-migration, and repository-hygiene checks passed.
- Disposable MariaDB 10.6 CI verified Alembic upgrade from zero to head,
  `utf8mb4`, health checks, idempotent seeding, and synthetic migration
  reconciliation.
- Local smoke validation confirmed healthy backend metrics and 61 conferences
  through the frontend proxy without modifying the real local SQLite database.

### Migration safety warning

SQLite adoption and SQLite-to-MariaDB migration commands are dry-run-first.
Back up the database and persistent files, review generated plans, verify the
expected Alembic revision, and complete reconciliation and rollback testing
before applying changes. No production database migration or cPanel deployment
has occurred for this release.

### Next steps

- Prove and select the cPanel runtime and process model.
- Add deployment-appropriate authentication and authorization.
- Validate the application in staging.
- Establish backup, restore, and rollback testing before production use.

[Unreleased]: https://github.com/slmat27/ieee-itss-conference-dashboard/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/slmat27/ieee-itss-conference-dashboard/releases/tag/v0.1.0
