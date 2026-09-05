---
name: application-style-guard
description: Preserve the repository's neutral, accessible application style across React UI work. Use when creating, reviewing, or refactoring pages, components, shells, navigation, cards, buttons, badges, typography, spacing, or other frontend surfaces that should remain consistent with the existing Ant Design-based interface.
---

# Application Style Guard

## Rules

- Use the existing semantic design tokens before introducing new colors or
  measurements.
- Preserve readable contrast, visible focus states, keyboard access, and
  responsive behavior.
- Prefer `components/ui` wrappers over ad hoc Ant Design usage in page code.
- Keep navigation, spacing, typography, borders, and shadows consistent with
  the current application shell.
- Reuse `Button`, `Card`, `Input`, `Badge`, `AppShell`, `Page`, `Stack`,
  `ActionGroup`, `Kicker`, `PageTitle`, `PageCopy`, `SectionGrid`, and
  `UserBadge` before adding UI primitives.
- Add a new `components/ui` wrapper when inline styling repeats or a component
  should become a stable application primitive.
- Keep page code focused on composition rather than styling decisions.
- Avoid decorative gradients, glow effects, or unrelated third-party branding.
- Preserve the IEEE ITSS product identity without implying official
  endorsement.
- Keep user-facing copy concise and direct.
