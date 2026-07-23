# Progress: Client Communication Log

## Session: 2026-07-22

### Phase 1: Requirements and discovery
- **Status:** complete
- Actions taken:
  - Read the required project context and applicable skills.
  - Pinned branch `main` and captured the pre-existing dirty worktree.
  - Started a lightweight memory pass for prior Capsule Event wiring conventions.
  - Located the existing `ClientContact`, `Client`, and `Event` domain sources and their detail routes.
  - Verified that server-owned `context.actorId` is available through Capsule's Clerk-to-Manifest auth seam.
  - Confirmed target file dirtiness and selected an additive shared panel that does not require changes to the already heavily modified stylesheet.
  - Planned an immutable Manifest record with exactly one Contact/Event target, trusted actor id, readable author snapshot, and a shared inline timeline panel.
- Files created/modified:
  - `codex-plans/client-communication-log/task_plan.md`
  - `codex-plans/client-communication-log/findings.md`
  - `codex-plans/client-communication-log/progress.md`
  - `codex-plans/client-communication-log/fixes.md`

## Test Results
| Test | Input | Expected | Actual | Status |
|------|-------|----------|--------|--------|
| TypeScript | `bun run typecheck` | No type errors | Passed | Pass |
| Commercial integration guard | `bun run check:commercial-manifest` | Generated commercial surfaces remain authoritative | Passed | Pass |
| Temporary Playwright | Contact email plus Event meeting entries | Both histories render date, medium, summary, target, and author | 1 Chromium test passed in 4.0s; temporary files deleted | Pass |
| Full repository gate | `bun run check` | Entire gate passes | Stopped at pre-existing Event direct-hook violations tracked by issue #40 | Blocked |
| Coverage | `bun run test:coverage` | All tests and ratchet pass | 52 files / 483 tests passed; 9 files / 13 tests failed on existing drift plus governed-creation expectation | Blocked |
| Production build | `bun run build` | Vite production bundle completes | 603 modules transformed; build passed | Pass |
| Format baseline | `bun run format:check` | Repository formatted | 200 unrelated AboardAI/Playwright/scratch files reported; issue #46 | Blocked |
| Baseline decay | `bun run baseline:decay` | Hygiene thresholds pass | Root entry count 56 exceeds cap 44; issue #47 | Blocked |

## Error Log
| Timestamp | Error | Attempt | Resolution |
|-----------|-------|---------|------------|
| 2026-07-22 | Trusted `authorId` stayed required in generated Convex args and was not injected | 1 | Reworked authored Manifest to stamp `user.id` directly; regeneration and issue escalation pending. |
| 2026-07-22 | UI target files changed during an additive patch attempt | 1 | Stopped, checked live processes and repeated SHA-256 hashes; preserved the stable landed implementation rather than overwriting it. |
| 2026-07-22 | Playwright wrapper could not launch `/bin/bash` on Windows | 1 | Kept the required CLI-first flow and switched to the wrapper's direct `npx @playwright/cli` invocation. |
| 2026-07-22 | PowerShell `npx --package` invocation could not resolve the advertised CLI binary | 2 | Confirmed package metadata, then switched to explicit `npm exec --package=... -- playwright-cli`. |
| 2026-07-22 | Prettier reported no parser for `.manifest` files | 1 | TSX/Markdown formatting completed; stopped passing Manifest files to standalone Prettier. |
| 2026-07-22 | Playwright could not find the Contact selector after opening the composer | 1 | Captured `test-results/.../error-context.md`; targeted diagnosis pending before retry. |
| 2026-07-22 | Composer stayed closed with Playwright output moved outside the Vite watch root | 2 | Changed the disclosure to an explicit current-state update before the final retry. |
| 2026-07-22 | Explicit disclosure state still reset in the disposable page | 3 | Reframed the failure as a harness-load race and added a settled-load boundary plus direct disclosure assertion. |
| 2026-07-22 | Form opened, but exact label locator did not resolve the Contact select | 4 | Switched the disposable spec to accessibility-tree role/name locators. |
| 2026-07-22 | PowerShell rejected a pipeline directly after a `for` loop | 1 | Collected the loop output first; the repeated hash check then confirmed stable feature files. |
| 2026-07-22 | `bun run check` stopped at Event integration guard on two pre-existing untracked Event files | 1 | Preserved unrelated files; exact blocker already tracked by Capsule issue #40. |
| 2026-07-22 | Coverage reported 13 failures | 1 | Classified failures; avoided modifying permanent tests because the owner has not authorized test expansion. |
| 2026-07-22 | Format check reported 200 unrelated files | 1 | Preserved AboardAI/browser/scratch state and filed Capsule issue #46. |
| 2026-07-22 | Baseline decay root-entry cap failed 56 vs 44 | 1 | Preserved mandated root-entry imports and filed Capsule issue #47. |

