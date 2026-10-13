# Capsule screen map

One inventory of every screen. It was made once, on 2026-10-13. Then the merge
work started. The "Before" part is the state on `dev` at commit `30cb80f2b`. The
"After" part and the redirect list are filled in as each batch ships.

## How the count works

- **Route** = one `<Route path=…>` in `src/app/App.tsx` that shows a page.
  Redirect-only routes (`<Navigate>`) do not count. The not-found page does not
  count. The seven public token pages (client portal, proposal accept, share,
  deck, quote form, public menu, venue gallery) are outside the sign-in shell.
  They stay as they are and do not count.
- **Tab** = a fixed tab or view switch inside a page that swaps the main content
  and does not change the route path (for example `?tab=` on the event page).
  Date-window filters (7 / 30 / 90 days) count as tabs, because the page shows
  them as a tab strip. Tabs made from data (one tab per dish edition, one chip
  per category) do not count.
- Area tab strips (Staff, Finance, Kitchen …) are links to routes. They are
  counted as routes, not again as tabs.

## Baseline counts (before)

| Area | Routes | Tabs |
| --- | ---: | ---: |
| Home, My Day, Event Day | 7 | 3 (My Day range) |
| Events (list, create, setup, event page, printables) | 12 | 24 (event page 16, list 3, tracker 3, create 2) |
| Kitchen and production | 17 | 9 (prep 2, yield 3, recipe import 4) |
| Inventory | 12 | 7 (opening stock 3, waste 4) |
| Logistics | 14 | 9 (dispatch 4, returns 3, fleet 2) |
| Staff | 15 | 0 |
| Finance | 18 | 3 (profit margins) |
| Reports | 8 | 9 (Mangia 7, reports home 2) |
| Clients and sales | 12 | 0 |
| Facilities | 11 | 0 |
| Admin and settings | 16 | 0 |
| **Total** | **142** | **64** |

Kitchen tabs: prep (By service / By cook), yield window, recipe import
(Paste / Files and the phone panes Source / Review).

**Baseline: 142 routes + 64 tabs = 206 places.** The 30% target is 62 fewer
places, so at most **144** remain.

## Where each fact is edited (editing homes)

One place edits each fact. Other screens can show it and link to that place.

| Fact | Edit home (after) |
| --- | --- |
| Event basics (date, guests, client, venue, money) | Event page › Overview |
| Event stage moves (approve, sales lock, start, finish, cancel) | Event page header action |
| Event menu lines | Event page › Menu |
| Event prep tasks for one event | Event page › Prep. Day-to-day prep status: Kitchen › Prep board |
| Event staffing (assignments) | Event page › Staffing. Weekly shifts: Staff › Roster |
| Event timeline / run of show | Event page › Timeline (Event Day run view shows and ticks it) |
| Event guests, client contacts on the event | Event page › Client & guests |
| Event vehicles, trailers, driver, load marks | Event tracker sheet (calendar hover only shows them) |
| Event templates, checklists, planning rules | Events › Event setup |
| Recipes, ingredients, dishes, menus | Kitchen catalog detail pages |
| Ingredient vendor ranking | Ingredient page |
| Kitchen stations | Kitchen › Production plan (Stations section) |
| Stock lines, reorder levels, transfers, storage locations | Inventory › Stock book |
| Stock counts and opening stock | Inventory › Counts |
| Waste entries | Inventory › Waste |
| Vendors, purchase orders, receipts | Inventory › Purchasing / order page |
| Vendor contracts and price tiers | Inventory › Contracts |
| Pack lists and items | Logistics › Pack lists / pack list page |
| Pack templates, style kits, pack rules | Logistics › Pack setup |
| Delivery runs, driver, vehicle on a run | Logistics › Deliveries |
| Vehicles, trailers, maintenance, fuel | Logistics › Fleet |
| Shifts, assignments, swap decisions, crew templates | Staff › Roster |
| Time records, availability, time-off decisions | Staff › Time |
| Qualifications, training modules, shift types | Staff › Skills & training |
| Reviews, role scorecards, one-on-ones | Staff › Performance |
| Candidates and interviews | Staff › Hiring |
| Invoices, invoice lines, reminders | Finance › Invoices / invoice page |
| Payments and stored payment methods | Finance › Payments |
| Payroll inputs and tip pools | Finance › Payroll |
| Closeouts (and the yearly donation summary) | Finance › Closeout |
| Revenue splits and venue commission terms | Finance › Attribution |
| Tax rates | Finance › Tax |
| Clients and contacts | Clients › client page |
| Leads, quote requests, date holds, tastings | Clients › Pipeline |
| Proposals and proposal templates | Clients › Proposals |
| Contracts | Clients › Contracts |
| Client messages | Clients › Inbox (client page shows the thread) |
| Venues, rooms, partnership tier, layout templates | Facilities › venue page / Venues |
| Venue vendor relationships | Facilities › Vendor relationships |
| Equipment and equipment repairs | Facilities › Equipment |
| Area on/off switches | Admin › Permissions |
| Company name, logo, currency, kitchens | Admin › Company |
| Integrations, API keys, assistant settings | Admin › Integrations |
| TPP uploads and import runs | Admin › Imports |

