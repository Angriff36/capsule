# Findings: Tip Distribution Calculator

## Requirements

- Enter total gratuity for an event.
- Distribute to assigned staff using equal, hours-weighted, or role-weighted pooling.
- Allow configurable role weights.
- Produce a printable distribution sheet.
- Feed finalized amounts into payroll input records.
- Verify core behavior with a temporary Playwright test, then delete that test.
- Do not add or expand permanent tests unless the owner asks.
- Do not hand-edit Builder/Manifest-generated files.

## Research Findings

- The repository began with extensive pre-existing authored, generated, and untracked changes; feature edits must be narrowly isolated.
- Existing `codex-plans` files belong to multiple concurrent feature efforts, so this work uses `codex-plans/tip-distribution-calculator/`.
- The governed payroll surface already exists: `PayrollInput.prepare`, `finalize`, and `markVoided`, plus generated hooks and `/finance/payroll` UI.
- Authored code must call the generated `useCreatePayrollInput` hook; direct writes to `payrollInputs` are explicitly rejected by the payroll integration guard.
- `PayrollInput` supports optional Event and Shift attribution, so event gratuity can feed payroll without inventing a parallel persistence table.
- The repository has `jspdf` and multiple authored PDF/print patterns, including an event allergen briefing sheet.
- Existing workforce entities include Person, EventStaffAssignment, Shift, and TimeRecord; discovery must determine which rows expose role and hours reliably.
- Package tooling is Bun. The required full gate is `bun run check`.
- `EventAssignment` provides event/person/role and optional start/end timestamps; event-linked `Shift` rows provide a second scheduled-hours source and the same role/person linkage.
- Person names and employee numbers are available through `useListPerson`; active assignments exclude deleted, unassigned, and no-show rows.
- The live generated mutation accepts `grossAmount: number`, but its encryption helper converts that number into a JSON string before writing to a schema field constrained to `v.number()`. This is a proven runtime blocker for direct structured gratuity amounts.
- Encrypted `notes` are schema-compatible because they are already strings. A temporary bridge can persist a versioned gratuity marker in a governed PayrollInput note and let the authored payroll compiler recover that amount without direct table writes.
- Tip-only payroll inputs must not replace clocked hours. The current compiler treats every finalized PayrollInput as a reviewed hours total, so it needs a separate count for hour-bearing inputs versus gratuity-only inputs.
- The finance App route, finance route constants, workspace nav, and Payroll page are already modified by other feature work. This feature should add only small, anchor-based lines to those files and keep all substantial implementation in new files.
- No Playwright config or permanent Playwright suite is present. The user explicitly requires a temporary test file; it can use the installed repo/tooling or Bunx without becoming a permanent test.

## Technical Decisions

| Decision | Rationale |
|---|---|
| Add `/finance/tips` as a focused workspace page | Keeps event gratuity work discoverable next to payroll while avoiding a large edit to the already-modified Payroll page. |
| Allocate integer cents with largest-remainder rounding | Every distribution sums exactly to the entered total and remains deterministic. |
| Default role weights to 1 and make hours/weights editable | Configuration remains transparent instead of imposing undocumented catering-role values. |
| Prefer event-linked Shift duration, then assignment duration | Uses existing scheduled facts while still handling assigned staff without a Shift row. |
| Create one governed PayrollInput per included person | Uses the generated command boundary and provides event/person attribution without direct Convex writes. |
| Store gratuity cents in a versioned encrypted note bridge | Direct encrypted money is currently schema-incompatible; notes preserve durable governed input until the generator is fixed. |
| Keep tip-only input minutes at zero and teach export not to override time | Prevents gratuity records from erasing real clocked hours in payroll compilation. |
| Use a settlement-ledger visual direction | A warm paper sheet, deep green settlement card, saffron accents, and signature lines fit the existing Capsule editorial system and the printable use case. |

## Issues Encountered

| Issue | Resolution |
|---|---|
| Shared dirty checkout | Preserve all unrelated changes and inspect overlap before every edit. |
| Generated encrypted money schema mismatch | Opened Capsule issue #76 and implemented the documented encrypted-note bridge without editing generated files. |

## Resources

- `AGENTS.md`
- `.aboardai/context/codex-implementation.md`
- `.aboardai/context/computer-use.md`
- `.aboardai/context/review-changes.md`
- https://github.com/Angriff36/capsule/issues/76

## Visual/Browser Findings

- None yet.
