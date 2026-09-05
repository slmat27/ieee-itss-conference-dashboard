# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Ongoing changes will be recorded here before the next release milestone.

## [0.1.0] - TBD

### Added

- Environment-aware local, test, staging, and production configuration.
- MariaDB support with a version-controlled Alembic baseline.
- Dry-run-first SQLite adoption and SQLite-to-MariaDB migration tooling.
- Explicit health, schema-revision, and deployment configuration checks.

### Changed

- Preserved local SQLite development and the 61-conference local dataset flow.
- Improved backend type safety and runtime handling of optional values.
- Organized shared local and developer scripts under `scripts/`.
- Removed obsolete POC scaffolding and one-time/private migration artifacts from
  the public repository.

[Unreleased]: https://github.com/slmat27/ieee-itss-conference-dashboard/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/slmat27/ieee-itss-conference-dashboard/releases/tag/v0.1.0