## Before: every screen

Columns: route · purpose · main actions · data · tabs · duplicates · facts
edited · plan. "Keep" means the screen stays where it is. "→ X" means the
screen merges into X, and the old URL redirects there.

### Home, My Day, Event Day

| Route | Purpose | Main actions | Data | Tabs | Duplicates | Edits | Plan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | Month calendar of events | Event tracker, Today's service, All events, Today, Print | Events by day, lock state | - | Same events as `/events`, tracker, `/today` | Vehicle on a delivery (hover) | Keep as Home. Gets the Today band. |
| `/today` | Today's services + "Needs a decision" | All events, Open brief, Open the week | Today's events, prep/pack/invoice lanes | - | Today slice of Home | - | → `/` (Today band above the calendar) |
| `/my` | Staff phone day: shifts, prep, packing, clock | Start, Finish, Declare availability, Packed/Missing | Own shifts, tasks, deliveries | 3 (Today/Week/Month) | Kitchen/Staff lists for one person | Punches, availability, task status | Keep. Gets "My feedback". |
| `/event-day` | Pick the event to run | Open event | Working event, recent events | - | Another events list | - | Keep (phone entry point) |
| `/event-day/:id` | Full-screen day-of map | Open section sheets | 9 readiness nodes | - | Event page tabs (read view) | - | Keep (phone day-of shell) |
| `/event-day/:id/run` | Minute-by-minute run of show | Add standard blocks, Done | Timed blocks | - | Event › Timeline | Block ticks | Keep (live day-of mode) |
| `/event-day/:id/battle-board` | Printable day-of one pager | Print / Save PDF | Run, roster, menu, layout | - | Event page data | - | Keep (print) |

### Events

