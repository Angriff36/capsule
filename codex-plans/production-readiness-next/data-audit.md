# PR01-PR04 production-readiness gap audit

Baseline: `cf232680731131b5500ca296ae214e36d52bd521` on `docs/production-gap-plan-20260906`. This is a read-only source audit and next-work handoff. It does not authorize an import, deployment, production access, or a business-policy decision.

## Method and result

The requirements are the current PR01-PR04 specs, not their historical baseline prose. The released R2 archive work and full-wiring repairs are present and must be preserved. Status meanings:

- **missing**: the required behavior has no usable current path.
- **partial**: useful current behavior exists, but at least one material part of the criterion is absent or contradicted.
- **implemented-unverified**: the path appears complete in current source, but this audit found no proportionate behavior proof.
- **configuration-blocked**: code is ready, but a named account, source, or owner choice prevents qualification.
- **verified(scope)**: the stated behavior was exercised in the named local scope; it is not a production claim.

Focused verification run in this checkout: 16 files / 82 tests passed, covering the PR01 archive proofs plus current recipe import, recipe-to-demand, weekly purchasing, stock-unit lock, inventory command lifecycle, and receiving/PO totals. No authenticated production proof was attempted.

## Executive gap map

| Area | Current strength | Highest-risk remaining behavior |
| --- | --- | --- |
| PR01 archive | R2 inventory, reconciliation, provenance, replay/delta, resume and completion gates have strong local proofs. | No operator archive-upload/classification path was found; no cancel/compensation workflow or visible preflight progress exists. Current detail commit still asks for JSON. |
| PR02 identity | Tenant-scoped source-ID links, a reconcile queue, and atomic client merge foundations exist. | Coverage and correction UX are narrow; contacts without last names are rejected; history, staff, catalog revisions and reusable mapping rules are not complete. |
| PR03 recipe | A normal component-import screen, parser, editable ingredient matching, atomic materialization, cost-coverage UI, snapshots and demand scaling exist. | The parser invents missing yield/quantity/unit defaults, raw source is not durably linked to the finished component, nested formulas are absent, and dormant ComponentImport relation commands fail against the old foreign key. |
| PR04 stock | Catalog-unit lock, demand/reservations, weekly draft orders, receipt quantities, transfers, adjustments, waste and audit views exist. | No opening-stock staging/provenance model; import planners still coerce units/round quantities; reservation conflict prevention is coordinator-side rather than transactionally enforced. |

## Criterion-by-criterion comparison

### PR01 — Import a complete source archive

#### PR01-01 — **partial**

- **Docs claim:** The operator uploads the 90-workbook archive, Capsule inventories all 90 against the 70-report index, and an explanation gates commit (`specs/ralph/production-01-import-archive.md:19`).
  - **Real-world example (Docs claim):** Josh chooses one archive in Admin, sees “90 files / 70 indexed,” explains the 20-file difference, and continues without a terminal or JSON.
- **Implementation:** Archive counts, checksums, name-set mismatch and explanation/commit gates exist in `src/import/import-run.manifest:52-87,199-217,272-324`; the action inventories stored bytes in `convex/archiveInventory.ts:107-176,196-364`. The local 90/70 proof passes at `tests/proofs/import-archive-inventory.runtime.test.ts:167-348`. No authored feature calls `archiveInventory.inventoryArchive`; `QuickFileImport` is a menu CSV path (`src/features/admin/import/QuickFileImport.tsx:24-59`), and the detail page still commits pasted JSON (`src/features/admin/import/ImportRunDetailPage.tsx:101-116,246-275,595-640`).
  - **Real-world example (Implementation):** A sanitized runtime fixture inventories 90 generated workbooks and blocks commit, but an operator cannot initiate that archive path from the current UI.
- **Remaining:** Wire tenant-owned file upload, index input, inventory action, discrepancy explanation and resume into Admin. Actual private 90-workbook qualification remains source/access-blocked after that; do not commit the customer archive.

#### PR01-02 — **partial**

- **Docs claim:** Every workbook and row/section has a final, reconciled disposition (`production-01-import-archive.md:20`).
  - **Real-world example (Docs claim):** A duplicate report is counted as `duplicate_view`, headers are counted separately, and no row silently disappears.
- **Implementation:** `ImportArtifact` owns the final taxonomy and row counters (`src/import/import-artifact.manifest:7-53,108-135`); the classifier and completion roll-up are proven locally by `tests/proofs/import-archive-disposition.runtime.test.ts:99-298` and survive a crash at `:298-368`. The review page renders all six labels and the unaccounted gate (`src/features/admin/import/ImportRunDetailPage.tsx:818-858`; wire assertions at `tests/features/admin/import-run-disposition.test.ts:19-52`). No operator control currently launches classification from that page.
  - **Real-world example (Implementation):** Sanitized clean, gap, unknown, corrupt, reference and duplicate workbooks reconcile to zero unaccounted rows, but the action is backend-only.
- **Remaining:** Make classification progress/action and per-artifact correction reachable in the import record; retain the proven taxonomy and counters.

#### PR01-03 — **verified(scope: local sanitized archive and authored evidence UI)**

- **Docs claim:** Authorized operators can inspect original/checksum, coordinates, raw and normalized values, date system and parser version from the import (`production-01-import-archive.md:21`).
  - **Real-world example (Docs claim):** An operator opens cell `B4` and compares the source serial with the interpreted date without downloading private data into a fixture.
- **Implementation:** Artifact storage/checksum/provenance fields are authored at `src/import/import-artifact.manifest:35-53`; extraction persists workbook metadata in `convex/archiveInventory.ts:238-266`; the panel separates raw/normalized values and shows coordinates/version/date metadata (`src/features/admin/import/ImportProvenancePanel.tsx:5-16,104-196`). Runtime authorization and provenance pass at `tests/proofs/import-provenance.runtime.test.ts:101-291`; UI wiring assertions pass at `tests/features/admin/import-provenance-panel.test.ts:25-70`.
  - **Real-world example (Implementation):** The local proof reads a merged-cell workbook from owner storage, displays `sheet!cell`, raw serial, normalized date and parser version, and denies an unauthorized staff view.
