---
name: corporate-style-guard
description: Enforce the repository's corporate frontend style system across React UI work. Use when creating, reviewing, or refactoring pages, components, shells, navigation, cards, buttons, badges, typography, spacing, or any other frontend surface that must stay visually homogeneous and aligned to the existing Ant Design-based boilerplate.
---

# Corporate Style Guard

## Rules

- Use the existing design tokens first.
- Prefer `components/ui` wrappers over ad hoc Ant Design usage in page code.
- Keep layouts flat, minimal, and corporate.
- Keep the navbar edge-to-edge, borderless unless explicitly required, and aligned with the existing shell.
- Keep spacing, typography, borders, and shadows consistent with the theme tokens.
- Reuse `Button`, `Card`, `Input`, `Badge`, `AppShell`, `Page`, `Stack`, `ActionGroup`, `Kicker`, `PageTitle`, `PageCopy`, `SectionGrid`, and `UserBadge` before adding UI primitives.
- Add a new `components/ui` wrapper when the same inline styling repeats or when the component needs to become a stable design primitive.
- Keep page code focused on composition, not styling decisions.
- Keep component surfaces simple and rectangular unless the design system already defines another shape.
- Do not add decorative borders, gradients, or shadows unless the pattern already exists in the theme.
- Keep user-facing copy sparse and direct.
