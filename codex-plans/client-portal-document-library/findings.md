# Findings: Client Portal Document Library

## Working Tree Baseline

- Branch: `main`.
- The repository contains extensive pre-existing modified and untracked work.
- Existing overlapping areas include `src/features/clientPortal/`, `convex/clientPortal.ts`, contract/proposal/invoice/BEO PDF helpers, app routing, and global styles.
- No relevant entry was found in the memory registry for this exact feature.

## Discoveries

- The existing portal is an event-scoped, HMAC-tokenized, anonymous read model at `/portal/events/:token` and already projects tenant branding, event facts, and selected menu items.
- The public query is an authored Convex seam in `convex/clientPortal.ts`; generated Convex files must remain untouched.
- Existing authored jsPDF builders already cover proposals, invoices, and the operational BEO. The contract screen currently relies on browser print and has no programmatic PDF builder.
- Contract, proposal, and invoice tables all have `by_eventId` indexes.
- Exact document eligibility is explicit in the domain: contract `signed`, proposal `accepted`, and invoice statuses `draft`, `sent`, `viewed`, `overdue`, `partial`, `paid`, `voided`, `written_off`.
- Published invoices should include sent/viewed/overdue/partial/paid and exclude draft/voided/written-off records.
- The BEO is a live event document assembled from event facts, selected dishes, timeline activities, staff assignments, and tenant branding.
- Returning full Person records would leak staff email and phone data to the public browser. The projection must return only names and BEO-visible assignment fields.
- Existing PDF helpers accept full generated `Doc` types even though they use small field subsets. Narrow structural PDF input interfaces will let the public projection stay minimal while preserving existing operator callers.
- The portal feature's earlier browser verification established that the shared Convex deployment may not contain the new local query. A disposable Vite component fixture is the safe verification path because syncing this broadly dirty checkout would publish unrelated work.

## Decisions

- Keep the library event-scoped; a bearer link for one event must not expose documents for the client's other events.
- Treat the current BEO as always downloadable because it is a live snapshot, avoiding an invented approval gate.
- Do not expose draft, voided, or written-off commercial documents.
- Generate PDFs in the browser with the repo's existing jsPDF patterns; do not add dependencies or storage lifecycle.
