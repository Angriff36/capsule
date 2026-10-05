# Findings: Venue logistics profile

## Requirements
- Persist dock, elevator, kitchen equipment, power, parking, arrival restrictions, and day-of access contact per venue.
- Surface the current venue profile on linked event detail and BEO views.
- Use the approved manifest regeneration path and temporary Playwright verification.

## Research Findings
- Venue is authored in `src/operations/event.manifest`, not in a separate module manifest.
- The facilities feature already has `VenueSiteVisitPanel.tsx` and `venueSiteVisit.ts`; these are the first surfaces to inspect rather than creating a competing profile flow.
- Event detail is the `src/features/events/dashboard/` route, while the current BEO export lead is `src/features/events/beoPdf.ts`.

## Technical Decisions
| Decision | Rationale |
| --- | --- |
| Use optional Venue fields | Existing venues remain valid and an absent profile has a truthful empty state. |

## Issues Encountered
| Issue | Resolution |
| --- | --- |
| None | — |
