---
name: frontend-quality-guard
description: Enforce frontend quality gates for linting, build verification, and type safety. Use when finishing frontend changes, reviewing UI work, or validating that a React or TypeScript change is safe to merge.
---

# Frontend Quality Guard

## Quality Gates

- Run `npm run lint`.
- Run `npm run build`; in this repo it includes `tsc -b`.
- Run `npm run format:check` when formatting-sensitive files were changed or formatting is in doubt.
- Stop if any gate fails.
- Report missing tooling or environment blockers explicitly instead of assuming success.

## Review Focus

- Check for broken imports.
- Check for stale or duplicate components.
- Check for unused props, dead files, and leftover demo code.
- Check that changes still fit the local design system.