- **Remaining:** Production qualification requires an authorized private source; the current proof is deliberately sanitized.

#### PR01-04 — **verified(scope: local archive and supported-record replay/delta)**

- **Docs claim:** Identical bytes and worker/device replay create no duplicates; changed bytes produce an explicit delta (`production-01-import-archive.md:22`).
  - **Real-world example (Docs claim):** Reopening a dropped import shows the same venues, while a revised workbook reports one changed and one added artifact.
- **Implementation:** Exact archive checksum short-circuit and prior-artifact delta are in `convex/archiveInventory.ts:86-100,159-177,331-364`; external identities are uniquely tenant/source/type/ID scoped (`src/import/external-record-link.manifest:55-69`). Local replay/delta proof passes at `tests/proofs/import-reupload-delta.runtime.test.ts:201-423`; crash-window recovery is also exercised at `tests/proofs/import-resume-fault-injection.runtime.test.ts:163-376`.
  - **Real-world example (Implementation):** A second identical upload returns the prior run with zero artifacts; a changed archive reports unchanged/changed/added/removed names without duplicating venues.
- **Remaining:** Add a real browser reload/device scenario once the archive UI exists; no authenticated-production claim is made.

#### PR01-05 — **verified(scope: current supported datasets and local injected checkpoints)**

- **Docs claim:** Any partial parent/child write resumes missing work without overwriting newer edits (`production-01-import-archive.md:23`).
  - **Real-world example (Docs claim):** A failed event pack-list import resumes the missing lines but preserves a quantity an operator corrected after the crash.
- **Implementation:** Commit checkpoint state is authored at `src/import/import-run.manifest:75-81,356-379`; every current dataset branch uses the durable external link/idempotency floor in `convex/importCommit.ts:370-427,485-546`. The current contacts/events/venues/pack-list/payment fault scenarios and a 500+ link page pass at `tests/proofs/import-resume-fault-injection.runtime.test.ts:162-623`.
  - **Real-world example (Implementation):** The proof simulates a created child before acknowledgement, resumes, and retains a user-edited pack quantity of 99 instead of replacing it.
- **Remaining:** Extend the same checkpoint contract when new PR02-PR05 dataset materializers are added; do not rewrite the R2 checkpoint path.

#### PR01-06 — **verified(scope: deterministic XLSX parser fixtures)**

- **Docs claim:** Both Excel epochs, leap days, times, timezones, sparse/merged cells, accounting/fractions and cached/missing formulas are explicit; formulas/macros do not execute (`production-01-import-archive.md:24`).
  - **Real-world example (Docs claim):** A 1904 workbook and an uncached formula show named interpretations/unknowns rather than shifted dates or blank values.
- **Implementation:** The interpreted cell model records raw value, outcome, date system, timezone, macros and parser version (`src/lib/tppReports/xlsxReader.ts:37-76,320-429,487-520`). All 20 focused cases pass at `tests/xlsx-date-formats.test.ts:160-568`, including no neighboring-unit inference at `:449-469`.
  - **Real-world example (Implementation):** The parser flags Excel’s phantom 1900 leap day, retains a fractional time, and names `formula_without_cached_value` without executing it.
- **Remaining:** Apply the same explicit unknown-unit contract in recipe and stock consumers; this parser proof alone does not make their downstream defaults safe.

#### PR01-07 — **partial**

- **Docs claim:** Malicious/corrupt archives fail within visible limits and progress, with no writes outside source storage (`production-01-import-archive.md:25`).
  - **Real-world example (Docs claim):** Before expansion, an operator sees the entry/byte limit; a traversal or encrypted workbook produces a named import error and no business records.
- **Implementation:** Pure ZIP parsing rejects traversal, absolute paths, nested archives, duplicate names, encryption, excess counts/bytes and corruption (`tests/zip-archive-abuse.test.ts:95-418`); the action maps these to stable named errors (`convex/archiveInventory.ts:54-64,196-207`). The parser does no filesystem writes. No authored UI exposes preflight limits or incremental progress before the action finishes.
  - **Real-world example (Implementation):** A crafted `../` entry fails as `traversal` before decompression, but the current operator has no upload-stage progress surface.
- **Remaining:** Add bounded preflight/progress/error presentation in the archive UI without weakening the proven parser limits.

#### PR01-08 — **missing**

- **Docs claim:** A committed run survives browser close; cancel stops unstarted work and compensates only unchanged run-owned records (`production-01-import-archive.md:26`).
  - **Real-world example (Docs claim):** Josh closes his laptop, later cancels the queue, and sees which already-edited records require manual correction.
- **Implementation:** `ImportRun` has `revert` only after completion and terminal `failed`/`reverted` states (`src/import/import-run.manifest:91-98,233-269`); `commitImportRun` is a resumable action but no durable job/cancel request/conditional compensation owner was found (`convex/importCommit.ts:441-485`).
  - **Real-world example (Implementation):** An operator can reinvoke a stopped commit, but cannot request cancellation of unstarted work or review selective compensation.
- **Remaining:** Author cancel-request/checkpoint semantics and unchanged-record compensation; prove browser-close execution separately from manual reinvocation.

#### PR01-09 — **verified(scope: local completion gate and current run-detail copy)**

- **Docs claim:** Completion requires zero unaccounted records and never implies every source record became operational (`production-01-import-archive.md:27`).
  - **Real-world example (Docs claim):** A completed run still lists an unsupported workbook and a reference-only workbook.
- **Implementation:** `ImportRun.commit` requires zero unaccounted records while retaining disposition counts (`src/import/import-run.manifest:204-230,327-354`); the page states that dispositions describe source rather than operational records (`src/features/admin/import/ImportRunDetailPage.tsx:818-858`). Local completion proof passes at `tests/proofs/import-archive-completion.runtime.test.ts:73-248`.
  - **Real-world example (Implementation):** Commit is rejected with five unaccounted workbooks, then succeeds while keeping `needs_mapping`, `unsupported`, and `duplicate_view` visible.
