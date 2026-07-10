# App Guidelines

## Skill Map

Use the following skills for frontend work in this app:

- `skills/corporate-style-guard`: use for any UI, layout, shell, spacing, typography, color, card, button, badge, navbar, or profile styling work that must stay visually homogeneous and aligned to the corporate Ant Design-based system.
- `skills/react-composition-guard`: use when a React file mixes UI with logic, data fetching, derived state, or side effects, or when a component should be split into hooks, helpers, or smaller view components.
- `skills/frontend-quality-guard`: use before finishing frontend changes, especially after edits to components, hooks, styles, or types, to verify type safety, lint, and build expectations.

## Usage Order

For frontend changes, prefer this order:

1. Apply `skills/corporate-style-guard` while designing or refactoring the UI.
2. Apply `skills/react-composition-guard` while splitting logic from presentation.
3. Apply `skills/frontend-quality-guard` before handing the change back.
