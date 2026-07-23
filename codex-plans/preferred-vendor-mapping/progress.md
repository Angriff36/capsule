# Progress Log: Preferred vendor mapping

## Session: 2026-07-22

### Phase 1: Requirements and discovery
- **Status:** complete
- Actions taken:
  - Read required project context and applicable planning, Playwright, and frontend skill instructions.
  - Pinned branch, HEAD, and dirty worktree state.
  - Detected and preserved planning files for a separate payroll task.
  - Consulted prior purchasing-consolidation memory to identify likely source and authored seams.
  - Read the required domain-gating and no-invented-deferrals guidance.
  - Confirmed the Playwright CLI prerequisite and located relevant domain/UI files.
  - Traced the current singular ingredient preference and weekly routing reaction end to end.
  - Checked installed Manifest 3.6.41 collection and relationship semantics before choosing a model.

### Phase 2: Plan the implementation
- **Status:** complete
- Decisions:
  - Persist ordered vendor IDs and the scalar first choice in one Ingredient command.
  - Carry the scalar preference through PurchaseNeed events into WeeklyPurchasingConfig routing.
  - Add an inline ordered editor to Ingredient detail using generated hooks only.
  - Preserve the tenant default vendor as a no-preference fallback.

### Phase 3: Implement
- **Status:** complete
- Authored changes:
  - Added ordered `preferredVendorIds` plus governed `setPreferredVendors` on Ingredient.
  - Refreshed the scalar preference on IngredientDemand before purchase-need creation.
  - Routed weekly draft creation to the ingredient preference with tenant-default fallback.
  - Added ranked add/move/remove/save controls to Ingredient detail.
- Generation:
  - First regen stopped on a compile diagnostic before applying output.
  - Second `bun run manifest:regen` passed with zero assembly errors and emitted the new hook/schema/routing surfaces.

### Phase 4: Verify
- **Status:** complete with unrelated repository blockers
- Playwright:
  - Created a disposable Vite harness importing the real `PreferredVendorRankingEditor`.
  - Verified adding two vendors, moving the second to primary, and saving the exact ordered ID list in Chromium.
  - Removed the temporary spec, harness, and Playwright result file after the passing run.
- Repository gate:
  - `bun run check` passed toolchain, Builder ownership, proof emission/registry, and Manifest pin before stopping at unrelated Event direct-hook violations.
  - Filed https://github.com/Angriff36/capsule/issues/40 for the Event integration blocker.
  - `bun run format:check` separately reported 165 unrelated AboardAI/browser/local-work files; filed https://github.com/Angriff36/capsule/issues/41.
  - Targeted culinary and supply integration guards, feature-file formatting, typecheck, and production build all pass.

### Phase 5: Delivery
- **Status:** complete
- Reviewed the authored feature diff, generated routing branch, whitespace checks, and final target status.
- Files created/modified:
  - `codex-plans/preferred-vendor-mapping/task_plan.md`
  - `codex-plans/preferred-vendor-mapping/findings.md`
  - `codex-plans/preferred-vendor-mapping/progress.md`
  - `codex-plans/preferred-vendor-mapping/fixes.md`

## Test Results
| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| `bun run typecheck` | No TypeScript errors | Passed | pass |
| Supply contract + integration guard | Existing supply seams stay valid | 8 tests passed | pass |
| Existing weekly purchasing runtime proof | Existing workflow remains green | Blocked in unrelated Invoice policy during Event.approve | baseline blocker |
| Temporary Playwright ranking spec | Add, reorder, label primary, and save ordered IDs | 1 test passed in Chromium | pass |
| `bun run check:culinary-manifest` | Generated culinary APIs remain authoritative | Passed | pass |
| `bun run check:supply-manifest` | Generated supply APIs remain authoritative | Passed | pass |
| Targeted feature Prettier check | Authored TSX/docs formatted | Passed | pass |
| `bun run build` | Production bundle builds | Passed | pass |
| `bun run check` | Full repository gate passes | Stopped on unrelated Event direct-hook violations | blocked, issue #40 |
| `bun run format:check` | Whole checkout formatted | 165 unrelated AboardAI/browser/local-work files reported | blocked, issue #41 |

## Error Log
| Timestamp | Error | Attempt | Resolution |
|-----------|-------|---------|------------|
| 2026-07-22 | Planning-file patch expected an inexact table row | 1-2 | Re-read the live file and used narrower heading anchors |
| 2026-07-22 | Combined code patch expected an inexact Ingredient property line | 1 | Split into exact source/UI patches |
| 2026-07-22 | Preferred vendor argument landed in the wrong reaction block | 1 | Diff review moved it to `WeeklyPurchasingConfig.routeNeed` before generation |
| 2026-07-22 | `manifest:regen` rejected relation traversal in EventApproved fanOut | 1 | Denormalized the current preference onto IngredientDemand and routed from that scalar |
| 2026-07-22 | Existing weekly runtime proof failed in Invoice.issue finance role check | 1 | Classified as concurrent baseline drift; failure occurs before preferred-vendor routing |
| 2026-07-22 | Hidden background-process launch was rejected by policy | 1 | Started `bun run dev --host 127.0.0.1` in a yielded shell cell instead |
| 2026-07-22 | Playwright runner reported `test() did not expect to be called here` | 1 | Align temporary test import and CLI on the `playwright` package |