- **Remaining:** Preserve this meaning when adding operator upload/classification controls.

### PR02 — Resolve legacy records to canonical identities

#### PR02-01 — **partial**

- **Docs claim:** Identity/field coverage spans clients/history, events/leads, venues/notes, staff/lookups, catalog/packages/prices and equipment (`production-02-source-identity.md:19`).
  - **Real-world example (Docs claim):** Every source field from a staff, venue, client-history or seasonal-price report is either owned, preserved or explicitly unresolved.
- **Implementation:** Import runs enumerate only events, contacts, leads, menus, venues, payments and pack lists (`src/import/import-run.manifest:9-17`); those branches are materialized/preserved in `convex/importCommit.ts:566-683,686-903,918-1502,1528-1656`. Staff, communications/tasks, venue-note rows, lookup catalogs, package/season price histories and general equipment identity imports are absent.
  - **Real-world example (Implementation):** A venue address and contact can land, while a staff postal-address report has no dataset/materializer.
- **Remaining:** Inventory source fields against their existing owners and add datasets incrementally; unknown fields remain evidence, not guessed columns.

#### PR02-02 — **partial**

- **Docs claim:** Exact source IDs match automatically; names/emails/variants never silently merge (`production-02-source-identity.md:20`).
  - **Real-world example (Docs claim):** Two people sharing an email remain separate and only a renamed venue enters the decision queue.
- **Implementation:** The durable unique key and lookup are tenant/source/type/external ID (`src/import/external-record-link.manifest:55-69,269-285`), and commit skips an exact prior link (`convex/importCommit.ts:606-623`). There is no recorded secondary matching-rule entity or focused ambiguous-name/shared-email proof; current records with distinct external IDs materialize independently rather than offering a reusable ambiguity decision.
  - **Real-world example (Implementation):** Replaying `ContactID=C1` reuses its link, but `C1` and `C2` with the same email are simply separate imports, not an explained match decision.
- **Remaining:** Add evidence-ranked candidate generation and explicit reusable decisions; never introduce a global silent threshold.

#### PR02-03 — **partial**

- **Docs claim:** From the source/result view, an operator can select an existing typed record, create one, correct/reuse a mapping, and preview bulk effects (`production-02-source-identity.md:21`).
  - **Real-world example (Docs claim):** A venue is linked to an existing renamed venue, and a bulk rule previews the five rows it will affect.
- **Implementation:** External links can update target, verify and resolve (`src/import/external-record-link.manifest:151-245`). The reconcile page bulk-verifies/skips records and offers an existing-record chooser only for payments (`src/features/admin/import/ExternalRecordsReconcilePage.tsx:70-95,129-201,281-520`). It does not create correctly typed targets, preview bulk rules, or provide general entity candidate pickers.
  - **Real-world example (Implementation):** An operator can connect a staged payment to an existing payment, but cannot create/link a renamed venue in the same queue workflow.
- **Remaining:** Build typed resolution cards over the current link commands; add preview/reuse state rather than broad direct edits.

#### PR02-04 — **partial**

- **Docs claim:** Single-name people, unnamed company contacts, missing email and international text survive without fabricated identity fields (`production-02-source-identity.md:22`).
  - **Real-world example (Docs claim):** “Cher” with no email imports as the original single name, not `Cher Unknown`.
- **Implementation:** Native `ClientContact` allows an optional family name/email (`src/sales/contact.manifest:14-39,50-70`), and imported raw rows are preserved. However the TPP parser rejects a missing last name (`convex/tppParser.ts:930-970`), while `importCommit` materializes contacts as person Clients (`convex/importCommit.ts:566-575,623-650`).
  - **Real-world example (Implementation):** A missing email survives, but a valid one-word contact name is rejected before materialization.
- **Remaining:** Preserve source spelling/text and route single-name/company-only identities to compatible normal owners without fake values.

#### PR02-05 — **partial**

- **Docs claim:** Corrections keep source links/user edits, move all dependent history atomically, and resume failed multi-record work (`production-02-source-identity.md:23`).
  - **Real-world example (Docs claim):** Merging a duplicate client reassigns events and invoices while the source identity still points to the surviving client.
- **Implementation:** `ClientMerge` moves events, contacts, proposals, contracts, invoices, payments, methods and credit memos in one generated reaction transaction (`src/sales/contact-merge.manifest:21-118`). External target changes reset verification (`src/import/external-record-link.manifest:198-214`) but no reaction updates links during merge, no resumable progress model exists, and the queue does not show dependent impact.
  - **Real-world example (Implementation):** Native client history moves atomically, but a TPP link can remain aimed at the now-merged duplicate.
- **Remaining:** Couple merge/relink with source-link preservation and an impact preview; prove rollback/resume without overwriting post-import edits.

#### PR02-06 — **missing**

- **Docs claim:** Imported communications/tasks become searchable native history with original time/state and no side effects (`production-02-source-identity.md:24`).
  - **Real-world example (Docs claim):** A completed 2024 call task appears under the actual client without reopening or sending anything.
- **Implementation:** Native communication history exists (`src/sales/client-communication.manifest:1-9`), but there is no communication/task dataset in `ImportDatasetType` (`src/import/import-run.manifest:9-17`) and no materializer in `convex/importCommit.ts`.
  - **Real-world example (Implementation):** Source JSON may be attached as evidence, but normal client history is not populated.
- **Remaining:** Add capture-only native history imports with original timestamps/completion state and explicit no-send/no-reopen proofs.

#### PR02-07 — **partial**

- **Docs claim:** Venue supplements, birthdays, staff postal addresses and other mapped fields persist in their owners/reports with unknowns visible (`production-02-source-identity.md:25`).
  - **Real-world example (Docs claim):** A venue loading note appears in venue operations while an absent birthday displays unknown.
- **Implementation:** Venue imports map address/contact/access/catering fields (`convex/importCommit.ts:1572-1602`), and `VenueNote` is a native owner (`src/operations/venue-note.manifest:22-48`). No importer maps venue-note rows, birthdays or staff postal addresses, and no applicable report proof was found.
  - **Real-world example (Implementation):** Access notes land on a Venue, but a separate venue supplement or staff address stays only in source evidence.