| Route | Purpose | Main actions | Data | Tabs | Duplicates | Edits | Plan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/events` | Events book | Search, sort, stage filter, open | Events by date | 3 (Upcoming / Needs attention / All) | Calendar, tracker | - | Keep |
| `/workbooks` | Legacy event files, blocking fixes | Import event files | Per-event workbook state | - | Review lives in Event › Overview | - | Keep |
| `/events/tracker` | Month sheet, two-week board, planning board | Edit vehicle/trailer/driver cells | Month events, vehicles | 3 | Calendar hover vehicles | Vehicles, trailers, driver, load marks | Keep |
| `/events/new` | Create an event | Create event, inline client/venue | Event form | 2 (Form / Guided) | - | Event basics on create | Keep |
| `/events/import` | Paste BEO / drop TPP CSVs | Create | Parsed preview | - | - | Event + shifts + pack list | Keep |
| `/events/templates` | Event templates | New template, apply, archive | Templates | - | Template picker in create | Event templates | → Event setup |
| `/events/checklists` | Checklist definitions | New checklist | Checklists | - | To-dos consume them | Checklists | → Event setup |
| `/events/planning/setup` | Planning rules, stage moves | Add rule | Rules | - | Settings of the planning board | Planning rules | → Event setup (host) |
| `/events/capacity` | Room capacity heat map | Date range | Occupancy by day | - | Another date view | - | Keep |
| `/events/:id` | The event page | Stage action, More, BEO PDF | Everything for one event | 16 | Kitchen/Staff/Inventory for one event | Most event facts | Keep. 16 tabs → 11. |
| `/events/:id/allergen-briefing` | Printable allergen briefing | Print | Dishes × allergens | - | Menu + guests data | - | Keep (print) |
| `/events/:id/map` | Printable route map | Copy link, print | Directions | - | - | - | Keep (print) |

Event page tabs before (16): Overview, Team Chat, Menu, Prep, Equipment, Client
Information, Guests, Event Photo Gallery, Timeline, To-dos, Layouts, Staffing,
Inventory, Incidents, History, Margin.
Plan: History → bottom of Overview. Guests → into Client & guests. Photos +
Incidents → "Photos & incidents". Layouts → into Equipment ("Equipment &
layouts"). To-dos → into Timeline ("Timeline & to-dos"). Result: 11 tabs.

### Kitchen and production

| Route | Purpose | Main actions | Data | Tabs | Duplicates | Edits | Plan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/kitchen/components` | Recipe list | Import recipe, create, retire | Recipes | - | Same page as the other 3 lists | New recipe | Keep |
| `/kitchen/components/import` | Import a recipe from text/files | Paste, Files, create | Source + review | 4 | Create form | Imported recipe | Keep |
| `/kitchen/components/:id` | Recipe page | Revise recipe, scale | Composition, method, cost | - | - | Recipe fields | Keep |
| `/kitchen/ingredients` | Ingredient list | Create, search | Ingredients | - | - | New ingredient | Keep |
| `/kitchen/ingredients/:id` | Ingredient page | Add vendor, merge, image | Allergens, cost, vendors | - | Vendor ranking | Ingredient fields | Keep |
| `/kitchen/dishes` | Dish list | Create | Dishes | - | - | New dish | Keep |
| `/kitchen/dishes/:id` | Dish page | New edition, merge | Recipe, containers, editions | data tabs | - | Dish fields | Keep |
| `/kitchen/menus` | Menu list | Create | Menus | - | - | New menu | Keep |
| `/kitchen/menus/:id` | Menu page | Download PDF, publish | Dishes, pricing | - | - | Menu fields | Keep |
| `/kitchen/allergen-matrix` | Allergen matrix (menu or event) | Export PDF | Dish × allergen grid | - | Allergen briefing | - | Keep (deep link) |
| `/kitchen/prep` | Prep board | Claim, Start, Complete, Assign | Prep tasks | 2 (By service / By cook) | Plan, display, unresolved | Prep task status | Keep. Gets "Unresolved". |
| `/kitchen/unresolved` | Events/recipes with unresolved work | Open | Two lists | - | Prep blockers | - | → Prep board section |
| `/kitchen/cleanup` | Reclassify mis-typed records | Approve, Keep as is | Groups by kind | - | Catalog tools | Record kind | → Ingredients list section |
| `/kitchen/stations` | Station names for prep sheets | Add, rename, reorder | Stations | - | Station field on plan | Stations | → Production plan section |
| `/kitchen/plan` | Daily production plan | Batch | Steps by day/station | - | Prep board | Batches | Keep. Gets Stations + Yield. |
| `/kitchen/yield` | Planned vs actual yield | Window | Recipes below plan | 3 | - | - | → Production plan section |
| `/kitchen/display` | Kitchen kiosk board | Claim, Start, Done | Live tasks | - | Prep board | Task status | Keep (kiosk) |

### Inventory

