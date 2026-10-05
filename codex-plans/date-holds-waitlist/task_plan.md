# Date holds and waitlist

## Goal

Implement tenant-scoped soft date holds, ordered waitlists, warn-only collision visibility, expiry, and the in-app owner notification path.

## Phases

- [in_progress] Inspect existing Manifest entities, Convex seams, notifications, and calendar/event UI.
- [in_progress] Design the source-first Manifest and authored Convex/UI integration.
- [pending] Regenerate generated artifacts and repair integration errors.
- [pending] Run focused checks, the required repository gates, and a temporary Playwright verification.
- [pending] Inspect final diff and prepare independent-review handoff.

## Constraints

- Preserve the clean starting tree and do not commit, push, deploy, or edit generated files by hand.
- Holds and conflict checks are warnings, never booking/import blockers.
- Follow tenant checks and existing notification conventions.

## Errors encountered

| Error | Attempt | Resolution |
| --- | --- | --- |
| `manifest:regen` could not resolve `@angriff36/manifest/config` | 1 | Restore dependencies with `bun install --frozen-lockfile`, then rerun the prescribed regeneration command. |