- **Remaining:** Map each report field to its existing domain owner before adding schema; render missing as unknown.

#### PR02-08 — **partial**

- **Docs claim:** Category/package/season/price changes affect future selection without mutating accepted snapshots; unknown service styles stay resolvable (`production-02-source-identity.md:26`).
  - **Real-world example (Docs claim):** A fall package price applies to a new proposal while last month’s accepted revision remains unchanged.
- **Implementation:** Menu rows currently become Dishes, with category and empty price fields preserved as raw source (`convex/importCommit.ts:1190-1203,1251-1295`); no package/season/effective-price identity import exists. Event source status/style context can remain pending/raw, but the generic resolver is not a service-style mapping workflow.
  - **Real-world example (Implementation):** A source dish category survives, but a seasonal package price cannot become a future-effective catalog choice.
- **Remaining:** Use existing commercial snapshot owners for accepted values; build lookup/effective-price mappings without rewriting history.

#### PR02-09 — **partial**

- **Docs claim:** Reload/replay retains decisions and imported/native records share normal paths (`production-02-source-identity.md:27`).
  - **Real-world example (Docs claim):** After refresh, a corrected venue mapping remains and opens the same venue detail editor as a native venue.
- **Implementation:** External links are durable and replay-keyed (`src/import/external-record-link.manifest:55-88`); materialized venues/clients/dishes are normal entities (`convex/importCommit.ts:628-650,1251-1277,1572-1602`). The current queue decisions persist, but generic mapping correction, merged-link continuity and all covered record types lack end-to-end reload/search/archive proof.
  - **Real-world example (Implementation):** A replayed imported venue reuses a normal Venue ID; a corrected non-payment mapping has no complete UI flow to verify after refresh.
- **Remaining:** Add reload/replay proofs per typed resolver and prove normal detail/archive/search behavior.

### PR03 — Turn source recipes into usable kitchen formulas

#### PR03-01 — **partial**

- **Docs claim:** Nested source recipes can be parsed, corrected, used in the normal recipe book, and retain accessible source text (`production-03-recipe-truth.md:19`).
  - **Real-world example (Docs claim):** A sauce subrecipe is matched inside an entrée, then the chef opens the normalized component and compares the original text.
- **Implementation:** `/kitchen/components/import` parses paste/TXT/CSV into editable review and atomically materializes a normal Component/Ingredient/BOM (`src/features/kitchen/import/ComponentImportPage.tsx:115-147,184-212`; `convex/lib/culinaryOperations.ts:91-139`). Current local proofs pass at `tests/component-text-parser.test.ts:57-244` and `tests/proofs/component-import-finalize.runtime.test.ts:40-163`. Nested component references are not parsed, and the UI never creates the durable `ComponentImport` row whose `rawSourceText` exists at `src/culinary/component-import.manifest:31-65,87-150`; finished component detail cannot show source text.
  - **Real-world example (Implementation):** A flat herb-oil recipe becomes a normal Component, but its raw text exists only in browser state/materialization input and a “sauce component” line is treated as an Ingredient candidate.
- **Remaining:** First-wave candidate below: wire durable source/review/finalization honestly, then add nested formula classification separately.

#### PR03-02 — **partial**

- **Docs claim:** Repeated exports deduplicate; same-name different formulas remain revisions; scaled equivalents keep their source basis (`production-03-recipe-truth.md:20`).
  - **Real-world example (Docs claim):** Two “Pesto” formulas remain reviewable revisions, while the same formula exported for 10 and 100 servings links without duplication.
- **Implementation:** `SourceFingerprint` is deterministic (`tests/component-text-parser.test.ts:49-53`), `ComponentImport` stores a fingerprint (`src/culinary/component-import.manifest:36-40`), and Components have snapshots/version numbers (`src/culinary/component.manifest:22-31,415-467`). The active import path does not persist/query the fingerprint or normalize formula equivalence; its materialization receipt only protects a single operation scope (`convex/lib/culinaryOperations.ts:101-106,137-139`).
  - **Real-world example (Implementation):** Retrying one save returns the prior Component, but importing the same file again from a new browser operation can create another recipe.
- **Remaining:** Persist source fingerprint plus canonical formula signature/serving basis and present same-name revisions for decision.

#### PR03-03 — **partial**

- **Docs claim:** Quantities/units retain dimensional meaning; unknowns never become `each` or rounded one (`production-03-recipe-truth.md:21`).
  - **Real-world example (Docs claim):** `1/4 cup`, `0.1 batch`, fluid ounces and an unknown case unit remain distinct and actionable.
- **Implementation:** Mixed fractions and known units parse (`src/features/kitchen/import/ComponentTextParser.ts:7-19,212-278`; proof `tests/component-text-parser.test.ts:57-127`), and cost conversion distinguishes compatible units. But a missing yield becomes `1 portion` (`ComponentTextParser.ts:145-153`), a unitless line becomes quantity `1 each` (`:237-244`), invalid/nonpositive quantities become 1 (`:220-227,247-275`), and unknown/blank unit aliases become `each` (`src/features/kitchen/import/UnitOfMeasureMapper.ts:120-127`).
  - **Real-world example (Implementation):** `1/4 cup salt` survives, while `case tomatoes` can silently become `1 each tomatoes`.
- **Remaining:** Represent parsed quantity/unit/yield as known or unresolved with raw text; require correction only for affected materialization.

#### PR03-04 — **partial**

- **Docs claim:** Ingredients, subrecipes and instructions are separate; cycles/missing nested formulas are localized (`production-03-recipe-truth.md:22`).
  - **Real-world example (Docs claim):** “Portion sauce” is a prep step, not a purchased Ingredient, and a sauce cycle blocks only that recipe.
- **Implementation:** Instructions are separated from ingredient-looking lines (`ComponentTextParser.ts:157-210`; proof at `tests/component-text-parser.test.ts:92-104`), and Component steps are a distinct entity (`src/culinary/component.manifest:334-412`). The import review has only ingredient lines (`src/features/kitchen/import/ComponentImportTypes.ts:9-39`); there is no subrecipe line kind, nested dependency or cycle/missing-formula detector.
  - **Real-world example (Implementation):** Numbered method steps do not become ingredients, but “2 batches house sauce” cannot link to another Component.
