# Releasing

The project follows Semantic Versioning. `pyproject.toml` is the authoritative
application version; `frontend/package.json` must carry the same value, and the
automated version-consistency test must pass.

## Version-bump rules

- **Patch** (`x.y.Z`): backward-compatible fixes and documentation or tooling
  corrections that affect a released milestone.
- **Minor** (`x.Y.0`): backward-compatible features, API additions, or material
  operational capabilities.
- **Major** (`X.0.0`): incompatible API, data-contract, configuration, or
  operational changes.
- `v0.x` versions are development or pre-production milestones. Production
  releases begin at `v1.0.0`.

## Prepare a release

1. Create a release pull request from the latest `main`.
2. Choose the version using the rules above.
3. Update `pyproject.toml` and `frontend/package.json` to the same version.
4. Move relevant `Unreleased` entries in `CHANGELOG.md` into the versioned
   section and replace `TBD` with the release date in `YYYY-MM-DD` form.
5. Confirm no secrets, databases, uploads, local deployment documentation, or
   generated migration reports are tracked.

## Required checks

Run and record:

```powershell
uv run mypy app
uv run pytest
uv run ruff check .
uv run pytest tests/test_database_migrations.py

Push-Location frontend
npm run lint
npx tsc --noEmit
npm run build
Pop-Location
```

Also run the local application smoke test, confirm `/healthz`, and confirm the
expected conference count through the frontend proxy. Deployment-specific
checks must be completed in the approved staging environment before a
production release.

## Merge and tag policy

- Pull requests are squash-merged after review and required checks pass.
- Release tags are created from `main` only, after the release pull request is
  merged.
- Use an annotated tag named `vMAJOR.MINOR.PATCH`, for example:

```powershell
git switch main
git pull --ff-only
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin v0.1.0
```

Do not tag feature branches, draft pull requests, or unreviewed commits.

## GitHub Release

1. Create a GitHub Release from the annotated tag.
2. Use the matching changelog section as the release summary.
3. Review generated notes and remove irrelevant automated entries.
4. Mark `v0.x` releases as pre-releases.
5. Publish only after the tag, artifacts, migration guidance, and staging
   validation have been independently verified.

## Rollback

1. Stop rollout or restore the previously approved application image.
2. Restore the database and persistent file trees from one consistent backup
   set when data rollback is required.
3. Do not downgrade an Alembic revision unless the relevant migration has a
   reviewed and tested downgrade path.
4. Verify database revision, `/healthz`, `/metrics`, frontend routing, and
   conference counts before reopening traffic.
5. Record the incident and prepare a forward fix. Never move or delete an
   existing release tag to hide a failed release.
