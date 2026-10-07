# Release receipt — 2026-10-07, release 3107a4e8

The daily release of 2026-10-07, copied from the release machine's log (`.claude/loop-land.log` on the work PC; the receipt files `.artifacts/release/receipt-3107a4e8e0.{json,md}` were written in the release clone `C:\Users\Ryan\.capsule-release`). This page records what that release proves. It is evidence for AC-161, AC-726 and AC-727, and the still-open part of AC-030.

## What was released

- Release commit: `3107a4e8e0101cccc8d259898b0e3e94973f921d` on `main`, 2026-10-07 11:26 (Pacific), subject `[release] dev (reviewed by cursor-grok-4.5-high-fast)`, `Release-Candidate: 966c8736`.
- Range: `bdc3632a..3107a4e8` (the previous release to this one): 162 commits from `dev`, made by the product builder, repair runs and earlier sessions.
- Authorization: the lander's approved daily release (Ryan, 2026-09-28: "once the reviewer clears it it should go to production"). Not started by the product builder.

## Review (AC-726)

- Reviewer: grok via Cursor CLI (`cursor-grok-4.5-high-fast`, xAI). The product builder is Opus 5.5 (Anthropic), so the reviewer is a different provider. Codex gpt-5.6-sol is the first choice; grok is the named fallback (CLAUDE.md § 17, loop-constraints.md "Check & Land").
- Scope: the complete diff of the release candidate against the previous release (`release: candidate 3107a4e8…; review its diff against bdc3632a…`).
- Criteria: the repository review rule — release blockers only (regressions, data loss, security or company-separation failures, money errors, unsafe deploys, direct task violations) and no new needless steps for catering users.
- Verdict: APPROVE, stamped on the release commit subject and as `Reviewed-by: cursor-grok-4.5-high-fast APPROVE` on the landed commits in the range. The product builder did not run or read this review.

## Path and checks (AC-161, AC-727)

1. `scripts/release.sh` ran the full gate `bun run check` on the merge result before any push: 872 of 872 test files passed; `manifest-regen-check: generated output is current`.
2. One push to `main` (`bdc3632a..3107a4e8 main -> main`); the pre-push hook allows `main` only from the release script.
3. `scripts/deploy-production.sh` proved the frontend: `verify-vercel-release: ok - https://capsule-tau-eight.vercel.app serves the build of 3107a4e8…`.
4. It deployed the backend on the production box (pop-os) with `scripts/deploy-backend.sh --expect 3107a4e8…`: `deploymentProbe:health names 3107a4e8…`, `RESULT: PASS - backend deployed from 3107a4e8…; 1 queries respond; frontend HTTP 200`.
5. Final line: `RESULT: PASS - frontend and backend deployed at 3107a4e8…` (lander log 2026-10-07T19:30:22Z, verdict RELEASED).

## Release receipt legs (AC-030)

| Leg | Result | What the receipt says |
| --- | --- | --- |
| vercel | verified | https://capsule-tau-eight.vercel.app serves the READY deployment built from 3107a4e8. |
| convex | verified | The frontend points at pop-os; its backend code and schema were deployed from 3107a4e8. |
| config | verified | Deployment config check passed with zero blockers. |
| workflow | unverified | `workflow:authenticated_probe_not_run` — no production sign-in key on the release machine. |

The receipt headline is `PARTIAL — NOT shipped` because of the workflow leg alone. AC-030 stays open until the release machine has a production `CAPSULE_API_KEY` (and the product step `CAPSULE_RELEASE_WORKFLOW`); that is a production credential, not product code.