- **Remaining:** Add explicit line kinds and a bounded component dependency validator before emitting demand.

#### PR03-05 — **partial**

- **Docs claim:** Serving changes scale verified demand exactly once and retain overrides/completed-work identity (`production-03-recipe-truth.md:23`).
  - **Real-world example (Docs claim):** Changing 100 to 150 guests increases applicable demand 1.5× without duplicating it or rewriting completed prep.
- **Implementation:** Demand stores source line/batch/yield inputs (`src/inventory/demand.manifest:47-69,123-166`), and current fan-out proof shows stable demand IDs and exact rescaling/replay for 10→12 servings (`tests/proofs/component-to-demand-foreach.runtime.test.ts:35-327`). It does not prove verified serving-basis semantics, event-specific overrides, or already-completed work preservation.
  - **Real-world example (Implementation):** Three ingredient demands revise once on headcount change, but an overridden/completed line is not covered.
- **Remaining:** Carry formula version/basis and override/completion provenance into reconcile decisions; add the 100→150 acceptance scenario.

#### PR03-06 — **partial**

- **Docs claim:** Prices have units/effective dates/provenance and all cost/margin views expose missing coverage (`production-03-recipe-truth.md:24`).
  - **Real-world example (Docs claim):** A recipe shows “$42 known, 8/10 lines priced,” not a complete margin when two ingredients lack prices.
- **Implementation:** Component cost treats nonpositive price as `missing_price`, distinguishes unit mismatch, and returns coverage (`src/features/kitchen/ComponentCostCalculator.ts:95-176`); the panel labels priced subtotal/line coverage (`src/features/kitchen/ComponentCostPanel.tsx:41-102`). Event profitability also marks zero/mismatch incomplete (`tests/proofs/menu-profitability-direct-ingredient.runtime.test.ts:224-348`). New imported ingredients persist cost `0` with no source-price provenance (`src/features/kitchen/import/ComponentImportFinalizer.ts:125-132`; `convex/lib/culinaryOperations.ts:117-119`).
  - **Real-world example (Implementation):** A zero-cost imported ingredient is shown as missing price rather than free in the audited component view, but its source/effective-date provenance is absent and not every cost consumer was audited here.
- **Remaining:** Preserve the current zero sentinel and honest missing-price display in first wave; add price observations/provenance when source values exist, then audit broader PR03-06 consumers before claiming completeness. Do not invent or globally nullable-migrate money.

#### PR03-07 — **partial**

- **Docs claim:** Publishing freezes a formula version for historical event cost; later edits do not rewrite prior actuals/sell price (`production-03-recipe-truth.md:25`).
  - **Real-world example (Docs claim):** Tomorrow’s revised sauce does not change yesterday’s event food cost.
- **Implementation:** Components publish/retract with a version number (`src/culinary/component.manifest:150-178`) and snapshots preserve scalar/line JSON (`:415-467`); event demand stores calculation inputs. Snapshot capture is best-effort and explicitly does not block a change (`src/features/kitchen/componentSnapshotCapture.ts:1-12`), and no event cost fact is tied to a published ComponentSnapshot/version.
  - **Real-world example (Implementation):** A chef can view/restore Component history, but a historical event still lacks an authoritative formula-version link.
- **Remaining:** Bind event costing/demand to the selected published formula version while leaving accepted sell-price ownership in PR06.

#### PR03-08 — **partial**

- **Docs claim:** Incomplete-cost instructions remain usable with specific notices; empty sources are incomplete, not fabricated; unrelated prep is not globally gated (`production-03-recipe-truth.md:26`).
  - **Real-world example (Docs claim):** Kitchen staff can cook from complete instructions while a single missing price remains a visible task.
- **Implementation:** Component detail shows specific missing-price/unit issues and explicitly permits publish (`src/features/kitchen/ComponentCostPanel.tsx:90-102`; `src/features/kitchen/ComponentDetailPage.tsx:403-409,556-558`). The import blocks zero ingredient lines, but it fabricates missing yield/name defaults (`ComponentTextParser.ts:35-43,145-153`) instead of a durable incomplete state.
  - **Real-world example (Implementation):** A known formula with one missing price stays usable; an empty source becomes “Untitled component / 1 portion” in transient parse state.
- **Remaining:** Make missing source fields explicit unresolved/incomplete facts while preserving non-global usability.

#### PR03-09 — **partial**

- **Docs claim:** Allergen/nutrition states retain evidence and unknown; absence is not an allergen-free claim and volume is not count-weight (`production-03-recipe-truth.md:27`).
  - **Real-world example (Docs claim):** A source with no allergen section reads “not provided,” not “allergen free.”
- **Implementation:** Dish allergen summary is stored/classifiable (`src/culinary/dish.manifest:23-27,212-235`; proof `tests/proofs/dish-allergen-summary.runtime.test.ts:9-31`) and nutrition conversion has dimension-aware helpers. Import-created ingredients receive `allergens: []` (`ComponentImportFinalizer.ts:125-132`; `culinaryOperations.ts:117-119`) with no evidence/unknown distinction.
  - **Real-world example (Implementation):** The finished ingredient can look like it has no listed allergens even though the source made no claim.
- **Remaining:** Store claim provenance/unknown state and keep volumetric portions out of count-weight presentation.

### PR04 — Maintain a trustworthy event stock position

#### PR04-01 — **missing**

- **Docs claim:** Opening import classifies stock/equipment/disposables/components/instructions and records as-of/location/unit/source/uncertainty (`production-04-stock-flow.md:15`).
  - **Real-world example (Docs claim):** A sheet row for a chafing dish becomes equipment evidence, while flour becomes uncertain ingredient stock at a named location and time.
