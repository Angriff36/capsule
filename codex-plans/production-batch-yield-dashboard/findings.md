# Findings: Production batch yield dashboard

## Existing task brief

- The repository already contains `docs/task-plans/2026-07-22-production-batch-yield-dashboard.md` with initial decisions: completed, non-deleted batches only; positive planned yield; recorded actual yield; aggregate summed yields; group by recipe and unit; rank under-yield first; 30/90/365-day windows; generated reads only.
- These are planning claims until verified against the current source and generated hook shapes.

## Workspace safety

- The checkout is on `main`, ahead of `origin/main` by five commits, with a very large existing dirty and untracked delta.
- Multiple long-lived development processes exist. Exact feature paths and timestamps must be checked before any implementation edit.
- Existing dirty/generated files are treated as user or concurrent-session work and will not be cleaned, stashed, reset, or overwritten.
- During the first repository search, `productionYield.ts`, `ProductionYieldDashboardPage.tsx`, its CSS, and `productionRoutes.ts` appeared with the same new timestamp (`2026-07-22 11:00:24`). The system document and route catalog also already describe `/kitchen/yield`. This is direct evidence of a concurrent implementation of the exact slice, so product edits are paused until the writer stabilizes.

## Verified source shape so far

- Generated `ProductionBatch` reads exist, including `listProductionBatch` and recipe-scoped variants; authored UI must consume generated hooks rather than add an app-local query.
- Current generated schema exposes `plannedYield`, nullable `actualYield`, `yieldUnit`, nullable `completedAt`, recipe linkage, status, and soft-delete metadata.
- The concurrent authored calculation file already filters and aggregates these fields; its behavior still needs a line-by-line review against the acceptance criteria before adoption.
- The incoming files stabilized after an eight-second hash/timestamp comparison. `ProductionYieldDashboardPage.tsx` received one last write at 11:00:48, then no overlapping feature path changed during the comparison window.
- The authored page uses only generated `useListProductionBatch` and `useListRecipe` hooks and exposes a fixture-friendly `ProductionYieldDashboard` boundary for deterministic browser verification.
- Aggregation sums planned and actual yield per `recipeId + yieldUnit`, derives percentage from the sums, sorts ascending percentage variance (worst shortfall first), and keeps a mixed-unit total from presenting a misleading numeric aggregate percentage.
- The route is lazy-loaded at `/kitchen/yield`, listed in the culinary navigation and production sub-navigation, and documented as a read-only surface. No Manifest, policy, generated, or persistence change is part of the feature.
- The `App.tsx` and kitchen-route diffs contain extensive unrelated concurrent features. Any verification or correction must be scoped to the exact yield additions and must not rewrite those shared files wholesale.
- Source review found one concrete defect in the incoming helper: `Number(null)` is `0`, so nullable `actualYield` values were incorrectly treated as recorded zero output. The narrow fix returns `null` before numeric coercion, preserving valid numeric zero while excluding absent yields as required.
- The later concurrent writes were formatting-only in the page/CSS and then stabilized across three snapshots over twelve seconds. The nullable-number fix remained present.
- Local dependencies already include `@playwright/test`, `playwright`, and `playwright-core`; no package or lockfile change is needed for the required temporary browser test.
- Port 7812 is already occupied by another local process, so the temporary verification harness will use strict port 7813 and will not touch the existing server.
- The mandatory `bun run check` passed toolchain, Builder ownership, proof emission/validation, and Manifest registry pinning, then stopped at `check:event-manifest` on seven unrelated Event UI violations in `CommandFailure.ts`, `EventAllergenBriefingPage.tsx`, `EventIncidentPanel.tsx`, and `EventTimelinePanel.tsx`.
- This exact repository-wide blocker is already durably tracked by GitHub issue #60 (`bun run check blocked by event UI bypassing generated hooks and lifecycle metadata`), with related older issues #58, #56, and #40. Do not file a duplicate.
- Independent downstream gates passed: `bun run check:production-manifest`, `bun run secrets`, and `bun run build`. The build emitted the yield dashboard CSS/JS chunks successfully.
- `bun run test` ran 543 existing tests: 529 passed and 14 failed across 10 unrelated files. The failure classes are already tracked by issues #61/#64 (InventoryAuditLog supply-hook bypass), #62 (stale createVia mapping expectation), #63 (admin navigation test still planned), #65/#32 (Event approval invokes Invoice.issue under a non-finance caller), and #60 (Event integration guard). No yield-dashboard assertion failed and no test was disabled or changed.

## Playwright prerequisite

- `npx` is available at `C:\Program Files\nodejs\npx.ps1`; repository verification commands will still follow the project Bun convention.
