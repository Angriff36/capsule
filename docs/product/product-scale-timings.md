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

## Still open for AC-172

- p95 against a running backend with 100+ samples. This needs a backend that
  is not the shared dev database, because the seed adds about 35,000 rows.
- Screen response under 200 ms at this size (browser leg).