- **Implementation:** Native `InventoryItem` owns ingredient/location/quantity/unit but has no source/as-of/uncertainty fields (`src/inventory/stock.manifest:15-38`); no opening-stock dataset/classifier exists in `src/import/import-run.manifest:9-17` or `convex/importCommit.ts`.
  - **Real-world example (Implementation):** Staff can manually open flour stock, but cannot stage a mixed historical inventory sheet honestly.
- **Remaining:** Build capture/staging before activation. Authoritative activation is configuration-blocked on an owner-confirmed cutover timestamp/physical count, but capture is not blocked.

#### PR04-02 — **partial**

- **Docs claim:** Missing/incompatible units and uncertain/conflicting counts are resolved per record and never defaulted (`production-04-stock-flow.md:16`).
  - **Real-world example (Docs claim):** A blank source unit stays unresolved rather than becoming zero `each`.
- **Implementation:** Native stock refuses a unit different from the ingredient catalog (`src/inventory/stock.manifest:57-86`), proven at `tests/proofs/inventory-stock-unit-catalog-lock.runtime.test.ts:68-131`. But supply import explicitly defaults unknown units to `each` and records zero cost (`src/agent/CapsuleEventBundleSupplyPlan.ts:94-113,208-213`); no per-record opening-count resolver exists.
  - **Real-world example (Implementation):** Manual kilogram stock cannot be opened as each, while a source “Case” can still be planned as each before reaching that guard.
- **Remaining:** Stage unresolved source units/counts and reuse catalog-unit validation only after explicit mapping.

#### PR04-03 — **partial**

- **Docs claim:** All movement types reconcile through one stock calculation and replay never duplicates movement (`production-04-stock-flow.md:17`).
  - **Real-world example (Docs claim):** Opening + receipt + transfer − consumption − waste − return produces the same available total everywhere after replay.
- **Implementation:** `InventoryItem` calculates available as on-hand minus active reservations and owns receive/adjust/recount/transfer (`src/inventory/stock.manifest:41-46,101-203`); reservation consumption adjusts stock (`:539-556`), StockTransfer is recorded (`src/inventory/transfer.manifest:11-115`), and WasteRecord exists (`src/inventory/demand.manifest:288-325`). The command API lifecycle passes (`tests/proofs/inventory-command-api-lifecycle.runtime.test.ts:38-209`), but there is no opening/return movement owner or single idempotent movement ledger proof spanning all listed types.
  - **Real-world example (Implementation):** Reservation consumption decrements stock once in the tested flow, but an opening balance plus return cannot be reconciled through one ledger.
- **Remaining:** Define a movement/reconciliation projection over existing commands; avoid a speculative second inventory subsystem.

#### PR04-04 — **partial**

- **Docs claim:** Headcount/menu changes revise the same weekly draft without erasing manual adjustments or scheduling unnecessary production (`production-04-stock-flow.md:18`).
  - **Real-world example (Docs claim):** A 20-person increase updates one flour line on the existing draft while retaining a buyer’s manual buffer.
- **Implementation:** Weekly drafts match vendor/week, demand contributions are idempotently linked/revised (`src/procurement/order.manifest:132-159,487-526,769-850`), and the local two-event/headcount proof keeps one draft (`tests/proofs/event-weekly-purchasing.runtime.test.ts:41-463`). The proof does not exercise a manual draft adjustment, menu removal/cancellation, or the “recipe use alone” non-scheduling boundary.
  - **Real-world example (Implementation):** Headcount change revises the same draft order, but preservation of a buyer-edited quantity is unproven.
- **Remaining:** Separate system contribution from manual adjustment explicitly and add change/removal/replay acceptance scenarios.

#### PR04-05 — **partial**

- **Docs claim:** Partial receipt updates stock and balance exactly once; corrections retain the original receipt and post a reasoned delta (`production-04-stock-flow.md:19`).
  - **Real-world example (Docs claim):** Receiving 8 of 10 leaves 2 outstanding; correcting to 7 retains the 8 receipt plus a −1 adjustment reason.
- **Implementation:** Order lines store decimal received/remaining quantities and constrain over-receipt (`src/procurement/order.manifest:393-431,555-605`); receipt contribution comments/keys target idempotent partial receipt at `:636-769,710-740`. The current receiving/price proof updates totals and stock for a receipt (`tests/proofs/vendor-order-pricing-totals.runtime.test.ts:78-353`), but no correction command/delta scenario was found.
  - **Real-world example (Implementation):** A 16-unit receipt completes once, but correcting an incorrect receipt has no proven traceable delta workflow.
- **Remaining:** Add immutable receipt correction via stock/order deltas and prove retry does not duplicate either side.

#### PR04-06 — **partial**

- **Docs claim:** Concurrent operators cannot reserve the same final units; shortage is line-scoped with actions, not a global freeze (`production-04-stock-flow.md:20`).
  - **Real-world example (Docs claim):** Two events race for the last 2 kg; one reservation wins and the other sees a 2 kg line shortage with purchase/transfer options.
- **Implementation:** The UI coordinator calculates available stock, reuses existing holds and reports line shortages (`tests/event-stock-reservation-coordinator.test.ts:5-133`; reconcile proof `tests/event-stock-reservation-reconcile.test.ts:5-277`). The domain `reserve` command validates positive quantity/item/event but does not enforce aggregate available stock transactionally (`src/inventory/stock.manifest:309-348`), so simultaneous coordinators can both pass stale availability.
  - **Real-world example (Implementation):** Sequential allocation reports a shortage; a true two-operator race is not prevented at the write boundary.
- **Remaining:** Put the final aggregate availability check and conflict result in one transactional authored seam/command path; keep resolution line-scoped.

#### PR04-07 — **partial**

- **Docs claim:** Event cancel/reduction releases only unconsumed holds/unsubmitted demand; later facts use normal corrections (`production-04-stock-flow.md:21`).
  - **Real-world example (Docs claim):** Cancelling an event releases active flour reservations but leaves already-consumed stock and a submitted PO intact.