### Phase 4: Verification
- **Status:** complete with external gate blockers
- Scoped diff check passed and all temporary Playwright artifacts were confirmed deleted.
- The feature passed regeneration, generated ownership, TypeScript, secrets, commercial/integration guards, build, targeted formatting, generated contract coverage, and the disposable Chromium flow.
- The full `bun run check` remains red only on the documented unrelated repository blockers in issues #32, #40, #46, and #47.

## 5-Question Reboot Check
| Question | Answer |
|----------|--------|
| Where am I? | Phase 4: final repository verification. |
| Where am I going? | Plan, implement, regenerate, verify in Playwright, run the full gate, and report. |
| What's the goal? | Add a durable manual communication history attached to a Contact or Event. |
| What have I learned? | The shared tree is stable now; the generated author path and browser flow both have direct evidence. |
| What have I done? | Implemented the model/UI, regenerated, filed issue #44, passed focused checks and Playwright, and removed temporary artifacts. |

### Phase 2: Plan
- **Status:** complete
- Actions taken:
  - Chose `ClientCommunication` with a `record` command and no edit/delete lifecycle.
  - Chose broad `staffAccess` read/write/execute policies to match the any-team-member requirement.
  - Chose a shared authored panel placed on client and event detail pages.
- Files created/modified:
  - `codex-plans/client-communication-log/task_plan.md`
  - `codex-plans/client-communication-log/findings.md`
  - `codex-plans/client-communication-log/progress.md`

### Phase 3: Implementation
- **Status:** complete
- Actions taken:
  - Added the authored `ClientCommunication` record and root import.
  - Removed stale `ClientInteraction` deferral language from the related source comments and commercial-system status list.
  - Ran `bun run manifest:regen`; Builder completed with zero conflicts and zero assembly blockers.
  - Filed the trusted-context projection mismatch as https://github.com/Angriff36/capsule/issues/44 and regenerated the working `user.id` source expression.
  - Added the shared client communication timeline/composer to both client and event detail pages.
  - Verified the regenerated mutation no longer accepts `authorId` from the browser and stamps it from authenticated `user.id`.
  - Reviewed the concurrently landed shared panel and mounts after confirming their hashes remained stable.
  - Ran `bun run typecheck`; it passed.
  - Temporary Playwright verification passed 1 Chromium test in 4.0 seconds for Contact and Event targets.
  - Deleted the temporary Playwright spec, harness, config, and result files after the passing run.
- Files created/modified:
  - `src/sales/client-communication.manifest`
  - `src/app.manifest`
  - `src/sales/contact.manifest`
  - `src/sales/proposal.manifest`
  - `docs/systems/commercial-billing.md`
  - `src/features/clients/ClientCommunicationPanel.tsx`
  - `src/features/clients/ClientDetailPage.tsx`
  - `src/features/events/EventDetailPage.tsx`
  - Builder-owned generated outputs for the new entity, command, schemas, wiring, contract proof, and diagram
