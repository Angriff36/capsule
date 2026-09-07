# Endstage closeout

Scope: integrate and release the completed one-login auth work and recipe-review loop; preserve their evidence, update documentation, and close their active branches/worktrees. Owner requested the reusable global skill at `~/.claude/skills/endstage-cleanup/SKILL.md`; Codex discovers the same source through its skills-directory junction.

## Initial inventory

- Auth branch: `fix/my-day-auth`, `0a5d38dd`; full checks and GLM-5.3 APPROVE recorded in `codex-plans/my-day-auth-fix.md`.
- Recipe branch: `ralph/recipe-review`, `b300922b`; clean and pushed. No active loop process found. Local browser qualification records 21/21 checks in `codex-plans/production-readiness-next/recipe-review-verification.md`. Integration review still required.
- Readiness planning branch `docs/production-gap-plan-20260906` is an ancestor of the recipe branch.
- Earlier `spec/production-readiness-20260905` documents are already present with later edits on main; inspect integration before archiving.
- Separate historical clone at `C:/Projects/capsule` contains unrelated uncommitted catalog/design work and historical worktrees. Preserved pending the owner's scope decision; not silently included in this release.
- Historical AC-006/013 manual review receipts remain missing. This closeout cannot label those product-readiness criteria passed.

## Release state

Auth, recipe and readiness-spec histories are integrated. Shared generated output was regenerated from both authored sources; current roadmap and the owner-approved development-auth allowance were retained over superseded specification copies. Fresh combined `bun run check` passed; independent integration review and production verification are pending.

The first independent Grok integration review rejected a split save/approval path for automatic exact ingredient matches (GitHub #284). Workbench create/save now requests governed approval inside the same transaction. Exact matches are confirmed without an extra operator step; incomplete drafts remain saveable. Runtime regression reproduced `reviewing / resolvedLineCount=0` before the fix and now covers ready create, save, finalize, failed-promotion rollback and header-only promotion of stored matches. The two new supporting labels now use the design's 13px token. Re-review and final release evidence are still required.

The finished recipe loop had no running `loop.sh` or matching scheduled task. Three stale recipe test roots, its preview server on 7813 and its Convex watcher were stopped after checking their exact command paths; 94 descendant processes were included. Unrelated application processes were left alone. `IMPLEMENTATION_PLAN.md` is explicitly closed, with no unchecked active tasks; this does not erase the remaining product-readiness backlog.

## Scratch disposition

- The reusable isolated Convex account proof is maintained at `scripts/verify-account-bootstrap.ts` and passes against the combined source.
- Nineteen auth setup/review scripts, logs and issue drafts are preserved under `.artifacts/auth-closeout/`. Historical `.artifacts/<auth-file>` references in the auth ledger refer to this archive now.
- Endstage logs and the release receipt remain under `.artifacts/`; sanitized outcomes belong in this directory. No secrets or imported business archives are being committed.
- Global skill: `C:/Users/Ryan/.claude/skills/endstage-cleanup/SKILL.md`; `C:/Users/Ryan/.codex/skills/endstage-cleanup` is a junction to that canonical folder. Creator validation passed with Python UTF-8 mode.