| Route | Purpose | Main actions | Data | Tabs | Duplicates | Edits | Plan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/inventory` | Overview: low stock, open orders | Review purchasing, Start a count | 4 counts | - | Stock book "Below reorder" | - | → Stock book (summary on top) |
| `/inventory/demand` | Ingredient need per event | Add a line, Purchase | Need by event | - | Feeds purchasing | Manual demand lines | → Purchasing section |
| `/inventory/stock` | Stock book | Receive, Recount, Transfer, New location | Holdings, reservations | - | Counts, locations, audit | Stock lines, levels | Keep (host) |
| `/inventory/counts` | Count sessions | Start count, close | Count sessions | - | Recount | Counts | Keep. Gets Opening stock. |
| `/inventory/opening-stock` | Import opening sheet | Fix, Use all | Sheet rows | 3 | Counts | Opening stock | → Counts section |
| `/inventory/audit` | Stock history per item | Pick item | Every change | - | Transfer history | - | → Stock book section |
| `/inventory/waste` | Waste report + entry | Record waste | Waste by reason | 4 | - | Waste entries | Keep |
| `/inventory/locations` | Storage location register | Register, edit | Locations | - | Stock book "New location" | Locations | → Stock book section |
| `/inventory/traceability` | Lot recall trace | Print report | Affected events | - | - | - | Keep |
| `/inventory/purchasing` | Weekly drafts + orders | Add vendor, extra order | Drafts, orders | - | Demand | Vendors, orders | Keep (host) |
| `/inventory/orders/:id` | Vendor order | Receive, edit | Lines, receipts | - | - | Order lines, receipts | Keep |
| `/inventory/contracts` | Vendor contracts | Draft, activate | Contracts, tiers | - | - | Contracts | Keep |

### Logistics

| Route | Purpose | Main actions | Data | Tabs | Duplicates | Edits | Plan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/logistics` | Overview + attention list | Open deliveries | 4 counts | - | Dispatch board | - | → Dispatch board (summary on top) |
| `/logistics/packs` | All pack lists | Open, Load sheet | Pack lists | - | Packing floor | New pack list | Keep. Gets floor view. |
| `/logistics/packs/:id` | Pack list page | Generate, add, scan | Items, bins | - | - | Pack items | Keep |
| `/logistics/pack-templates` | Pack templates | Create, edit | Templates | - | Kits, rules | Templates | Keep as **Pack setup** host |
| `/logistics/style-kits` | Kit lines per service style | Add line | Kit lines | - | Templates | Kit lines | → Pack setup |
| `/logistics/pack-rules` | Rules that add items | Add rule | Rules | - | Templates | Rules | → Pack setup |
| `/logistics/deliveries` | Delivery runs | Schedule delivery, assign | Runs | - | Schedule, route | Runs | Keep. Gets vehicles-by-day. |
| `/logistics/dispatch` | What goes out, open items | Trip checks | Events by day | 4 | Deliveries | Trip checks | Keep |
| `/logistics/returns` | Returned equipment count | Return equipment | Returns | 3 | - | Return counts | Keep |
| `/logistics/floor` | Lists to pack/load now | Pack this list | Lists being packed | - | Pack lists | Pack status | → Pack lists section |
| `/logistics/schedule` | Vehicles by day | Assign vehicle | Vehicles, unassigned runs | - | Deliveries | Run vehicle | → Deliveries section |
| `/logistics/route` | Stop order for a day/vehicle | Reorder, print | Stops | - | Deliveries | Stop order | Keep |
| `/logistics/fleet` | Vehicles and trailers | Register | Catalogs | 2 | Maintenance | Vehicles, trailers | Keep as host. Tabs → stacked. |
| `/logistics/maintenance` | Service, fuel | Schedule, log | Schedules, log | - | Fleet | Maintenance | → Fleet section |

### Staff

