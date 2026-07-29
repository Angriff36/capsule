# Manual UI click-test campaign — 2026-07-28

Owner directive: every place an action can take place must be manually tested **through the UI** on production, with real (TEST-0728-prefixed) records. Fixes ship continuously (standing approval). This log tracks per-tab results; update it as testing proceeds.

## Bugs found by clicking (and fixed + shipped)

1. **RoleScorecard create** — entity-command hook instead of creation hook → "Action failed unexpectedly". Fixed `f828432`, verified live.
2. **Same class, found statically after the first hit**: ProposalTemplate define, VenueCommissionTerm define, ComponentSnapshot capture (silently never saved). Fixed `f828432`.
3. **PerformanceReview without event impossible end-to-end** — `eventId: uuid?` projects Zod-nullable but Convex-required (generator bug, issue #126). Manifest param switched to `optional`, regen, fixed `5acde48`, verified live.
4. **Generic Zod-failure banner** talked about "client, venue, headcount, pricing" on every form — neutral copy now. `f828432`.
5. Stale governed-creation test snapshot (122nd entity) updated in `5acde48`.

## Staff section — tested tabs (all on prod, signed in as Ryan Ostwind/admin)

| Tab | Actions tested | Result |
|---|---|---|
| Scorecards | create (with expectation rows) | FAIL → fixed → **PASS** (verified post-deploy) |
| Reviews | record review, no event | FAIL ×2 → fixed → **PASS** (ledger row, avg computed) |
| My reviews | shows my review | **PASS** |
| One-on-ones | hold meeting, add follow-up action | **PASS** |
| Hiring | add candidate, move stage, schedule interview, record outcome | **PASS** (leak: raw `KITCHEN_STAFF · NATIVE` on card — polish list) |
| Qualifications | grant (required-field validation also verified) | **PASS** (leak: raw `food_handler` under name — polish list) |
| Training | define module, record completion, define gated shift type | **PASS** 3/3 |
| Time off | request (from My Day) → approve (manager desk) → history | **PASS** full loop |
| Messages | open thread, send DM | **PASS** |
| My Day | clock in/out, claim, start, done prep task, time-off request, weekly availability | **PASS** 6/6; availability flows into roster grid |
| Roster | confirm assignment, add assignment, add shift (training-gated type allowed for qualified person), publish schedule | **PASS** 4/4 |
| Time & availability | time record from My Day clock shows; Correct action | **FAIL → fixed locally** — Correct used window.prompt ("prompt() is not supported" in embedded browsers); converted to action-prompt datetime fields. Sparked app-wide prompt purge (agent). |
| Shift swaps | request-swap form on My Day | **PASS (eligibility gate)** — correctly reports no eligible coworker (gated shift type + no second linked sign-in). Full send→accept→approve loop needs a second linked staff account — untestable single-account. |
| Roster publish → My Day | published shift appears, Acknowledge schedule stamps time | **PASS** |
| Utilization | renders with real data (my clock session counted) | **PASS** |

**Staff section: COMPLETE — 13/13 tabs.** 6 bugs found by clicking (4 broken creates, review nullable chain incl. generator issue #126, window.prompt breakage), all fixed; 2 raw-enum polish leaks logged (hiring card, qualification type).

## Kitchen section — tested

| Tab | Actions | Result |
|---|---|---|
| Ingredients | create (13th record) | **PASS** |
| Components | create → detail → publish | **PASS** (copy leak: empty state says "through the generated Manifest command" — fix) |
| Dishes | create → attach ingredient line (demand copy confirms) | **PASS** |
| Menus | create (draft) | **PASS** |
| Allergen matrix | select menu → disclosure builds (4 dishes) | **PASS** (Export PDF untested) |
| Prep board / My Day prep | claim/start/done tested via My Day | **PASS** |
| KDS, event-menu, import, detail panels (components/prep/containers) | — | TODO |

## Events section — tested

| Item | Result |
|---|---|
| Create via sectioned form (Basics only + side-panel client/venue) | **PASS** — full detail page opens. Occasion dropdown EMPTY (known unseeded catalog #113, other agent). |
| Restored Guests tab | **PASS** — invite guest, RSVP actions render, Confirm works (leak: raw `tree_nuts` on guest card) |
| Restored Incidents tab | **PASS** — report incident (Service/OPEN/MEDIUM + lifecycle buttons) |
| Lifecycle | **PASS** — submit for approval → approve (PLANNING → PENDING APPROVAL → APPROVED) |
| Menu tab, Timeline, Layouts, Staffing tab (new picker), Photos, BEO download, portal copy, templates, capacity | TODO |

## Clients section — tested this round

| Item | Result |
|---|---|
| Add client | **PASS** (row appears with contact) |
| Lead capture | **PASS** (required `source` field has no placeholder — minor; card lands on board) |
| Pipeline move/convert, proposal draft/send, template create (retest post-fix), contracts draft (retest option labels), retention, quote convert, inbox paste form | TODO |

## Round-3 fixes shipped (`400d453`)
- window.prompt/confirm/alert purged app-wide (18 files) after "prompt() is not supported" broke Time sheet Correct live; all flows now use the action-prompt panel.
- Re-tests needed post-deploy: Time Correct, StockBook receive/recount, Equipment condition/retire, Venue deactivate, MenuDetail duplicate, template archive, saved views.

## Remaining sections (every actionable control per tab)

- [ ] Events: list filters/saved views, create (done earlier via form test? re-verify submit), detail tabs incl. restored Guests/Inventory/Incidents, lifecycle actions, templates, capacity, briefing
- [ ] Kitchen: catalog creates (component/dish/menu/ingredient), detail panels (ingredients/components/prep/containers), import, allergen matrix print, event menu, prep board actions, KDS bump, yield
- [ ] Inventory: demand→purchasing flow, stock adjust/receive, counts session, waste log, lot trace, vendor orders receive, contracts create
- [ ] Logistics: pack list check-off→packed, template create/generate, delivery schedule/driver/transit, route planner, fleet, maintenance log
- [ ] Clients & CRM: add client, duplicates review expand, lead capture/move/convert, proposal draft/send/enhancements/PDF, template create (fixed — retest), contract draft, retention outreach, quote convert, inbox paste + reply
- [ ] Finance: invoice issue/send/record payment, credit memo, payment methods, closeout capture, payroll prepare/export, tips, tax rates create (field styling fixed — retest), commission terms create (fixed — retest), attribution create/apply (fixed — retest), reports
- [ ] Facilities: venue add (retest with tokens), detail edit, rooms/notes, layout template create, vendor relationship create + status change (docId fix — retest), equipment register/condition/maintenance
- [ ] Admin: team roles hire/link, permissions toggles, branding save, announcements post, imports (only with caution — real migration data), integrations (read-only unless safe), personal-data export
- [ ] Reports: each dashboard renders + saved report create/share scope
- [ ] Home: customize widgets, pin/unpin
- [ ] Cleanup: decide whether to keep or delete TEST-0728 records (ask owner)
