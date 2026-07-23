# Findings: Field Photo Capture

## Requirements
- Mobile users can take a photo directly or choose an existing image.
- A photo can be attached to a Delivery as proof of delivery.
- A photo can be attached to a Closeout as evidence of venue condition.
- Photo bytes are stored in Convex file storage.
- Office users can see attached photos on the relevant record.
- Verification must include a temporary Playwright test that is removed afterward.

## Repository Constraints
- Authored UI lives under `src/app/**`, `src/features/**`, and `src/ui/**`.
- Authored Convex seams live under `convex/lib/**` plus explicitly authored top-level seams.
- Generated ownership paths must not be hand-edited.
- Existing tests may be run but permanent tests must not be added without owner instruction.
- The current worktree is broadly dirty; all pre-existing changes are user-owned.

## Research Findings
- `npx` is installed at `C:\Program Files\nodejs\npx.ps1`, satisfying the Playwright skill prerequisite.
- No directly relevant prior-memory entry was found for field photo capture.
- The repository already has a reusable Attachment domain model in `src/documents/attachment.manifest`, an authored Convex storage seam in `convex/fileStorage.ts`, and a reusable upload/list UI in `src/features/attachments/AttachmentsSection.tsx`.
- The existing parent contract supports only `eventRecord`, `client`, `contract`, and `vendor`; Delivery and Closeout need explicit parent values.
- The existing upload UI accepts arbitrary files and renders filenames only. Field photos need `accept="image/*"`, a camera hint, image previews, and field-oriented copy.
- A separate active session wrote `src/features/production/PrepBoardPage.tsx` at 08:41 while this task was running. Application edits remain paused until recent-write checks show the tree is stable.
- `DeliveriesPage` has no detail route; each delivery is operated directly from a list row. A record photo affordance should therefore expand inline beneath that delivery.
- `CloseoutPage` likewise exposes each closeout as a list row and already contains unrelated uncommitted Event Cost Summary work; photo integration must preserve that diff exactly.
- `/my` is the explicit phone-first staff surface. It currently loads shifts, prep tasks, pack lists/items, and availability, but not Delivery records.
- Delivery records already carry `driverId`, so `/my` can show assigned deliveries without inventing a new relationship or policy.
- `@playwright/test` 1.61.1 is present in `node_modules` even though it is not declared in this checkout's `package.json`; existing feature runs use temporary specs under `output/playwright` with `bunx playwright test`.
- The live Vite app responds at the documented `http://localhost:7811` address (IPv6 listener; `127.0.0.1` is not equivalent in this setup).
- A running automation Chrome exposes CDP at `http://127.0.0.1:63941`; the temporary Playwright spec can reuse its browser context instead of starting or stopping the user's servers.
- The reused CDP browser is already authenticated in Capsule (an existing page is open at `/staff/qualifications`), so the missing `/my` heading is likely a page/runtime state issue rather than a sign-in blocker.
- The shared `test-results` folder was cleaned before the first failure artifact could be read, so the revised temporary spec must include the current URL and body text directly in its failure message.
- The existing Capsule tab's URL was stale; both a fresh tab and an opener-created child tab rendered Clerk sign-in. Live durable upload cannot be browser-tested without credentials in the current automation profile.
- Verification will therefore split at the real seam: regeneration/typecheck cover the Convex upload contract, while a temporary Vite harness renders the production photo-capture view and lets Playwright exercise browser file capture, preview, responsive layout, and removal.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Extend the existing Attachment + fileStorage path | It already owns binary upload, governed metadata, tenant scoping, and resolved Convex URLs. |
| Add a photo-focused mode to the shared attachment UI | Reuses the proven data path while giving mobile staff camera capture and office users an image gallery. |
| Use inline per-record expanders on Delivery and Closeout lists | There are no dedicated record-detail routes, and this keeps capture reachable in the existing workflows. |
| Add assigned deliveries to `/my` | This is the repository's explicit phone-first surface, and Delivery already links directly to its driver. |
| Keep Closeout capture in its existing responsive page | There is no modeled coordinator-to-closeout assignment, so duplicating all closeouts into `/my` would expose irrelevant finance work and add noise. |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| Broad dirty worktree | Preserve it and limit edits to proven feature seams. |
| Concurrent Capsule writer detected | Continue read-only discovery and wait for a stable tree before implementation. |

## Resources
- `AGENTS.md`
- `.aboardai/context/computer-use.md`
- `.aboardai/context/review-changes.md`

## Visual/Browser Findings
- At a phone-width content surface, the field-photo panel reads clearly as one compact card: evidence title and instructions first, then equally prominent Take photo / Choose photo controls, success feedback, and a two-column-ready preview card.
- The uploaded image preview, timestamp/size metadata, and full-width Remove action remained legible without horizontal scrolling.