| Route | Purpose | Main actions | Data | Tabs | Duplicates | Edits | Plan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/staff` | Needs-attention landing | Open the roster | Counts, open requests | - | Swaps, time off | - | → Roster (attention strip on top) |
| `/staff/roster` | Assignments + weekly shifts | New assignment, New shift | Assignments, shifts | - | Event › Staffing | Shifts, assignments | Keep (host) |
| `/staff/swaps` | Swap approval queue | Approve, Reject | Swap requests | - | Same queue pattern as time off | Swap decisions | → Roster section |
| `/staff/crew-templates` | Crew needed per style/size | New, edit, retire | Templates | - | Seeds roster | Crew templates | → Roster section |
| `/staff/time` | Clock, time entries, availability | Clock in/out | Time, availability | - | Payroll reads it | Time records | Keep (host) |
| `/staff/time-off` | Time-off review | Approve, Deny | Requests | - | Availability | Time-off decisions | → Time section |
| `/staff/utilization` | Scheduled vs confirmed hours | Range | Hours per person | - | Roster + time | - | → Time section |
| `/staff/messages` | Team chat | Send | Channels, DMs | - | Event › Team Chat | Messages | Keep |
| `/staff/qualifications` | Qualification ledger | Grant, Revoke | Qualifications | - | Training | Qualifications | → Skills & training |
| `/staff/training` | Modules, shift types, completions | Define, record | Modules | - | Qualifications | Modules, completions | Keep as **Skills & training** host |
| `/staff/reviews` | Performance reviews | Record a review | Reviews | - | My reviews, one-on-ones | Reviews | Keep as **Performance** host |
| `/staff/my-reviews` | Own feedback | Open event | Own reviews | - | Reviews | - | → My Day ("My feedback") |
| `/staff/scorecards` | Role expectations | New, edit, archive | Scorecards | - | One-on-ones use them | Scorecards | → Performance section |
| `/staff/one-on-ones` | One-on-ones + actions | Hold, add action | Meetings | - | Reviews | One-on-ones | → Performance section |
| `/staff/hiring` | Candidates | New candidate, interview | Candidates | - | - | Candidates | Keep |

### Finance

| Route | Purpose | Main actions | Data | Tabs | Duplicates | Edits | Plan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/finance` | Owed / collected overview | Issue invoice | Open invoices | - | Invoices list | - | → Invoices (summary on top) |
| `/finance/invoices` | Invoice list | Issue, send, void | Invoices | - | - | Invoices | Keep (host) |
| `/finance/invoices/:id` | Invoice page | Record payment, PDF | Lines, payments | - | Payments list | Invoice lines | Keep |
| `/finance/revenue` | Revenue trends | - | Pace vs last year | - | Mangia Revenue | - | Keep as **Money reports** host |
| `/finance/food-cost` | Food cost % | Venue filter | Cost by period | - | KPI pages | - | → Money reports section |
| `/finance/profit-margins` | Margins | Switch view | Margins | 3 | KPI pages | - | → Money reports section |
| `/finance/money-check` | TPP payments vs Capsule | Save report | Mismatched rows | - | Parallel run | Saved snapshot | → Compare with TPP |
| `/finance/taxes` | Tax rates | Add, edit | Rates | - | - | Tax rates | Keep |
| `/finance/commission-terms` | Venue commission terms | Add, edit | Terms | - | Feeds attribution | Terms | → Attribution section |
| `/finance/attribution` | Revenue splits | Add, approve | Splits | - | Comp Master | Splits | Keep (host) |
| `/finance/attribution/new` | New split | Save | Form | - | Same page as `:id` | Split | → one `:id` route (`new`) |
| `/finance/attribution/:id/:mode?` | Split detail | Save | Form | - | - | Split | Keep |
| `/finance/payments` | Payments | New payment | Payments | - | Invoice page | Payments | Keep (host) |
| `/finance/payment-methods` | Stored payment methods | New, remove | Methods | - | - | Methods | → Payments section |
| `/finance/closeout` | Closeouts | Capture, finalize | Folios | - | - | Closeouts | Keep (host) |
| `/finance/donations` | Yearly donation summary | Year, print | Donations | - | From closeouts | - | → Closeout section |
| `/finance/payroll` | Payroll inputs | Prepare, finalize | Inputs | - | Tips | Payroll | Keep (host) |
| `/finance/tips` | Tip pool split | Distribute | Gratuity | - | Payroll rows | Tip rows | → Payroll section |

