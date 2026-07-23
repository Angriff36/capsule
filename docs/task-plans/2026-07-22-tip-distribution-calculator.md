# Tip distribution calculator implementation

## Goal

Let finance enter an event's total gratuity, distribute every cent across assigned staff by equal, hours-weighted, or configurable role-weighted rules, print a receipt/signature sheet, and prepare the shares for payroll review.

## Implementation

- Added `/finance/tips` and a Tips item to the finance workspace.
- Derived eligible staff from active EventAssignment rows and hours from event-linked Shift rows, falling back to assignment windows.
- Added editable inclusion, hours, and per-role weights.
- Allocated integer cents with deterministic largest-remainder rounding so the result always matches the collected total.
- Added a print-specific distribution sheet with event metadata, pool basis, exact shares, and receipt signature lines.
- Created governed prepared PayrollInput rows with event/person/optional-shift attribution and deterministic idempotency keys.
- Added a versioned encrypted-note bridge because generated encrypted numeric storage is currently schema-incompatible; Capsule issue #76 tracks removal of that bridge.
- Updated payroll export compilation so finalized gratuity-only inputs contribute their amounts without replacing clocked or reviewed hours.

## Verification

- `bun run typecheck` — passed.
- `bunx vitest run tests/finance-routes.test.ts` — 6 passed.
- `bun run check:payroll-manifest` — passed.
- `bun run build` — passed.
- `bun run secrets` — passed.
- Focused Prettier check — passed.
- Temporary Playwright spec — passed in Chromium for equal, hours-weighted, and role-weighted exact-cent allocations, money parsing, and payroll-note round trips; deleted after verification.
- Focused payroll export script — preserved 8 recorded hours and added a `$42.50` gratuity.
- `bun run check` — attempted; ownership, proof registry, and manifest pin passed, then the existing event-manifest guard stopped on unrelated `CommandFailure.ts`, allergen briefing, incident, and timeline panel violations.