- **Implementation:** Event cancellation/completion fan out `release` only to active reservations (`src/inventory/stock.manifest:539-549`), while consumed reservations are terminal (`:300-302,350-397`). No complete source path/proof was found that reduction cancels only the event’s unsubmitted PurchaseNeed/contribution while preserving submitted orders and actual waste.
  - **Real-world example (Implementation):** Cancel releases an active hold; the linked weekly draft/demand contribution is not proven to reconcile correctly across order states.
- **Remaining:** Extend contribution reconciliation for reduction/cancel and prove submitted/consumed/waste boundaries.

#### PR04-08 — **partial**

- **Docs claim:** Fractional need is retained; pack rounding is explicit with need vs ordered; recalculation never sends/submits (`production-04-stock-flow.md:22`).
  - **Real-world example (Docs claim):** A need of 0.25 case displays alongside an explicit 1-case order decision, and remains a draft.
- **Implementation:** Demand/order quantities are decimal (`src/inventory/demand.manifest:47-57`; `src/procurement/order.manifest:393-431`), and weekly auto-order stays draft (`tests/proofs/event-weekly-purchasing.runtime.test.ts:347-463`). The TPP supply planner rounds any sub-one quantity to one and defaults unmatched units to each (`src/agent/CapsuleEventBundleSupplyPlan.ts:94-113,154-221`), with warning text but no stored need-vs-pack conversion provenance.
  - **Real-world example (Implementation):** Native weekly need can remain fractional, while imported `0.25 Case` becomes an `each` line rounded to 1.
- **Remaining:** Persist raw need/unit plus explicit pack rule/ordered quantity; never submit/contact vendor from import.

#### PR04-09 — **partial**

- **Docs claim:** Empty location/vendor blockers can be fixed in place, the preserved form resumes, and refreshed totals agree (`production-04-stock-flow.md:23`).
  - **Real-world example (Docs claim):** From an unfinished stock form, staff add the first location, return to the same values, save, refresh, and see matching stock/shortage/order/receipt totals.
- **Implementation:** Stock Book exposes `New location` (`src/features/inventory/StockBookPage.tsx:437-454`) and Purchasing exposes inline `Onboard vendor`, including its empty state (`src/features/inventory/PurchasingQueueSplit.tsx:219-245`; `src/features/inventory/PurchasingPage.tsx:348-399`). No evidence shows a blocked child workflow returns to a preserved parent form or proves cross-screen totals after refresh.
  - **Real-world example (Implementation):** Staff can populate empty catalogs, but must restart the interrupted form and consistency is unverified.
- **Remaining:** Preserve draft form state across inline creation and add one reload scenario comparing stock, shortage, order and receipt views.

## Prioritized delivery groups

### 1. Honest, durable source recipe → normal Component (recommended first executable slice)

**Operator-visible benefit:** A chef can paste/upload a source recipe, see exactly which yield/unit/quantity/cost/allergen facts are unknown, correct only those facts, save once, reload the normal Component, and still inspect the original source. No fake `1 portion`, `each`, price or allergen claim is introduced.

**Authored owners:**

- Domain workflow: `src/culinary/component-import.manifest` (ComponentImport/ComponentImportLine source, parse, review, finalization and result link).
- Parse/review UI: `src/features/kitchen/import/ComponentImportTypes.ts`, `UnitOfMeasureMapper.ts`, `ComponentTextParser.ts`, `ComponentCsvParser.ts`, `ComponentImportCoordinator.ts`, `ComponentImportPanes.tsx`, `ComponentImportPage.tsx`.
- Atomic materialization seam: `convex/lib/culinaryOperations.ts`; client hook remains `src/lib/safeCulinaryOperations.ts`.
- Source display: `src/features/kitchen/ComponentDetailPage.tsx` plus the smallest authored source-evidence component.
- Focused proof owners: `tests/component-text-parser.test.ts`, `tests/proofs/component-import-finalize.runtime.test.ts`, `tests/proofs/safe-culinary-operations.runtime.test.ts`; add a workflow/runtime proof only because the production-readiness acceptance contract asks for it.

**Existing interfaces to extend, not replace:**

- `ComponentImport.upload(sourceKind, rawSourceText, sourceByteCount, sourceFingerprint, sourceFilename?)`, `recordParse(...)`, `beginReview()`, `recordResolutionProgress(count)`, `approveReview()`, `beginFinalization()`, `recordComponent(resultingComponentId)`, `complete()` (`component-import.manifest:87-280`).
- `ComponentImportLine.stage(...)`, exact/possible/new/confirm/reset/attach commands (`component-import.manifest:283-450`).
- `culinaryOperations.importComponent({ operationKey, projection })` (`convex/lib/culinaryOperations.ts:91-139`) and the current review projection in `ComponentImportFinalizer.ts:90-119`.

**Required command-shape repair before UI wiring:** The current relation guards inspect the old stored foreign key before applying the argument. `ComponentImport.recordComponent` therefore fails when `resultingComponentId` is still null (`src/culinary/component-import.manifest:207-217`; generated evidence `convex/mutations.ts:3936-3961`). `ComponentImportLine.attachCreatedIngredient` and `confirmExisting` have the same collision (`component-import.manifest:383-424`; generated evidence `convex/mutations.ts:4306-4384`). Repair these authored manifest command shapes and regenerate; do not hand-edit generated files or bypass the governed command lifecycle.

**Acceptance scenarios:**

1. Parse a flat source with a missing yield and an unknown purchase unit. Review shows raw text plus unresolved yield/unit; neither becomes `1 portion` nor `each`. Instructions remain editable and no unrelated global gate appears.
2. Confirm one existing Ingredient and one new Ingredient, then finalize. One Component, exact BOM lines, durable ComponentImport/line rows and the result link are created atomically; injected failure leaves no partial business graph.
3. Retry the same confirmed operation after a lost acknowledgement. It returns the same Component and completes the same import record; changed review input is not silently presented as newly saved.
4. Reload Component detail. It shows the original source/fingerprint and explicit unknown allergen/price evidence. Cost `0` remains the existing missing-price sentinel: ComponentCostCalculator/Panel must continue to display incomplete coverage, not free food.
5. Denied role/foreign-tenant Ingredient fails with no partial records. Focused tests, typecheck, format check, manifest regeneration/ownership gate and normal build gate pass in the implementation turn.

