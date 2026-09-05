# Applying the Unslop Review to Existing Capsule UI

Status: owner-approved review method, 2026-09-04

`DESIGN.md` remains the presentation authority. The generated Unslop analysis is a counterprofile: it tells reviewers which generic AI-interface habits deserve scrutiny, but it does not supply a replacement palette, type system, or component library.

## What is now reusable

- `bun scripts/audit-ui-patterns.ts` scans authored page and stylesheet sources and prints a deterministic review queue. It is deliberately non-blocking because keyword counts cannot distinguish a useful execution board from gratuitous card soup.
- `RecordPreviewSheet` provides the reusable desktop-right/mobile-bottom inspector behavior recovered from Capsule-Pro: portal rendering, Escape and backdrop dismissal, trapped focus, focus restoration, and body-scroll locking.
- `useVirtualWindow` provides a small fixed-row window for large authored indexes without adding a runtime dependency.
- The culinary catalog is the reference implementation: filterable index, bounded row mounts, one selected record, and at most one mounted image resolver.

## Route-family review order

| Family | Existing route examples | Review question | Preferred correction |
| --- | --- | --- | --- |
| Shared shell and controls | `src/app/shell`, `src/ui`, `src/styles/app.css` | Is a repeated defect caused by a shared primitive or token? | Fix the shared authored source once. |
| Catalog indexes | Culinary records, clients, templates, stock book | Is the page mounting rich content for every record? | Search/filter index, bounded rows, on-demand preview. |
| Object dossiers | Event, client, invoice, dish details | Does the object remain the clear subject? | Open ruled sections and local actions; remove equal-weight card stacks. |
| Working ledgers | Inventory, workforce, finance, logistics | Can operators scan, sort, and act without opening every row? | Dense semantic ledger with stable headers and explicit totals. |
| Execution surfaces | Event day, production, dispatch | Do time, state, ownership, and blockers dominate? | Preserve boards/timelines when they match the work; reduce decorative containers. |
| Workbenches | Imports, recipe assembly, reconciliation | Is side-by-side comparison genuinely required? | Keep purpose-built panes and collapse them deliberately on mobile. |
| External and print surfaces | Client portal, contracts, reports | Is the different material treatment required by audience or output? | Treat as an intentional exception when the artifact's job requires it. |

## Current source audit

The first advisory scan found 125 authored page/style files with at least one review signal. The largest raw card signals are `LeadPipelinePage.css`, `EventCapacityPlannerPage.tsx`, and `ImportRunDetailPage.tsx`; the largest narrow-column signals are in the client portal and finance tax workspace styles. These are inspection priorities, not findings: boards, print layouts, and specialist workspaces may be correct.

Run the current queue with:

```powershell
bun scripts/audit-ui-patterns.ts
bun scripts/audit-ui-patterns.ts --json
```

## Review loop

1. Open the real route at desktop and mobile sizes with representative data.
2. Identify the operator's primary decision and choose the route archetype.
3. Confirm whether a visual smell is actually obstructing that task.
4. Trace repeated instances back to their shared authored source.
5. Change the smallest shared cause that improves the whole route family.
6. Verify interaction, focus, long-list cost, responsive collapse, and reduced motion.
7. Run the advisory audit again and explain any high-count intentional surfaces in review.

Do not chase a lower audit count for its own sake. The outcome is faster, clearer work—not stylistic purity.
