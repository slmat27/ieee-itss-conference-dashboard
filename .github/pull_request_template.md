## Summary

<!-- Explain the problem, the chosen approach, and user-visible effects. -->

## Validation

- [ ] `uv run mypy app`
- [ ] `uv run pytest`
- [ ] `uv run ruff check .`
- [ ] `uv run pytest tests/test_database_migrations.py`
- [ ] Frontend TypeScript check
- [ ] `npm run lint` (remaining findings recorded)
- [ ] `npm run build`
- [ ] Local health and 61-conference smoke test

## Safety and release checklist

- [ ] No secrets, `.env` files, databases, uploads, local deployment documents,
      or generated migration reports are tracked.
- [ ] Database and persistent-storage effects are described.
- [ ] Migration files are included when the schema changes.
- [ ] Backend and frontend versions agree.
- [ ] `CHANGELOG.md` is updated when appropriate.
- [ ] No tag, release, merge, or deployment is implied by this pull request.
