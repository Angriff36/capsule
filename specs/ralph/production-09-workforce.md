# PR09 — Staff the event through accurate payroll

_Serves JTBD(s):_ Josh — cover each service; Kayden — know the assignment and get paid correctly.

## Job Statement

Carry a worker from onboarding through assignment, actual time, and corrected payroll without duplicate identities or rekeying.

## Baseline and ownership

Draft requirements; shared contract: [production readiness](../../docs/product/production-readiness.md). Extend the existing workforce, Person, availability, assignment, time, and PayrollInput domains and their working screens. Existing models and payroll runtime proof are a baseline, not evidence that all employment workflows are complete. Issues #269, #270, and #75 are investigation pointers for revocation, identity correction, and overlapping time off; reproduce before labeling them missing.

## Acceptance Criteria

- [ ] PR09-01: An authorized manager can invite, onboard, suspend, revoke, and reinstate a worker from the app. Revocation removes future privileged access without deleting historical assignments, approved time, or payroll evidence.
- [ ] PR09-02: Correcting an email or linking an existing login retains one worker identity and its history. A conflicting identity is explained before a merge; invitations cannot confer another tenant's access.
- [ ] PR09-03: The roster exposes required coverage, assigned roles, availability, time off, overlapping assignments, and relevant qualification expiry. Conflicts identify the affected worker, event, and time; an optional qualification never blocks unrelated work.
- [ ] PR09-04: A worker sees the latest location, local start/end time, instructions, and assignment changes on a phone without access to sales margins or unrelated employee records. A manager can see whether a change was acknowledged, rather than treating a sent notification as acceptance.
- [ ] PR09-05: Check-in, check-out, breaks, and manager corrections preserve actor, actual time, timezone, and reason. Overnight shifts and daylight-saving changes produce correct elapsed time; retries cannot create duplicate time entries.
- [ ] PR09-06: Connection loss during time capture shows pending versus server-confirmed state. Reconnect reconciles the original action before retry; a worker can recover after refresh without silently losing or double-submitting time.
- [ ] PR09-07: Payroll preparation uses approved actual time and effective pay terms, not silently substituted planned hours. Missing rates, disputed time, and overlapping entries remain explicit; a correction creates traceable adjustments rather than rewriting an already exported payroll unnoticed.
- [ ] PR09-08: Managers can record event feedback, performance follow-up, and one-on-one notes with appropriately restricted visibility. A worker's operational event access does not expose confidential personnel notes.
- [ ] PR09-09: Repeated payroll export/sync keeps stable worker and pay-period identities. Local totals, provider acknowledgments, rejected entries, and later corrections reconcile per person and period; external rejection does not erase approved time.

## Dependencies and proof

PR02 owns imported staff identity; PR08 owns Nowsta transport; PR12 owns authorization; PR13 owns durable retries. Prove one native worker and one imported/relinked worker through assignment, time correction, payroll export, and revocation. Include overlapping leave, an overnight shift, and a reconnect retry.

## Out of Scope

Provider transport belongs to PR08; financial posting belongs to PR05. Neither boundary excludes the end-to-end staffing outcome.

## Open Questions

Confirm the authoritative payroll provider and existing pay/break/overtime rules before activating calculations. Do not invent employment rules or assume a CSV proves live synchronization.
