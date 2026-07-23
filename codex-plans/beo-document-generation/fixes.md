# Fixes Log: BEO document generation

<!-- Append resolved implementation or verification issues here. -->

## 2026-07-22 - Complete single-page BEO content
- Issue: The initial BEO draft omitted staff assignments and could paginate, violating the requested operational source-of-truth contract.
- Fix: Added event-assignment/person compilation and a fixed single-letter-page layout with fitted menu, timeline, staffing, and instruction sections.
- Verification: `bun x playwright test beo-verification.spec.ts --workers=1 --reporter=line`; `pdfinfo output/playwright/beo-verification.pdf`; `pdftoppm -f 1 -singlefile -png -r 150 output/playwright/beo-verification.pdf output/playwright/beo-verification-page`.

## 2026-07-22 - Use the approved generated timeline hook
- Issue: The event integration guard rejected a raw Convex timeline query in `EventDetailPage.tsx`.
- Fix: Replaced it with `useListEventTimelineActivity` and filtered the generated list to the current event before BEO compilation.
- Verification: `bun run typecheck`; `bun run check:event-manifest` no longer reports `EventDetailPage.tsx`.
