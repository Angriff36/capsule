# Time-off request workflow progress

## 2026-07-22

- Read the repository instructions supplied for this task.
- Read the planning-with-files, frontend-design, and Playwright skills.
- Pinned the branch, HEAD, and dirty checkout.
- Confirmed existing staff availability and notification surfaces and no existing dedicated time-off request workflow by text search.
- Discovery is in progress; no product code has been edited.
- Read the binding domain-gating and no-invented-deferrals guidance.
- Traced the generated `Shift.schedule` create path, the equipment overlap seam, manager notification derivation, `/my` identity resolution, and workforce routes.
- Chose the scoped domain/UI/server design and moved into implementation.
- First `bun run manifest:regen` attempt failed because `deny` is a reserved Manifest identifier; renamed the command to `decline` before retrying.
- `bun run manifest:regen` then completed with no conflicts and generated the TimeOffRequest schema, mutations, queries, client hooks, contract surfaces, and diagrams.
- Added the authored staff request card, manager review route, notification derivation, shared overlap helper, and atomic shift scheduling seam.
- `bun run codegen` completed and `bun run typecheck` passed.
- First workforce integration gate attempt rejected the custom client hook inside the guarded feature directory. Moved it to `src/lib/workforceScheduling.ts` without changing behavior.
- Temporary Playwright spec passed in 3.4 seconds. It verified pending manager notification/review, denial not blocking a shift, approval clearing the notification, and approved overlap blocking a shift. The spec and disposable harness were deleted immediately afterward.
- Full `bun run check` reached the event integration guard and stopped on pre-existing violations in `CommandFailure.ts`, `EventAllergenBriefingPage.tsx`, `EventIncidentPanel.tsx`, and `EventTimelinePanel.tsx`. Time-off-owned paths were not implicated and the unrelated files were left untouched.
- Follow-up gates: secrets passed; coverage reported 551 passing / 14 failing tests with failures in stale creation mappings, existing event/supply guards, navigation expectations, and the current Event-to-Invoice reaction role path. Format check flagged four pre-existing files plus Playwright's own `.last-run` artifact. Removed the Playwright artifact before rerunning baseline decay.
- Opened GitHub issue #75 for generated Shift.schedule time-off overlap enforcement so the in-app atomic seam remains an explicit bridge rather than a silent permanent bypass.
- A new agent turn re-pinned the checkout and found the exact feature already partially implemented in the shared dirty tree. Paused product edits to check for active concurrent work and inspect only the feature-scoped delta.
- Confirmed concurrent writes at 12:30:41, then held product edits. A follow-up timestamp check at 12:31:38 showed the feature files stable, so review/verification may proceed cautiously with another final stability check before closeout.
- Fixed requester-facing manager notifications by filtering pending time-off notices against the current Clerk subject. First typecheck exposed the wrong Clerk package name; corrected it to the repo-standard `@clerk/react` import.
