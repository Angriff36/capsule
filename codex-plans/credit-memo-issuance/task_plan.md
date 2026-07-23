# Credit Memo Issuance Plan

## Goal
Implement issuance of a credit memo against a paid invoice for post-event adjustments, with an explicit choice to reduce the current client balance or carry the credit forward.

## Constraints
- Preserve all unrelated dirty and untracked work in the shared checkout.
- Author domain behavior in Manifest source and use `bun run manifest:regen` for generated output.
- Do not hand-edit generated or Builder-owned files.
- Do not add or expand permanent tests; use a temporary Playwright verification test and delete it afterward.
- Run the focused verification and `bun run check` before claiming completion.

## Phases
1. **Repository and overlap audit** — complete
   - Trace current invoice/payment model, finance routes, generated hooks, and UI patterns.
   - Determine whether overlapping dirty files are stable user work or actively changing.
2. **Implementation design** — complete
   - Specify the minimal domain command/data shape and UI flow.
   - Read domain-gating guidance before changing Manifest policy or guards.
3. **Implementation** — complete
   - Make authored Manifest and UI changes only.
   - Regenerate through Builder if domain changes require generated output.
4. **Verification** — complete with tracked repository blocker
   - Run focused checks.
   - Create, run, and delete a temporary Playwright test for the core flow.
   - Run `bun run check`.
5. **Closeout** — complete
   - Review the final diff against the pinned baseline and summarize only this feature's changes.

## Errors Encountered
- Initial parallel preflight script exited before returning partial results. Resolution: split the checks into one resilient PowerShell command.
- A parallel source/docs/memory read rejected on `rg` exit code 1 when memory had no matching credit-memo entries. Resolution: separate commands and normalize no-match results.
- An unrelated temporary Playwright spec was removed by its owning session before inspection. Resolution: use a unique isolated temporary harness and do not rely on another feature's artifacts.
- The first temporary server launch inherited a 10-second command timeout and ended during the test. Resolution: relaunch the managed server with a two-minute lifetime.
- Running Playwright's Node CLI entry directly under Bun hung. Resolution: use the repository-local runner through `bunx playwright`, which listed and executed exactly one spec.
- The temporary Vite config initially served the repository root instead of the isolated harness. Resolution: set `root: __dirname` in the temporary config.
- Initial Playwright locators for Amount, Open invoice, and Due were ambiguous because similarly named deposit fields are present. Resolution: use exact labels or stable form names and an exact text regex.
- `bun run check` is currently blocked at `check:event-manifest` by direct Convex hooks in two unrelated untracked event feature files. The credit memo commercial gate passes; do not edit concurrent event work. Existing blocker: https://github.com/Angriff36/capsule/issues/40
- Generated review found the cumulative-credit constraint compiled against nonexistent `doc.priorCreditMemoAmount`. Resolution: inline the nullable source field expression in authored Manifest and regenerate.
- A closeout plan patch missed because the other feature session updated this file concurrently. Resolution: re-read the current plan and apply only the missing verification notes.
- A narrow issue search missed existing issue #40 and created duplicate #48. Resolution: confirmed #40 covers the same failure and closed #48 as a duplicate.

## Closeout
- Feature implementation and focused verification are complete.
- The plan remains in `codex-plans/` instead of being archived while the mandatory repository-wide gate is red on issue #40.
