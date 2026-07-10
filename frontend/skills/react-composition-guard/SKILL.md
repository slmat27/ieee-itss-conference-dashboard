---
name: react-composition-guard
description: Enforce clean React composition with a strict split between UI and logic, custom hooks for stateful behavior, and concise component files. Use when building or refactoring React components, hooks, or page shells that should stay reactive, readable, and maintainable.
---

# React Composition Guard

## Composition Rules

- Keep page and component files small.
- Move data fetching, derived state, and side effects into custom hooks.
- Keep presentational components focused on rendering.
- Keep props explicit and narrow.
- Move non-trivial helpers into nearby modules and shared data shapes into `src/types`.

## API Integration

- Put endpoint wrappers in `src/lib/api/*`; view code should not call `fetch` directly.
- Use `requestJson<T>` for JSON calls so credentials and headers stay consistent.
- Keep API response types and mapping functions in `src/types` or the endpoint module.
- Keep dev-only fallback and response normalization inside the endpoint module, not components.
- Components and hooks should consume app-shaped data such as `UserProfile`, not raw API payloads.

## Hook Split

- Create a hook when JSX and side effects are interleaved.
- Name hooks by behavior, not implementation detail.
- Return plain data and callbacks from hooks.
- Do not add wrapper hooks with no real logic.
