# Product scale timings (PL-SCALE, AC-172)

Proof file: `tests/proofs/product-scale-timings.runtime.test.ts`. It builds one
company with 10,000 events, 5,000 dishes, 200 clients and 20,000 menu lines,
then times each read a busy screen makes. Each list/detail read gets one cold
call, then 120 timed calls. The run also writes
`.artifacts/product-scale-timings.json`.

## What this measures, and what it does not

- It measures the server functions in process (convex-test). There is no
  network and no browser.
- It does NOT measure a running backend round trip or screen response time.
  Those AC-172 legs stay open.
- convex-test walks every document in the database for each index read. A
  real backend uses the index. Reads that make many index reads therefore look
  much slower here than they are. The calendar is the clear case.

## Recorded run, 2026-10-02

Hardware: Intel Core i7-14700K, 28 cores, 32 GB, Windows 10.0.26200,
node 22.22.2. Network: none (in process).

| Read                                           | Samples | Cold ms | p50 ms | p95 ms |
| ---------------------------------------------- | ------- | ------- | ------ | ------ |
| Events page window, 200 rows                   | 120     | 203     | 232    | 253    |
| Event detail, with menu                        | 120     | 957     | 111    | 124    |
| Today page                                     | 120     | 225     | 203    | 213    |
| Event picker window                            | 120     | 207     | 189    | 202    |
| Dish list, all 5,000                           | 120     | 164     | 164    | 176    |
| Dish detail                                    | 120     | 29      | 27     | 29     |
| Calendar home, six weeks (harness-bound)       | 10      | 10,510  | 10,515 | 10,815 |
| All-time event export walk, 500 a page         | 10      | 1,120   | 1,075  | 1,101  |

Separate legs:

- Seed write (10,000 events, 5,000 dishes, 20,000 menu lines): 660 ms.
- Bulk write of 1,000 more events with menu lines: 75 ms.
- Cold start: the first event detail call took 957 ms; later calls about
  110 ms.

## Result

- Every list/detail read except the calendar has p95 under the one-second
  target in process.
- The calendar makes about 1,500 small index reads (three per event on the
  grid, about 500 events). Its 10-second figure comes from convex-test's
  whole-database walk per index read. Its real p95 must come from the running
  backend.

## Running backend, 2026-10-03

Script: `bun run --cwd <checkout> scripts/scale-backend-timings.ts`. It
starts a throwaway local Convex backend inside the checkout (ports 3310/3311,
state in `.convex/local`, never the shared dev database), pushes the
functions, imports the same company (10,000 events, 5,000 dishes, 200
clients, 20,000 menu lines) and times each read over HTTP. Each read gets one
cold call, then 120 calls whose arguments change every call so the backend's
query cache cannot answer. Results go to `.artifacts/product-scale-backend.json`.

Hardware: same machine as above; bun 1.3.4. Network: HTTP to the backend on
the same machine. Import of the whole company: 22 s.

First run found two reads over one second:

| Read                                   | p95 before | Fix                                                     | p95 after |
| -------------------------------------- | ---------- | ------------------------------------------------------- | --------- |
| Events page window, 200 rows           | 1,246 ms   | tab counts read at most 200 per lane (was 500): "200+"  | 703 ms    |
| Event picker (18 screens)              | 2,957 ms   | new `eventLookup.picker`: next 400, last 90 days, undated | 419 ms    |

All reads after the fixes (120 samples each):

| Read                                   | Cold ms | p50 ms | p95 ms |
| -------------------------------------- | ------- | ------ | ------ |
| Events page window, 200 rows           | 689     | 686    | 703    |
| Event detail, with menu                | 27      | 21     | 25     |
| Calendar home, six weeks               | 411     | 409    | 432    |
| Today page                             | 116     | 101    | 108    |
| Event picker                           | 400     | 400    | 419    |
| Dispatch week (seven days)             | 16      | 12     | 15     |
| Dish detail                            | 16      | 16     | 19     |
| Dish list, all 5,000 (same call)       | 2,469   | 18     | 37     |

Separate legs:

- Dish list: the warm figures are the backend's query cache. The first read
  after any dish change reads all 5,000 dishes again: about 2.5 s at this
  size.
- All-time event export walk (20 pages of 500): first walk 3.1 s; repeat
  walks are cached (83 ms).
- This backend reads roughly 0.3 to 0.9 ms per record, so a read's time
  follows how many records it touches.

Menu lines: the generated every-event menu list (every line of every event,
each with its dish and whole recipe) ran 15.8 s and then failed with a server
error at 20,000 lines. The event page and nine other screens read it. They now
read one event's lines (p95 22 ms) or the lines of the events / dish they show
(`convex/eventMenuLookup.ts`).

Dishes and recipe rows (run of 2026-10-03, same company plus 2,000
ingredients and 25,000 dish ingredient lines, 5 per dish):

