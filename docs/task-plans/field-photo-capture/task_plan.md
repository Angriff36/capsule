# Task Plan: Field Photo Capture

## Goal
Allow delivery drivers and event coordinators to capture or choose photos on mobile, upload them to Convex storage, attach them to Delivery or Closeout records, and let office users view those photos.

## Current Phase
Phase 5

## Phases

### Phase 1: Requirements and discovery
- [x] Capture user requirements and repository constraints
- [x] Trace current Delivery, Closeout, attachment, and file-storage paths
- [x] Confirm no active overlapping edits
- **Status:** complete

### Phase 2: Implementation plan
- [x] Select authored seams and UI integration points
- [x] Define upload, attachment, rendering, and error-state behavior
- **Status:** complete

### Phase 3: Implementation
- [x] Implement the smallest complete storage/data seam
- [x] Implement mobile-first photo capture and record gallery UI
- [x] Preserve all unrelated user changes and generated ownership boundaries
- **Status:** complete

### Phase 4: Verification
- [x] Run focused static/runtime verification
- [x] Create and run a temporary Playwright test for the core flow
- [x] Delete the temporary Playwright test
- [x] Run `bun run check` (blocked only by escalated unrelated baseline failures)
- **Status:** complete

### Phase 5: Delivery
- [x] Review the final diff for scope and ownership
- [x] Archive the completed plan
- [x] Prepare the required tagged summary
- **Status:** complete

## Key Questions
1. Are Delivery and Closeout records already exposed in authored UI and generated Convex APIs?
2. Is there an existing generic Attachment/file-storage path that should be reused?
3. What authenticated local test state is available for Playwright verification?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Treat the existing dirty tree as user-owned | The checkout contained broad modifications before this task began. |
| Avoid generated files and use authored Convex seams | Required by AGENTS.md ownership rules. |
| Extend Attachment parent types with `delivery` and `closeout` | Keeps binary storage and governed metadata on the existing shared contract. |
| Add a dedicated reusable photo component | Camera capture, image previews, and compact field UX differ materially from generic document attachments. |
| Show assigned Delivery records on `/my`; keep Closeout photos in the responsive Closeout page | Delivery has a direct driver relationship; Closeout has no modeled coordinator assignment. |
| Permit `eventManageAccess` to read EventCloseout | Event coordinators need the closeout identifier and context for venue-condition photos; finance write/execute policies remain unchanged. |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| `playwright.config.ts` was not present at the repository root | 1 | Inspect the repository's actual browser tooling before creating the required temporary spec. |
| Parallel discovery script returned exit 1 when one `rg` search had no matches | 1 | Use guarded PowerShell path checks and capture each read independently. |
| Planning-file update referenced a missing `## Notes` heading | 1 | Re-read the current plan and applied the update against `## Constraints`. |
| Playwright CDP run did not render `My Day` at `/my` | 1 | Inspect the captured error context once to identify the concrete browser state; do not repeat the same run unchanged. |
| Playwright error-context path no longer existed when read | 1 | Enumerate current `test-results` safely; another concurrent test process may have cleaned the shared folder. |
| A fresh CDP tab rendered Clerk sign-in instead of the authenticated app | 2 | Open the temporary verification tab from the existing authenticated Capsule tab so Clerk tab-scoped state is inherited. |
| Child tab also rendered Clerk sign-in; automation profile is no longer authenticated | 3 | Stop retrying auth. Use a temporary Vite harness around the real photo-capture view; verify Convex wiring separately with typecheck/regeneration. |
| `bun run check` stopped at `check:event-manifest` on seven unrelated existing event files | 1 | Verify the required GitHub escalation, then run remaining gates individually; do not alter unrelated event work. |
| Downstream gate sweep found unrelated format, coverage, and baseline-decay failures | 1 | Verify existing GitHub issues by root cause; run feature-scoped formatting and preserve unrelated work. |

## Constraints
- Do not add or expand permanent tests unless the owner asks; the requested Playwright spec is temporary and must be deleted.
- Use `bun run manifest:regen` as the only regeneration path if domain changes require regeneration.
- Do not edit generated Convex, Manifest client wiring, schemas, wiring, seed, or diagrams directly.
- Preserve `.aboardai/**` and all unrelated dirty/untracked work.
- Run `bun run check` before claiming completion.
- Convex source changes require a separate normal deployment; this task does not deploy.
- Full gate blockers are tracked in GitHub issues #32, #40, #41/#46, #47, #56, and #57; no unrelated code was changed to work around them.
