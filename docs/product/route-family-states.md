# Route-family states (AC-170)

Swept 2026-10-03 (PL-ROUTE-STATES). For each screen group, the list page and
the main detail page were checked for seven states. "Shared" names the common
part that does the work. Proof: `tests/route-family-states.test.ts`,
`tests/route-error-boundary.test.ts`, `tests/route-record.test.ts`,
`tests/features/events/event-detail-route-guard.test.ts`,
`tests/app-route-behavior.test.ts`, `tests/command-failure-codes.test.ts`,
`tests/event-create-behavior.test.ts`, `tests/no-dead-actions.test.ts`.

## Shared parts

| State | Shared part |
| --- | --- |
| Not signed in / no company | `AuthGate`, `ClaimGate` (whole app) |
| Loading | `TableSkeleton` / `QueryLoadState`; after 10 s `useSlowQuery` turns it into "isn't loading, check your connection" |
| Empty | `EmptyState` with next steps |
| Missing / other company's record | `useRouteRecord` + the page's "not found" state; server get-by-id returns nothing for another company |
| Switched-off area by address | `SwitchedOffAreaGuard` in the main frame (new) |
| Field mistakes | browser required fields + `useFieldValidation` on event create and quote request |
| Someone else changed it | `classifyCommandFailure` -> "Someone else changed this" + reload |
| Not allowed | `classifyCommandFailure` -> "You can't do this" |
| Crash | `RouteErrorBoundary` (main frame and full-screen pages, clears on navigation); `AppErrorBoundary` last |

## Matrix

| Group | Loading | Empty | Filled | Not allowed | Field mistakes | Changed by someone | Crash |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Events | skeleton, slow message | yes | yes | detail "Event unavailable" | inline (create) | banner | boundary |
| Proposals | skeleton | yes | yes | share link: error state | prompt + banner | banner | boundary |
| Clients | skeleton, slow message (fixed) | yes | yes | detail "not found / other workspace" | prompt + banner | banner | boundary |
| Kitchen | skeleton, slow message (fixed on dish) | yes | yes | "Dish not found" | prompt + banner | banner | boundary |
| Inventory | skeleton | yes | yes | list empty, actions refused in plain words | prompt + banner | banner | boundary |
| Purchasing | skeleton, slow message | yes | yes | error state | prompt + banner | banner | boundary |
| Logistics | skeleton, slow message | yes | yes | error state | prompt + banner | banner | boundary |
| Staff | skeleton | yes | yes | list empty | prompt + banner | banner | boundary |
| Finance | skeleton, slow message (fixed) | yes | yes | "belongs to a different business" | prompt + banner | banner | boundary |
| Reports | skeleton | yes | yes | read-only viewer | prompt + banner | banner | boundary |
| Admin / Permissions | slow message (fixed) | n/a | yes | switches locked for non-admins | n/a | plain words (fixed) | boundary |
| Inbox / chat | skeleton | yes | yes | list empty | n/a | banner, unsent text kept | boundary |
| Event day | note, slow message (fixed) | n/a | yes | "unavailable" note | n/a | banner (run of show) | boundary (fixed: clears on navigation) |
| Client event view | card, slow message (fixed) | yes | yes | "link isn't available" | inline (quote) | n/a | last boundary |
| Imports | skeleton | yes | yes | not found | paste checks in plain words (fixed) | plain words (fixed) | boundary |
| Venues | slow message (fixed) | yes | yes | "Venue not found" + back link | prompt + banner | banner | boundary |
| Production | skeleton | yes | yes | list empty | n/a | banner | boundary |

## Decisions

**A list the person may not read shows the empty state.** Generated list reads
return an empty list when a role may not read the rows.

- (a) Server marks a refused read: honest, but the list reads are generated
  code (hand edits are erased) and would need a Builder change for every list.
- (b) Each page repeats the role rules to tell "empty" from "not allowed":
  the rules then live in two places and drift.
- (c) Keep the empty state; any action the person then tries is refused with
  "You can't do this" in plain words: no extra code, small confusion only for
  a person sent to an area their role does not cover (the menu already hides
  switched-off areas, and now a typed address says so too).

Chose (c). Revisit if Builder gains a "refused" list result.

**Field mistakes outside event create and the quote form.** Other forms use
required fields plus the plain-words banner from the server.

- (a) Add inline field errors to every form: most precise, large change with
  little gain on one- or two-field prompts.
- (b) Keep required fields + banner: the banner already names what to fix.

Chose (b).
