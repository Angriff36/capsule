# Progress: Recurring Event Scheduling

## Implemented

- Weekly, monthly, and annual recurrence with end-on-date or total-event limits.
- Generated configure/stop commands and recurrence audit events.
- Internal automatic Draft materialization with retry-safe lineage and stale-job invalidation.
- Event dossier configuration, active/stopped summaries, and source links on generated Drafts.
- Events system documentation and generated schema/query/mutation/hook/contract/diagram surfaces.

## Verification

- `bun run manifest:regen`: pass, 22/22 assembly checks.
- `bun run codegen`: pass.
- `bun run typecheck`: pass.
- Focused Event/generated contracts: 356 tests pass.
- `bun run secrets`: pass.
- `bun run build`: pass.
- Temporary Playwright feature test: 1 pass; test and harness deleted.
- `bun run check`: attempted; blocked by pre-existing Event integration violations tracked in #40 and #56.

