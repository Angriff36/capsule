# Findings and Decisions

## Requirements
- Calculate pack-list serving ware and smallwares from menu, event headcount, and service style.
- Rules must be configurable by dish and guest basis.
- Pre-populate calculated quantities without losing manual pack-list work.
- Perform a temporary Playwright verification test, then remove it.

## Research Findings
- The repository already has `src/operations/service-style-kit.manifest`, explicitly designed to fan configurable kit lines to a pack list.
- `src/culinary/serving-by-style.manifest` and `DishContainersPanel` are related existing menu/service-style derivation seams.
- Shared UI guidance calls for the existing ledger table and `StatusChip`, rather than a new presentation primitive.
- The current branch is `feature/smallwares-pack-out-calculator-6e021418` and the worktree was initially clean.

## Technical Decisions
| Decision | Rationale |
|---|---|
| Extend existing service-style-kit/pack-list cascade if it meets the requirement | It already owns configurable event-size-aware lines and avoids duplicate domain models. |

## Issues Encountered
| Issue | Resolution |
|---|---|
| None | — |

## Resources
- `AGENTS.md`, `DESIGN.md`, Manifest reference, Convex guidelines, and component catalog.

---

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
