# Progress: Shift swap requests

## 2026-07-22

- Read project instructions and the binding domain-gating, no-invented-deferrals, and blocker-escalation rules.
- Read the planning-with-files, frontend-design, and Playwright skill instructions.
- Pinned the dirty checkout before edits.
- Created isolated planning files for this feature.
- Searched the current workforce domain, authored UI, docs, tests, and relevant diffs for existing shift-swap behavior.
- Confirmed the feature is not already implemented and identified substantial pre-existing changes in the same workforce area.
- Logged and corrected a Windows `rg` glob incompatibility during reaction-pattern discovery.
- Located the staff self-service `/my` route, manager roster surface, authored scheduling seam, and Manifest cross-entity reaction patterns.
- Confirmed current identity mapping, Person eligibility semantics, and the server checks used by the existing shift scheduler.
- Completed discovery and locked the source-first transactional design plus staff/manager UI surfaces.
- Added the `ShiftSwapRequest` lifecycle, atomic Shift reassignment reactions, candidate eligibility evaluator, staff self-service card, manager approval page, routes, navigation, and workforce documentation.
- Ran `bun run manifest:regen`: Builder applied the generated query/mutation/schema/hook/contracts and diagrams with no conflicts or deletions.
- Verified the generated approval → stage → apply chain stays within one mutation transaction.
- Passed `bun run typecheck` and `bun run check:workforce-manifest`.
- Ran the required temporary Playwright spec with the version-matched 1.61.1 runner; the real generated propose → accept → approve flow passed and the assignment changed only after manager approval.
- Deleted `shift-swap-verification.spec.ts` after the passing run.
- Filed GitHub issue #77 for the confirmed Manifest `self.id` projection defect.
- Ran `bun run check`; it stopped at unrelated `check:event-manifest` violations and was escalated as GitHub issue #78.
- Passed final feature-scoped `bun run check:workforce-manifest`, `bun run build`, and Prettier checks.
- Confirmed the temporary Playwright spec was deleted and removed its `.last-run.json` artifact.
- Re-ran final TypeScript after the last regeneration and confirmed issues #77 and #78 are open with the recorded evidence.
- Reviewed the final feature paths and completed delivery with the full gate honestly marked blocked by #78.
