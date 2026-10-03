# Replacement dossiers

One dossier per tool Capsule replaces (spec `capsule-backend-end-state-spec.md`
§1.2 and §20.6; plan item PL-REPLACEMENT-PROOF; AC-176, AC-387, AC-706 to
AC-712). Each dossier answers the seven §20.6 questions for that tool:

1. Every recurring job maps to a working Capsule path (or an approved non-goal).
2. The job runs without retyping event facts Capsule already holds.
3. Old history and documents have a way in.
4. Staff do the job on the existing Capsule screens.
5. Outside deliveries (email, map, payment, payroll) show success or failure.
6. Side-by-side trial events match or knowingly improve.
7. The owner signs off on cutover and the way back.

Questions 1 to 5 are answered below from the code and the proof tests named.
Questions 6 and 7 need real Mangia events run in both tools by the people who
do the job, and the owner's sign-off. Those are not done. No tool is retired
by this document.

"Built" means a screen, the server step and a proof test exist. It does not
mean an operator has tried it. Paths: screens are page addresses; proofs are
under `tests/`.

Map made 2026-10-03 on the daily batch (`loop/batch-20261002e`).

## Total Party Planner (TPP)

Retires when lead-to-event work is covered (§20.6).

| Job | Where in Capsule | Proof | State |
| --- | --- | --- | --- |
| Leads and quote requests | `/clients/pipeline`, `/clients/quote-requests` | `proofs/quote-conversion`, `lead-pipeline-behavior` | Built |
| Clients, companies, contacts | `/clients`, `/clients/:id` | `proofs/import-company-contact`, `proofs/client-merge-history` | Built |
| Events | `/events`, `/events/:id`, `/events/tracker` | `proofs/lifecycle-event-contract`, `proofs/quote-to-booked-event` | Built |
| Menus | `/kitchen/menus`, event Menu tab | `proofs/menu-effective-price`, `proofs/event-dish-demand-lifecycle` | Built |
| Proposals: send, accept, change | `/clients/proposals` | `proofs/proposal-email-send`, `proofs/proposal-revision-lifecycle`, `proofs/signature-acceptance` | Built |
| BEO / event worksheet | event page Export BEO, `/workbooks` | `proofs/event-packet`, `proofs/event-packet-final-lock` | Built |
| Invoices | `/finance/invoices` | `proofs/invoice-email-send`, `proofs/event-invoice-commercial-source` | Built |
| Payment tracking | `/finance/payments`, invoice page | `proofs/invoice-payment-lifecycle`, `proofs/payment-accounting-truth` | Built (no live charging until the owner says so) |
| Staffing and to-dos on events | event Staffing / Timeline / To-dos tabs | `proofs/event-staffing-full-lifecycle` | Built |
| Food cost and event profit | `/finance/food-cost`, `/finance/profit-margins`, event Margin tab | `proofs/event-estimated-food-cost`, `proofs/event-food-cost-closeout` | Built |
| Pack lists | `/logistics/pack-lists` | `proofs/event-approve-opens-packlist`, `proofs/pack-list-delivery-lifecycle` | Built |
| Reports (TPP catalog, 89 reports) | `/reports` | `proofs/report-picker-reads`, `proofs/event-report-reads`, `proofs/financial-report-reads` | Built; old periods depend on the history import |

No retyping: `proofs/backend-golden-event` carries one event from lead to
closeout in 22 steps with nothing typed twice.

History: venues, contacts, companies, events, leads, payments, menus and pack
lists come in through the import run (`/admin/imports`, `convex/importCommit.ts`);
calls, emails, notes and tasks through `convex/importHistory.ts`; BEO PDFs,
contracts and floor plans are attached to the event (`convex/lib/importEventFiles.ts`).

