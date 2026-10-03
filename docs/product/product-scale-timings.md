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

## Still open for AC-172

- The dish list's first read after a change (2.5 s at 5,000 dishes).
- Other whole-company lists the event tabs still read (recipe lines,
  ingredients, prep tasks, guests).
- Screen response under 200 ms at this size (browser leg).
