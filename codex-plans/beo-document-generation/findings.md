# Findings: BEO document generation

## Requirements
- Compile client, date, headcount, venue, menu, timeline, staff assignments, and special instructions from the event record.
- Render a polished single-page BEO that acts as the operational source of truth for team leads.
- Let users download the BEO as a PDF.
- Follow existing app and PDF patterns.
- Verify the core flow with a temporary Playwright test, then delete that test.
- Run the repository's required `bun run check` gate before claiming completion.

## Research Findings
- The checkout is on `main` and already has extensive unrelated modified and untracked work.
- Relevant pre-existing state includes a modified `src/features/events/EventDetailPage.tsx`, modified `src/styles/app.css`, and an untracked `src/features/events/beoPdf.ts`.
- Generated and Builder-owned files are dirty from existing work and must not be hand-edited.
- No exact BEO-related memory entry was found; current checkout evidence will be authoritative.
- The pre-existing BEO work already uses the app's established `jsPDF`, tenant-branding, filename, and download patterns.
- The current BEO draft includes client, event dates, headcount, venue, timeline, selected dishes, and operational notes, but it does not include staff assignments.
- The current PDF helper calls `doc.addPage()` when content overflows, so it does not satisfy the explicit single-page requirement.
- Existing authored workforce source models both `EventAssignment` (person, event, role, optional time window) and `Shift` (person, optional event, role/title and time window); `EventAssignment` is the direct semantic match for “staff assignments.”
- Generated query exports include direct-by-event queries for timeline activities and shifts, while the generated React hooks expose list queries for people and shifts.
- The relevant files were unchanged between the first and second inspection; their last writes were roughly seven minutes before the second check.
- `.aboardai/features/beo-document-generation/feature.json` exactly matches the user request; its activity log is this Codex session, so the stable pre-existing draft belongs to the current feature rather than a separate active writer.
- `EventAssignment` provides event, person, role, optional start/end, encrypted notes, and lifecycle status. `Person` provides given/family names.
- The established roster view resolves staff names as `givenName + familyName` and excludes only soft-deleted assignments; the BEO should additionally omit `unassigned` assignments while retaining meaningful operational states such as confirmed or checked in.
- The event record's source queries can all be held to a loading barrier before enabling download, preventing partial BEOs.
- The current authored event-detail diff already wires the BEO download button to complete client, menu, timeline, staff, and branding inputs; unrelated event-detail changes in the same file must be preserved.
- The current BEO helper now uses a fixed letter page and contains no `addPage()` call, with a literal `1 / 1` footer.
- `jsPDF` is already an application dependency; no package change is needed.
- The focused TypeScript check passes, and both Playwright 1.61.1 and Poppler (`pdfinfo`, `pdftoppm`) are available for the required browser and visual verification.

## Technical Decisions
| Decision | Rationale |
|---|---|
| Build on the stable pre-existing BEO patch | It is already aligned with established PDF patterns; replacing it would risk losing user work. |
| Add staff input explicitly | The requested BEO content is incomplete without operational assignments. |
| Replace overflow pagination with a one-page layout strategy | The feature explicitly requires a single-page BEO, so silent page creation is a requirement mismatch. |
| Use an editorial operations-sheet layout | A dense overview plus menu, timeline, and staffing columns is faster for team leads to scan than a long report-style list. |
| Keep special instructions as an explicit full-width band | Service, operational, accessibility, and dish/assignment notes remain visible rather than becoming a generic footer. |

## Issues Encountered
| Issue | Resolution |
|---|---|
| Shared planning files already contain other work | Created this isolated task directory under `codex-plans/`. |

## Resources
- `AGENTS.md`
- `.aboardai/context/codex-implementation.md`
- `.aboardai/context/computer-use.md`
- `.aboardai/context/review-changes.md`
- `src/features/events/EventDetailPage.tsx`
- `src/features/events/beoPdf.ts`
- `src/workforce/assignment.manifest`
- `src/workforce/shift.manifest`
- `src/features/kitchen/menuPdf.ts`
- `src/features/finance/invoicePdf.ts`

## Visual/Browser Findings
- Playwright downloaded the PDF through the real browser-side `jsPDF` path with the expected stable filename and success status.
- `pdfinfo` reports exactly one US letter page (612 x 792 pt), with no encryption, forms, JavaScript, or extra pages.
- Extracted text includes the client, date/time, 128-person headcount, venue/address, both menu lines, both timeline activities, both staff assignments, and all three special-instruction categories.
- The 150 DPI rendering is clean and legible: no clipping, overlaps, black squares, broken rules, or spill beyond the single page.