### Reports

| Route | Purpose | Main actions | Data | Tabs | Duplicates | Edits | Plan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/reports` | Report catalog + saved reports | Create, rename, archive | Catalog, saved | 2 | - | Saved reports | Keep. Tabs → stacked. |
| `/reports/sales` | Pipeline, conversion | - | Pipeline, revenue | - | Mangia | - | Keep |
| `/reports/tims-kpis` | KPIs vs budget | - | KPIs | - | Scorecard | - | Keep |
| `/reports/scorecard` | Company scorecard | - | Actual vs target | - | L10 embeds it | - | → L10 |
| `/reports/l10` | Weekly leadership board | - | Scorecard, rocks, issues | - | - | Leadership items | Keep (host) |
| `/reports/avg-event-value` | Avg event value | - | Growth | - | Mangia tab | - | → Mangia "Avg event value" tab |
| `/reports/comp-master` | Commission per salesperson | All time | Commission | - | Attribution | - | → Attribution section |
| `/reports/mangia` | Company dashboard | Switch tab | 7 views | 7 | Sales, revenue | - | Keep |

### Clients and sales

| Route | Purpose | Main actions | Data | Tabs | Duplicates | Edits | Plan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/clients` | Client list | Add client | Clients | - | - | New client | Keep. Gets Retention. |
| `/clients/pipeline` | Lead board | Add to pipeline, Create proposal | Leads by stage | - | Quote requests, holds | Leads | Keep (Sales hub) |
| `/clients/quote-requests` | Website quote requests | Convert, dismiss | Requests | - | Pipeline "New" | Request state | → Pipeline section |
| `/clients/date-holds` | Soft date holds | Hold, release, book | Holds | - | Pipeline dates | Holds | → Pipeline section |
| `/clients/tastings` | Tastings | Book, mark tasted | Tastings | - | Pipeline / proposals | Tastings | → Pipeline section |
| `/clients/proposals` | Proposals | New, send, PDF | Proposals | - | - | Proposals | Keep (host) |
| `/clients/proposals/templates` | Proposal templates | New, revise | Templates | - | Proposals | Templates | → Proposals section |
| `/clients/contracts` | Contracts | Draft, issue invoice | Contracts | - | Client page counts | Contracts | Keep |
| `/clients/contracts/:id/document` | Printable contract | Export PDF | Contract text | - | - | - | Keep (print) |
| `/clients/retention` | Repeat rate + outreach | Call again, complete | Lapsed clients | - | Client list | Outreach tasks | → Clients section |
| `/clients/inbox` | Client messages | Log, send, make a lead | Threads | - | Client page thread | Messages | Keep |
| `/clients/:id` | Client page | Add contact, issue invoice | Profile, contacts, comms | - | - | Client fields | Keep |

### Facilities