**Dependencies and boundaries:** Read `DESIGN.md` before authored UI changes. Preserve current component cost coverage and materialization receipts. Do not solve nested formulas, global nullable money, stock import or production data in this slice. Any source value not present remains unresolved.

### 2. Operator archive intake, preflight and cancel-safe execution

**Operator-visible benefit:** Admin can upload the archive/index once, see limits/progress/discrepancy/dispositions, close/reopen safely, and cancel unstarted work without JSON or terminal steps.

**Authored owners:** `src/features/admin/import/ImportRunsListPage.tsx`, `ImportRunDetailPage.tsx`, a focused upload/progress component under the same folder, `src/import/import-run.manifest`, `convex/archiveInventory.ts`, `convex/archiveDisposition.ts`, `convex/importCommit.ts` and the existing PR01 proofs.

**Existing interfaces:** `archiveInventory.inventoryArchive`, `archiveDisposition.classifyArchiveWorkbooks`, generated ImportRun discrepancy/disposition/checkpoint/commit commands, and `ImportProvenancePanel`. Preserve all R2 fields, repair behavior and AC-020..027 proofs.

**Acceptance scenarios:** 90/70 sanitized upload from UI; equal-count name substitution; visible ZIP preflight/limits and named error; browser close/reopen; cancel before next checkpoint; compensation skips a user-edited record and reports it; zero-unaccounted completion retains partial/reference/unsupported visibility.

**Dependencies:** PR12 source access governs authorization/retention. Do not use private files in fixtures. Actual production archive qualification needs separately authorized source access.

### 3. Typed source identity resolution and correction

**Operator-visible benefit:** Staff resolve an ambiguous person, company, venue or catalog record once from the source view, see affected rows before reuse, and keep normal history/search/detail behavior.

**Authored owners:** `src/import/external-record-link.manifest`, source-specific mapping additions under `src/import/`, `convex/tppParser.ts`, `convex/importCommit.ts`, `src/features/admin/import/ExternalRecordsReconcilePage.tsx`, and merge coordination in `src/sales/contact-merge.manifest` plus a small authored seam only if transaction orchestration is required.

**Existing interfaces:** tenant/source/type/external-ID unique link, `updateCapsuleId`, `verifyLink`, `resolveConflict`, ClientMerge reaction graph, and normal generated create/search/detail hooks.

**Acceptance scenarios:** exact source-ID reuse; same email/different people remain separate; renamed venue offers candidates but does not auto-merge; single-name/no-email contact survives; create/link/correct from queue; bulk preview; merge moves dependents and source links atomically; reload/replay preserves the decision.

**Dependencies:** PR01 provenance must identify the source field/row; field owners must be inventoried before schema additions. No global match threshold.

### 4. Nested formula, version and evidence completion

**Operator-visible benefit:** Kitchen staff can distinguish purchased ingredients, subrecipes and instructions; formula changes scale demand once and historical events keep the formula/cost evidence they used.

**Authored owners:** `src/culinary/component.manifest`, `dish.manifest`, a minimal authored nested-formula owner if the existing Component/DishComponent relations cannot express it, kitchen import parser/review files, `src/inventory/demand.manifest`, cost/nutrition/allergen helpers and Component detail/history UI.

**Existing interfaces:** Component/Dish/ComponentIngredient/ComponentStep, snapshots and publish/retract, `IngredientDemand.syncFromContributions/calculate`, `ComponentCostCalculator`, `IngredientPriceHistory`, and current recipe-to-demand reactions.

**Acceptance scenarios:** nested sauce match; localized missing/cycle error; scaled-equivalent import retains source basis; 100→150 serving change updates stable demand IDs exactly once; event override/completed work remains identifiable; published formula version is linked to historical event cost; unknown allergen/nutrition remains unknown.

**Dependencies:** Delivery 1 supplies honest durable source facts; PR06 owns accepted sell-price snapshots. No guessed density, portion weight or nutrition.

### 5. Opening stock truth and concurrency-safe event reconciliation

**Operator-visible benefit:** Inventory staff stage uncertain opening rows, resolve units/counts per record, then trust that reservations, draft purchasing and receipts cannot double count or hide a conflict.

**Authored owners:** new staging semantics in authored `src/import/` plus `src/inventory/stock.manifest`, `demand.manifest`, `transfer.manifest`, `stock-count.manifest`, `src/procurement/order.manifest`, `event-purchasing.manifest`; orchestration in existing authored event-stock coordinators/Convex seams; UI in `src/features/inventory/StockBookPage.tsx`, `PurchasingPage.tsx` and event shortage surfaces.

**Existing interfaces:** `InventoryItem.open/receiveStock/adjustQuantity/recount/transfer*`, `InventoryReservation.reserve/release/consume`, StockCount, WasteRecord, weekly VendorOrder/VendorOrderLine/VendorOrderLineDemand contribution model, and receipt contribution/lot records.

**Acceptance scenarios:** mixed opening sheet classification; blank/conflicting unit remains unresolved; owner-selected cutover activates only resolved rows; two concurrent reservations for final stock yield one winner/one line shortage; headcount change preserves one weekly draft and buyer adjustment; partial receipt replay is idempotent; correction posts an immutable reasoned delta; cancel/reduction changes only unconsumed/unsubmitted facts; empty catalog child creation returns to preserved form and reload totals agree.

**Dependencies:** Delivery 4 provides dimensionally valid demand. Opening-balance activation is configuration-blocked on the owner-confirmed cutover timestamp/physical count; capture, UI and isolated proofs can proceed before that choice.

## Recommended next-plan boundary

Implement Delivery 1 only as the first wave. It is locally buildable, immediately user-visible, and closes a dangerous source-of-truth gap without requiring private data, provider configuration, stock valuation, or owner policy. Its exit condition is a reloadable normal Component whose source and unresolved facts remain inspectable, whose atomic retry identity is proven, and whose current incomplete-cost UI remains honest. Keep Deliveries 2-5 as independently releasable follow-ons rather than one cross-product branch.
