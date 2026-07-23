# Time-off request workflow

Implemented a staff-to-manager time-off workflow with canonical Manifest state, live in-app review notifications, and atomic in-app shift blocking for approved ranges.

## Delivered

- `TimeOffRequest` domain with pending, approved, and denied states plus generated submit/approve/decline commands.
- Phone-first request form and request history in `/my` using `Person.authSubjectId` for self-service identity.
- Manager review queue at `/staff/time-off` with direct approve and deny actions.
- Pending request entries in the shared notification tray that disappear after review.
- Shared half-open overlap logic and an authored atomic `workforceScheduling.scheduleShift` seam that preserves Shift prerequisite checks and rejects approved time-off conflicts.
- Generated schema, queries, mutations, hooks, HTTP contract, Zod schemas, ownership ledger, and Mermaid companions through `bun run manifest:regen`.

## Verification

- Passed workforce integration guard, TypeScript, production build, feature formatting, secrets, baseline decay, and targeted diff checks.
- A temporary Playwright spec verified request submission, manager notification/review, denial allowing a shift, and approval blocking an overlapping shift. The spec and disposable harness were removed after the passing run.
- Full repository check remains blocked by unrelated dirty-tree Event integration violations. Standalone coverage completed with 551 passing and 14 unrelated failing tests.

## Follow-up

GitHub issue [#75](https://github.com/Angriff36/capsule/issues/75) tracks canonical generated `Shift.schedule` overlap enforcement for HTTP/MCP/agent callers. The authored atomic seam is the in-app bridge until the projection can hydrate cross-row overlap guards during governed creation.

