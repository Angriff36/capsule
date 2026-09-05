# PR13 — Ship current work without manual Git repair

_Serves JTBD(s):_ Josh — use the latest working app without becoming its release engineer.

## Job Statement

Automatically reconcile authorized development and release work with the real source and deployment state, then recover safely from failures.

## Baseline and ownership

Draft requirements; shared contract: [production readiness](../../docs/product/production-readiness.md). Extend `loop.sh`, repository checks, `scripts/release.sh`, build configuration, and existing job/reconciliation infrastructure. A branch push is not a merge or deployment; a Vercel READY result alone does not prove the matching Convex backend or authenticated workflow. Preserve user-owned worktree changes. Issues #271, #261, #171, #164, #161, #113, and #233 are investigation pointers, not permission to bypass guards.

## Acceptance Criteria

- [ ] PR13-01: Starting or resuming an authorized plan/build/release refreshes remote refs and compares the actual checkout against the configured integration branch. It reports source branch/SHA and missing upstream changes before claiming freshness; branch creation time is not used as evidence.
- [ ] PR13-02: Clean, non-conflicting upstream updates are integrated through the repository's approved workflow without asking the user to run Git commands. Conflicts identify exact files and preserve both sides; dirty/untracked work is never reset, silently stashed, overwritten, or included in an unrelated release.
- [ ] PR13-03: Preview startup identifies the owning worktree, source SHA, URL, and process. It checks whether an existing server serves that checkout before reuse and makes local versus preview versus production unmistakable. Restarting a stale server preserves unrelated processes and unsaved work.
- [ ] PR13-04: A completed build reports separate states for tests, branch push, integration, frontend deployment, backend deployment, and authenticated verification. New or changed specs invalidate an old all-complete claim; repeated non-converging plans produce a useful diagnosis rather than an endless successful-looking loop.
- [ ] PR13-05: An authorized production release incorporates required upstream changes, passes the repository's independent review and checks, and uses the approved release path. Build-only authorization never triggers deployment. The user is not told to manually merge, update, or invoke a release command that is already authorized and safely automatable.
- [ ] PR13-06: The release receipt ties the exact integrated SHA to the canonical Vercel URL, READY deployment, matching Convex code/schema, configuration checks, and a successful authenticated production workflow. Partial success remains partial; a stale alias or backend cannot be called shipped.
- [ ] PR13-07: Generated-output checks are reproducible from pinned dependencies on supported Windows and CI environments. Line endings, missing local Builder paths, or hash normalization cannot produce unexplained drift; repair the source/tooling owner without manually editing generated artifacts or disabling the check.
- [ ] PR13-08: Durable import, provider, notification, and reconciliation work survives process/browser loss with stable operation IDs, bounded retry/backoff, leases, cancellation rules, and visible dead letters. Monitor queue age, repeated failures, and uncertain external effects; one failed tenant does not starve another.
- [ ] PR13-09: Scheduled backups include the database, required file assets, and configuration references needed for recovery, with encrypted access and retention. A restore drill into an isolated environment proves record counts, relationships, assets, and authentication; “backup command succeeded” alone is insufficient.
- [ ] PR13-10: Production health checks and actionable alerts identify failed deployments, backend errors, stuck jobs, and expiring/broken provider connections without exposing secrets. The runbook defines safe retry, rollback/forward recovery, and the external actions that cannot be undone by a code rollback.
- [ ] PR13-11: A deployed frontend or service-worker update detects incompatible stale assets and offers safe recovery without discarding unsaved forms. The UI does not show an old cached release as current; a failed chunk load has an actionable recovery path.

## Dependencies and proof

PR12 protects credentials; PR14 verifies the full released flow. Exercise clean-behind, diverged, dirty, stale-server, frontend-only success, backend failure, and job-crash cases in isolated fixtures. Proposed recovery acceptance targets are a maximum 24-hour recoverable data gap and a four-hour restore; measure a drill and record any owner-approved replacement targets before readiness sign-off.

## Out of Scope

No permission to start a run, deploy, merge, delete data, or alter provider accounts is implied by these requirements. Automation removes authorized chores; it does not broaden authorization. Product features belong to their domain specs.

## Open Questions

Confirm alert recipients, backup retention, and recovery targets before enabling production schedules. Source/deploy receipts and safe Git automation do not depend on those business choices.
