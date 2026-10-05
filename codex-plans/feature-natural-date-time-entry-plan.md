# Natural-language date/time entry

## Goal
Add natural-language entry and safe start/end suggestions to existing schedule controls without changing persisted formats or backend contracts.

## Phases
- [in_progress] Map shared date inputs, their call sites, current save semantics, and UI conventions.
- [pending] Implement the smallest shared parser/input extension and pair it into event and shift flows.
- [pending] Add focused tests authorized by this feature request and run static gates.
- [pending] Run a disposable Playwright browser check, remove it, and leave the diff ready for review.

## Constraints
- Preserve pre-existing planning artifacts and any unrelated changes.
- Do not modify Manifest, generated code, Convex, imports, deployment, or global configuration.
- Keep native calendar/time-picker fallback and existing persisted value formats.