| Route | Purpose | Main actions | Data | Tabs | Duplicates | Edits | Plan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/facilities` | KPI summary | Open maintenance log | 4 counts | - | Equipment maintenance | - | → Venues (summary on top) |
| `/facilities/equipment` | Equipment + maintenance | Register, import | Catalog, repairs | - | Overview | Equipment | Keep |
| `/facilities/venues` | Venue list | Add venue | Venues | - | - | New venue | Keep. Gets Partners filter. |
| `/facilities/venues/partners` | Partner check-ins | Open venue | Partners | - | Venue page tier | - | → Venues "Partners" filter |
| `/facilities/venues/templates` | Layout templates (all venues) | New template | Templates | - | Per-venue route | Layout templates | Keep |
| `/facilities/venues/:venueId/templates` | Same, one venue | Same | Same | - | Exact duplicate | Same | → `/facilities/venues/templates?venue=` |
| `/facilities/venues/:id` | Venue page | Edit details | Venue panels | - | - | Venue fields | Keep |
| `/facilities/venues/:id/menu-card` | Printable menu card | Save as PDF | Dishes | - | - | Card menu choice | Keep (print) |
| `/facilities/venues/:id/info-packet` | Printable info packet | Save as PDF | Venue facts | - | - | - | Keep (print) |
| `/facilities/vendor-relationships` | Venue vendors (all) | Establish, retire | Relationships | - | Per-venue route | Relationships | Keep |
| `/facilities/venues/:venueId/vendor-relationships` | Same, one venue | Same | Same | - | Exact duplicate | Same | → `/facilities/vendor-relationships?venue=` |

### Admin and settings

| Route | Purpose | Main actions | Data | Tabs | Duplicates | Edits | Plan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/admin` | Area on/off switches | Toggle | Capabilities | - | - | Capabilities | Keep |
| `/admin/branding` | Name, logo, colors, currency | Save | Brand preview | - | - | Branding | Keep as **Company** host |
| `/admin/kitchens` | Kitchens, drive-time rules | Add kitchen | Kitchens | - | - | Kitchens | → Company section |
| `/admin/catalogs` | Dropdown lists | Register, revise | 3 lists | - | - | Catalog values | Keep |
| `/admin/announcements` | Banners | Post, remove | Announcements | - | - | Announcements | Keep |
| `/admin/data-export` | Personal data export/erase | Download | People | - | - | Erasure | Keep |
| `/admin/integrations` | QuickBooks, SMS | Connect | Status | - | - | Connections | Keep (host) |
| `/admin/assistant` | Assistant endpoint | Save | Settings | - | - | Assistant config | → Integrations section |
| `/admin/api-keys` | API keys | Create, revoke | Keys | - | - | Keys | → Integrations section |
| `/admin/imports` | Import runs | Start new import | Runs | - | TPP upload | Runs | Keep (host) |
| `/admin/imports/tpp` | TPP upload | Upload, resume | Batches | - | Imports start | Batches | → Imports section |
| `/admin/imports/:id` | One import run | Review, commit, revert | Stages | - | - | Run state | Keep |
| `/admin/parallel-run` | Compare events with TPP | Review | Comparisons | - | Money check | - | Keep as **Compare with TPP** host |
| `/admin/reconcile` | Match leftovers | Verify, skip | Records | - | - | Links | Keep |
| `/admin/cutover` | Switch from TPP | Approve | Checklist | - | - | Cutover | Keep |
| `/settings/email` | Own email summaries | Toggle | Categories | - | - | Subscriptions | Keep |

## Planned reduction

| Change | Routes | Tabs |
| --- | ---: | ---: |
| Home: `/today` into `/` | -1 | |
| Events: Event setup (3 → 1) | -2 | |
| Event page: 16 → 11 tabs | | -5 |
| Kitchen: unresolved, cleanup, stations, yield folded | -4 | 0 (yield window moves along) |
| Inventory: overview, demand, opening stock, audit, locations folded | -5 | |
| Logistics: overview, floor, style kits, pack rules, schedule, maintenance folded | -6 | |
| Logistics fleet: Vehicles/Trailers tabs → stacked sections | | -2 |
| Staff: overview, swaps, crew templates, time off, utilization, qualifications, my reviews, scorecards, one-on-ones folded | -9 | |
| Finance: overview, food cost, profit margins, money check, commission terms, payment methods, donations, tips, attribution `new` folded | -9 | |
| Reports: scorecard, avg event value, comp master folded; home tabs stacked | -3 | -2 |
| Clients: quote requests, date holds, tastings, proposal templates, retention folded | -5 | |
| Facilities: overview, partners, 2 per-venue duplicates folded | -4 | |
| Admin: kitchens, assistant, API keys, TPP upload folded | -4 | |
| **Total** | **-52** | **-9** |

Planned after: 90 routes + 55 tabs = **145** (-61, 29.6%). The plan adds more
folds while it runs, to reach at least -62. This table and the results below are
updated after each batch.

## After

Filled in as batches ship.

## Redirect inventory

Every removed URL keeps working. It goes to its new home, with the same IDs and
query values.

| Old URL | New URL |
| --- | --- |
