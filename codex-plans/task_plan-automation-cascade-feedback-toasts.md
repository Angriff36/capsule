# Automation cascade feedback toasts

## Goal

Show a truthful success result after Event approval and waste recording, with a direct route to the affected purchase needs or stock line.

## Phases

- [x] Inspect the current cascade-feedback implementation and prior review findings.
- [x] Correct approval feedback so it makes no unproven creation-count claim.
- [x] Correct purchasing scope clearing and extract the scope resolution seam.
- [x] Complete focused UI extractions: the real-host Storybook story is added; the requested EventDetail/Purchasing page-size refactors remain.
- [x] Run focused, repository, and temporary Playwright verification, then leave the diff ready for independent review.

## Errors Encountered

| Error | Attempt | Resolution |
| --- | --- | --- |
| Temporary Playwright test collection used incompatible parent-checkout package resolution | 1 | Removed the temporary test/config. Do not repeat until this worktree has an isolated app URL and a coherent Playwright installation. |
| `bun run check` stayed active at `tsc --noEmit` after earlier gates passed | 1 | Leave the process intact and report the gate as unresolved; do not claim completion. |
| Full coverage output exceeds the terminal capture limit | 1 | The complete suite ran after focused, formatting, build, secrets, and baseline gates; retain the known shared-dependency coverage mismatch as an independent-review follow-up rather than inventing a pass result. |

## Constraints

- Do not edit generated Convex or Manifest client files.
- Show cascade feedback only after the owning mutation resolves.
- Keep the existing visual language and direct routes subject to their normal authorization.
- Preserve unrelated working-tree changes.
- Do not edit generated Convex or Manifest output, commit, push, deploy, or merge.
