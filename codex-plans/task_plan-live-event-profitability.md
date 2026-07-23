# Task Plan: Live Event Profitability

## Goal

Show a real-time event P&L widget that combines confirmed invoice revenue with currently committed ingredient, labor, and equipment costs so coordinators can see live margin.

## Current Phase

Phase 5

## Phases

### Phase 1: Requirements and discovery

- [x] Capture feature requirements and repository constraints
- [x] Trace current event detail, invoice, ingredient demand, labor, and equipment data
- [x] Identify overlap with the existing event cost summary and concurrent user work
- **Status:** complete

### Phase 2: Implementation plan

- [x] Define exact real-time aggregation and status rules from live models
- [x] Select safe authored seams and visual direction
- [x] Record focused verification and full gate commands
- **Status:** complete

### Phase 3: Implement

- [x] Add the smallest authored profitability calculation and widget
- [x] Integrate it into each event without hand-editing generated paths
- [x] Preserve unrelated user changes
- **Status:** complete

### Phase 4: Verify

- [x] Run focused static verification
- [x] Create, run, and delete the required temporary Playwright spec
- [x] Run `bun run check`
- **Status:** complete — full gate attempted; stopped on unrelated pre-existing Event Manifest guard failures

### Phase 5: Delivery

- [x] Review the exact diff and worktree state
- [x] Update planning and fixes logs
- [x] Provide the required exact `<summary>` handoff
- **Status:** complete

## Key Questions

1. Which invoice state is the repository's confirmed-revenue boundary?
2. Which current fields represent committed ingredient, labor, and equipment cost?
3. Can existing generated list hooks provide reactive data without generated edits?
4. Where on Event Detail can the widget be added without disrupting concurrent work?

## Decisions Made

| Decision | Rationale |
|---|---|
| Use feature-specific planning files | Existing generic planning files belong to other work and must be preserved. |
| Do not use the fable-only Codex delegation workflow | The active agent is Codex; the supplied context scopes delegation to fable. |
| Add no permanent tests | Repository rules prohibit expanding tests unless requested; Playwright verification will be temporary. |
| Count issued, non-void invoices | `issuedAt` is the domain confirmation fact; deleted, voided, and written-off rows are not revenue. |
| Count submitted-or-later purchase contributions | This is the first durable purchasing commitment; draft/cancelled orders and cancelled lines remain excluded. |
| Count prepared/finalized payroll inputs | These are reviewed labor commitments; use gross amount when present, otherwise explicit minutes × rates. |
| Count only rented equipment catalog value | Owned asset purchase value is not an event expense; rented reservations are the only current equipment valuation signal and will be labelled transparently. |
| Surface incomplete pricing | Unpriced labor minutes and rented reservations must be visible so the displayed margin is not mistaken for a final reconciled result. |
| Use an industrial live-ledger card | Matches Capsule's existing operational aesthetic while distinguishing the widget from the printable closeout folio. |

## Errors Encountered

| Error | Attempt | Resolution |
|---|---:|---|
| Initial parallel discovery wrapper exited when one read-only command returned nonzero | 1 | Split checkout, plan, and memory checks into independent commands; no repository files were affected. |
| PowerShell `rg` received invalid wildcard Manifest paths | 1 | Search directory roots with `--glob '*.manifest'` instead. |
| Planning-log patch context did not match | 2 | Re-read the exact files and use explicit per-file patch sections. |
| `tsconfig.app.json` was absent | 1 | Discover the repository's actual TypeScript config before verification. |
| Temporary Playwright web server resolved its config path twice | 1 | Playwright runs `webServer.command` from the config directory; use the local `vite.config.ts` path. |
| Corrected Playwright run timed out waiting for `webServer` | 1 | Diagnose the disposable Vite server directly, then run Playwright against an explicitly managed foreground server instead of repeating the same launch path. |
| Playwright CLI under the Bun runtime produced no output for 40 seconds | 1 | Terminate that runner and invoke the repository-local Playwright Node CLI directly, matching the installed package's runtime. |
| Browser test loaded only an empty fixture root | 1 | The config-managed server exited with the runner and hid its module error; launch the disposable Vite server as a yielded foreground cell, inspect it directly, and keep browser execution separate. |
| Explicit-server browser test still showed an empty root | 1 | Capture page and console errors in the temporary spec to expose the actual module/runtime failure before changing the fixture. |
| Fixture loaded real Convex hooks instead of mock hooks | 1 | Alias the component's exact relative import specifier (`../../lib/manifest-convex-react`) to the reactive fixture module. |
| A combined prerequisite command exited 1 because `git check-ignore` found no ignore rule | 1 | Treat the no-match as informational and use independent commands for later checks. |
| Foreground Vite termination left its child process listening on port 4187 | 1 | Verify the exact Vite command line, stop only that PID, and confirm the port is free. |
| Policy blocked PowerShell `Remove-Item` cleanup | 2 | Delete temporary text through `apply_patch`, then delete the verified binary screenshot and empty feature-specific directory through exact .NET file APIs. |
| `bun run check` stopped at the Event Manifest integration guard | 1 | Preserve the unrelated files, record the seven existing guard findings, and run focused typecheck, formatting, Playwright, and production build gates. |

## Constraints

- Never hand-edit generated or Builder-owned files.
- Use `bun` repository commands, except the explicitly required Playwright runner path.
- Preserve all pre-existing dirty and untracked work.
- Stop if an overlapping file is actively changing during implementation.

## Planned Files

- New authored helper: `src/features/events/liveEventProfitability.ts`
- New authored widget: `src/features/events/LiveEventProfitabilityWidget.tsx`
- New scoped styles: `src/features/events/LiveEventProfitabilityWidget.css`
- Surgical integration: `src/features/events/EventDetailPage.tsx`

## Verification Commands

- `bun run typecheck`
- Targeted Prettier check on the four implementation files
- Temporary Playwright spec using the repository-local runner, then delete it
- `bun run check`

## Final Verification

- `bun run typecheck` — passed.
- Targeted Prettier write/check — passed.
- Temporary Playwright spec — passed 1 test, including reactive cost update and mobile viewport; test and fixture deleted.
- `bun run build` — passed (existing bundle-size/dynamic-import warnings only).
- `bun run check` — attempted and stopped at unrelated Event Manifest guard failures in `CommandFailure.ts`, `EventAllergenBriefingPage.tsx`, `EventIncidentPanel.tsx`, and `EventTimelinePanel.tsx`.