| Read                                                  | Cold ms | p50 ms | p95 ms |
| ----------------------------------------------------- | ------- | ------ | ------ |
| Dishes on one menu, 12 (`dishLookup.byIds`)           | 12      | 10     | 12     |
| Menu tab recipe, price, stock rows, 12 dishes         | 117     | 105    | 113    |

The event Menu tab read every dish ingredient line of the company (and nine
more whole lists). That read ran 16.0 s and then failed with a server error
at 25,000 lines. The tab now reads only its dishes' rows
(`convex/menuRecipeLookup.ts`). The event page, kitchen board, prep board,
My day, allergen matrix, pack list and recipe page read their dishes by id.

Month tracker sheet (run of 2026-10-03, same company): the sheet now reads
only the shown month's pack lists, questions, trucks and numbers
(`convex/eventMonthRows.ts`).

| Read                                                  | Cold ms | p50 ms | p95 ms |
| ----------------------------------------------------- | ------- | ------ | ------ |
| Month tracker rows, 267 events (`eventMonthRows.forEvents`) | 354 | 347 | 360 |

## Browser leg (local interaction)

`scripts/scale-browser-timings.mjs` (run of 2026-10-03): the same throwaway
backend, the same 10,000-event / 5,000-dish company filled under the testing
sign-in's own company, signed in as its owner in headless Chromium at
1280x800 against the Vite dev server (development React build). The figure
is the browser's own event timing: from the click or key press to the next
paint; 16 means under the browser's 16 ms floor.

| Interaction                     | Samples | p50 ms | p95 ms |
| ------------------------------- | ------- | ------ | ------ |
| Events page tab click           | 45      | 16     | 24     |
| Events search key press         | 40      | 16     | 72     |
| Event page section tab click    | 60      | 32     | 48     |

Every interaction p95 is under 200 ms.

Rerun 2026-10-04 with at least 100 samples per interaction and the dish
catalog added (5,000 dishes, read in pages, searched in the page):

| Interaction                     | Samples | p50 ms | p95 ms |
| ------------------------------- | ------- | ------ | ------ |
| Events page tab click           | 120     | 16     | 16     |
| Events search key press         | 108     | 16     | 80     |
| Event page section tab click    | 120     | 32     | 48     |
| Dish catalog search key press   | 104     | 16     | 16     |

| Screen opens (full page load, dev server, sign-in check) | Samples | p50 ms | p95 ms |
| -------------------------------------------------------- | ------- | ------ | ------ |
| Events page to its list                                   | 5       | 2,152  | 3,003  |
| Event page to its sections                                | 20      | 2,012  | 3,233  |
| Dish catalog to all 5,000 dishes                          | 3       | 2,091  | 2,907  |

Screen opens are a full page load of the development build (a cold start
each time); they are reported apart from the list/detail reads above.

The first run found every screen took 15 to 18 s to open: the notification
bell (on every screen) read every event, 13.1 s, and the socket answers a
screen's reads together, so every other read waited for it. The bell now
reads only events waiting for approval and those whose stage changed in its
seven-day window (five new event indexes): 282 ms. Screen opens after the
fix (full page load in the dev server, sign-in check included):

| Screen opens                    | Samples | p50 ms | p95 ms |
| ------------------------------- | ------- | ------ | ------ |
| Events page to its list         | 5       | 1,873  | 2,861  |
| Event page to its sections      | 10      | 2,006  | 2,555  |

Dish list in pages (run of 2026-10-04, same company): the kitchen catalog,
dish page, menu page, pack rules, proposals, imports and the "add a dish"
pickers now read the dish list 500 at a time (`dishLookup.page`), every
page loaded. Each page is its own read, so a dish change re-reads one page.

| Read                                                       | Samples | Cold ms | p50 ms | p95 ms |
| ---------------------------------------------------------- | ------- | ------- | ------ | ------ |
| One page, 380-500 dishes (what a dish change re-reads)     | 120     | 104     | 103    | 111    |
| All pages in turn, 5,000 dishes (a screen's first open)    | 10      | 614     | 604    | 614    |

The one-call list took 2.5 s uncached; the same 5,000 dishes in ten pages
take 0.6 s in all. Browser check `dish-pages.mjs` PASS at 360 and 1280
(catalog shows all 2,329 local dishes, dish page, pack rules, proposals).

## AC-172 result (2026-10-04)

Every list/detail read p95 is under one second, every interaction p95 is
under 200 ms over at least 100 samples, and cold start, export and import
are reported apart. Notes kept for later work:

- Event tabs now read one event's guests, prep tasks, review flags,
  timeline blocks / comments, crew (assignments, needs, shifts), ingredient
  needs, equipment holds, rental lines, pack lists and proposals. Still
  whole on purpose: catalogs, stock holds, vendor orders, and the lists a
  screen compares across events (shift overlaps, a person's week, role
  suggestions). The two-year tracker board still reads whole lists.
- Nothing else measured over target. Screen opens are a full page load in the
  dev server; the production build is not timed here.