Deliveries: invoice and proposal emails keep every try with the fix when one
did not go (invoice page and the proposal's "Emails" list). Capsule knows
"taken by the email service", not "delivered" or "bounced" (signed provider
callbacks wait on issue #52).

Open:
- Imported events all start in Planning; the TPP status shows on the event's
  "Imported from" panel as "Status in the old system".
- Old invoices are not created as invoices; finance gets a rebuild preview
  (`/admin/imports`, old invoice rebuild).
- Old payments wait on `/admin/reconcile` to be matched by hand.
- Imported menus are one dish per TPP row. This matches the old system: its
  menu catalog export (Name, Description, Category, Portion, Price, Tags,
  Stations) has no menu column, because TPP builds menus per event. Each dish
  keeps its TPP category; a BEO read in fills the event's own dish list.
- Recipes come in through the recipe import screen, not the main import run,
  so the run's counts do not include them.

## Nowsta (staffing)

Retires when schedule-to-approved-time work is covered (§20.6). Payroll
delivery is not being built now (owner, 2026-09-29).

| Job | Where in Capsule | Proof | State |
| --- | --- | --- | --- |
| Crew templates by service style and size | `/staff/crew-templates` | `proofs/staffing-template-ensure` | Built |
| Staffing needs from the event | event Staffing tab | `proofs/staffing-template-ensure` | Built |
| Availability, time off, qualifications, preferences | `/staff/time-off`, `/staff/qualifications`, `/my` | `proofs/event-staffing-guards` | Built |
| Suggested workers and auto-fill | event Staffing tab, `/staff/roster` | `proofs/eligible-suggestions` | Built |
| Offer, claim, assign, decline, waitlist, swap | `/my`, `/staff/swaps` | `proofs/coverage-flows`, `proofs/staff-coverage-flows` | Built |
| Schedule and change acknowledgement | `/my` | `proofs/schedule-change-ack` | Built |
| Event instructions for crew | `/my` | `proofs/field-staff-booking-read` | Built |
| Reminders | text and push alerts | `proofs/sms-reminder-dedupe`, `proofs/push-outbox-dedupe` | Built |
| Announcements | `/admin/announcements`, banner | `proofs/announcement-board` | Built ("read and closed by" count for managers) |
| Clock in and out, location at clock-in and clock-out | `/my`, `/staff/time` | `proofs/time-correction-audit`, `proofs/offline-clock-reconcile`, `features/workforce/clock-out-location` | Built: both taps keep the phone location when the person allows it; the time sheet says how far the clock-out was from the clock-in |
| Late and no-show alerts | `/staff/time` | `proofs/clock-alerts` | Built |
| Manager edits and time sheet approval | `/staff/time` | `proofs/time-correction-audit` | Built |
| Breaks and overtime warnings | `/staff/time`, `/finance/payroll` | `features/finance/break-classification` | Built |
| Planned against actual labor | event Margin tab | `features/finance/planned-vs-actual-labor` | Built |
| Approved time export | `/finance/payroll` | `proofs/payroll-approved-time` | Built (file only) |
| Agency workers without duplicate people | `/staff/roster` | `proofs/eligible-suggestions`, `features/workforce/staffing-agency-choices` | Built: the agency box offers the company's vendors and agencies already in use; another spelling saves as the known name |
| Past shifts for each worker | `/my` | `features/workforce/recorded-vs-planned` | Built (Capsule shifts only) |

No retyping: approval posts the staffing needs from the event's own style and
guest count; later changes add or cancel only open slots.

History: no way in yet for Nowsta workers, shifts or time. Past shifts and
labor history start empty at cutover. Needs a Nowsta export file to build
against (blocked).

Live Nowsta sync (PL-NOWSTA): blocked on a Nowsta account with API access.

## Galley (kitchen)

Retires when recipe-to-production and purchasing work is covered (§20.6).

| Job | Where in Capsule | Proof | State |
| --- | --- | --- | --- |
| Ingredients: storage, shelf life, nutrition, allergens | `/kitchen/ingredients/:id` | `features/kitchen/ingredient-data-breadth` | Built |
| Allergen roll-up for a menu or event | `/kitchen/allergen-matrix` | `proofs/incident-allergen-corrective-action` | Built |
| Units and conversions | ingredient page | `culinary-unit-meaning`, `proofs/incompatible-unit-review` | Built (never guesses) |
| Pack sizes and vendor items | ingredient page, `/inventory/contracts` | `proofs/menu-profitability-direct-ingredient`, `proofs/vendor-item-record`, `proofs/vendor-item-order-price` | Built: vendor items per ingredient (item number, pack, pack price with history); weekly order lines take the vendor's pack price |
| Prices and price history | ingredient page, `/inventory/purchasing` (price list file) | `culinary-model-cost-dated`, `proofs/receipt-exact-once`, `proofs/vendor-price-list-import` | Built: history grows from receipts and from each vendor price list read in (a new price keeps the old one) |
| Recipes, sub-recipes, yields, versions | `/kitchen/components/:id`, `/kitchen/dishes/:id` | `proofs/safe-culinary-operations` | Built |
| Method, station, equipment | recipe page, `/kitchen/stations` | `proofs/prep-work-baselines`, `dish-editing-behavior` | Built: each recipe step offers the kitchen station list and saves another spelling as the station's own name; a station change moves unstarted event prep. Recipe equipment is picked from the company equipment list (other words still allowed); each listed piece shows how many the company has |
| Photos, video, plating, holding and reheating | recipe page | `culinary/recipe-media-and-holding` | Built (one photo) |
| Substitutions | ingredient and recipe pages | `proofs/live-substitution-at-executing`, `features/kitchen/ingredient-substitution-ranking` | Built: saved swaps per ingredient (ingredient page), ranked on a stock shortage by free stock, new allergens and cost; recipe-level notes too |
| Menus and event servings | `/kitchen/menus/:id`, event Menu tab | `proofs/event-dish-demand-lifecycle` | Built |
| Live cost, known against missing | dish, menu and event pages | `proofs/menu-profitability-direct-ingredient`, `proofs/event-estimated-food-cost` | Built |
| Production plan and prep lists | `/kitchen/plan`, `/kitchen/prep` | `proofs/event-approve-plans-production-batch` | Built |
| Combined demand | `/inventory/demand` | `proofs/event-weekly-purchasing`, `proofs/purchasing-week-demand` | Built |
| Stock, holds, transfers, waste | `/inventory/stock`, `/inventory/counts`, `/inventory/waste` | `proofs/stock-movement-reconcile-replay`, `proofs/waste-void-trace` | Built |
| Choosing the vendor | `/inventory/purchasing`, ingredient page | `proofs/event-weekly-purchasing`, `proofs/preferred-vendor-routing` | Built (preferred vendor, else the default; not chosen by price) |
| Orders, receipts, bill matching | `/inventory/purchasing`, `/inventory/orders/:id` | `proofs/receipt-invoice-match`, `proofs/partial-receipt-correction` | Built |
| Cook sees the current method | `/kitchen/display`, recipe page from a prep task | `proofs/prep-work-baselines`, `proofs/recipe-edition-publish`, `features/kitchen/published-method-panel` | Built: a published edition keeps its steps; a cook sent from a prep task reads them while the chef changes a draft |
| Actual yield and waste back to closeout | `/kitchen/yield`, event closeout | `proofs/batch-actual-ledger`, `proofs/event-food-cost-closeout`, `features/production/yield-recipe-suggestion` | Built (3 or more batches more than 5% off plan suggest a recipe yield, with a link to the recipe) |
| Recipe publishing | recipe page | `proofs/recipe-edition-publish` | Built: recipes publish editions; a dish can be linked as an edition of another; menus go draft -> published (details change only in draft, unpublish needs a reason); an accepted proposal keeps its own copy of the menu, so a later dish change never rewrites what the client agreed |

No retyping: event dishes come from the accepted proposal; servings follow the
guest count.

History: recipes through the recipe import screen (`/kitchen/components/import`)
and the TPP recipe repair scripts; ingredients are filled from the USDA
library; opening stock through `/inventory/opening-stock`; vendors and their
item prices through the vendor price list card on `/inventory/purchasing`
(`proofs/vendor-price-list-import`). Older price history before that file
still has no way in.

## Goodshuffle Pro (rentals and decor)

Retires when quote-to-availability-to-pull-to-return work is covered (§20.6).

| Job | Where in Capsule | Proof | State |
| --- | --- | --- | --- |
| Catalog: photo, price, replacement cost, serial, place | `/facilities/equipment` | `features/logistics/catalog-fields`, `features/facilities/equipment-register-recount`, `features/facilities/equipment-place-choices` | Built (one photo). Storage place and Move offer the places already in use (catalog places and kitchen storage places); another spelling saves as the known place's name |
| Availability across events, repairs, late returns | event Equipment panel | `proofs/availability-realtime`, `proofs/equipment-reservation-conflict` | Built |
| Rental lines on proposals, approval, changes | `/clients/proposals` Pricing | `proofs/rental-proposal-lines`, `proofs/post-acceptance-change-order` | Built |
| Approved rentals held for the event | automatic on approval | `proofs/accepted-rental-holds` | Built 2026-10-03 |
| Vendor rentals and client-owned items | event Rental orders panel, pack list | `proofs/sub-rental-orders`, `proofs/accepted-rental-holds` | Built (a short approved item opens the vendor rental form filled in) |
| Pull, scan, pack, load, deliver, pick up, return, inspect | `/logistics/packs/:id`, `/logistics/dispatch`, `/logistics/returns` | `proofs/pull-inspect-flow`, `proofs/pack-scan-load-truck`, `proofs/custody-trail` | Built |
| Routes, trucks and trailers, crew, windows | `/logistics/route`, `/logistics/fleet` | `proofs/route-capacity`, `proofs/vehicle-assignment-conflict` | Built |
| Broken, missing, dirty, late, short to vendor; billing | `/logistics/returns`, event Equipment problems, invoice | `proofs/damage-to-billing`, `proofs/closeout-source-projection` | Built (late returns are read from the return times) |
| Rental money, vendor cost, losses, use | `/facilities` rentals card | `features/logistics/rental-reporting`, `proofs/accepted-rental-sales` | Built: revenue is the accepted price where the event has one, else held amount x list price; Download gives the month as a spreadsheet file (totals + each owned item's use) |

No retyping: since 2026-10-03 an item on the accepted proposal is held for the
event on approval (and on an accepted change), as many as are free; the rest
shows on the event as "approved by the client but not held".

History: no way in yet for Goodshuffle items, holds or orders. Needs a
Goodshuffle export file to build against (blocked). The event packet still has
a "check current Goodshuffle rentals" item for imported events.

## Final Lock binder, tracker, shared drives, event chat

Retires when every planning question and document is made by Capsule or
assigned as field work (§20.6).

| Job | Where in Capsule | Proof | State |
| --- | --- | --- | --- |
| Prove the event is ready | event page Workbook, `/workbooks` | `proofs/final-lock-readiness`, `proofs/readiness-projections` | Built |
| Ops Final Lock questions | Workbook, Final Lock questions | `proofs/event-packet-final-lock`, `proofs/event-packet-final-lock-sources` | Built |
| Sales Lock | event stage actions | `proofs/lifecycle-sales-lock-completeness` | Built as a completeness check (spec §3.3 asks for gate checks) |
| The eight packet parts in binder order | Workbook, prepare | `proofs/event-packet-native-parts` | Built |
| Office answers and blank field forms | Workbook field forms, `/my` | `proofs/event-packet-field-confirmation` | Built (field forms never pre-filled) |
| Binder color and event number on the cover | packet cover and brief | `event-packet-workbook`, `proofs/event-packet-native-parts` | Built (cover says "Event" since 2026-10-03) |
| Packet versions, out of date after a change | Workbook history | `proofs/packet-out-of-date-readiness` | Built |
| Keep BEOs, worksheets, drawings with the event | Workbook sources, Photos tab | `proofs/event-packet-evidence`, `proofs/record-source-provenance` | Built (kept and linked) |
| Route, map, load-in, setup drawings in the packet | packet venue part, pages at the back | `proofs/backend-golden-event` step 10, `proofs/packet-print-files`, `event-packet-attached-files` | Built (drawings, maps and uploaded BEOs print at the back as PDF pages or pictures; the venue map itself is still a link) |
| Tracker board | `/events/tracker` | `proofs/packet-out-of-date-readiness` (binder mark) | Built; the binder mark is set by hand and clears itself when a changed packet is printed |
| Event chat (replaces Slack) | event Chat tab | `proofs/event-communication`, `proofs/event-chat-channel` | Built |

History: BEO paste and TPP files on `/events/import`; original PDFs are kept
on the event and, since 2026-10-03, print at the back of the packet.

## Not done here (needs people)

- Side-by-side trials (question 6) for each tool: run real Mangia events in
  the old tool and in Capsule and compare amounts, schedules, papers and
  totals. Needs the operators and live events.
- Owner sign-off (question 7) and the release / cutover receipt (AC-176):
  the owner reviews this page, the trial results and the way back, and says
  which tool may stop.
