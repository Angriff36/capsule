# Ashley packing source reconciliation

Read-only evidence captured 2026-09-09. No packing data has been changed.

Sources: `work/training docs/binder-docs/REF-pack-list.pdf` (dish/equipment associations, printed September 3), `pack-list-by-item.pdf` (grouped totals), and migration `reports/event_specific/Pack_List.xlsx` (September 4). All describe Ashley invoice 6014, 167 guests. Dates and source differences matter; neither packing report overrides a conflicting recipe formula automatically.

## Imported quantities largely reconcile

The live snapshot has 234 Ashley packing rows. The grouped workbook has 160 source items. Exact normalized source-name comparison identifies 218 imported rows against 158 source items, with no competing longest-name matches. These are evidence candidates, not authority to change links.

- Five one-chafer allocations total the source five chafers (A150). Five two-can Sterno allocations total ten cans (G150). Do not delete these allocations as duplicates or add the grouped totals again.
- BOH trash cans total four: three plus one marked for scullery (G10/G13). Equipment Summary's three excludes that additional event requirement.
- Creamy horseradish, gorgonzola, microgreens, red chimichurri and seared tuna differ only by the report's two-decimal presentation rounding. Preserve the more precise imported quantities; do not overwrite them with rounded print values.
- The positive source item without an imported row is Good Shuffle Pro Order, one each, A184, Always Pack Item, note silver kit. This is rental/order context requiring proper representation, not a new food ingredient. Nutella is explicitly zero in this packing source and has no imported row; a conflicting prep quantity remains a source conflict.
- Sixteen live rows have no match in this grouped workbook: fryer/grill/oven/burner equivalents, unspecified linens, chalkboard and extra laundry/gloves/towels. Preserve these while locating their source. Absence from one report does not authorize deletion.

## Lost associations can be substantially recovered

184 live descriptions contain the UI placeholder `Show Association`. The reference PDF contains 221 individual allocations, retaining their parent dish, rental, event-only or always-pack section. Coordinate-aware extraction preserves two-column items and multi-line parent headings; plain PDF text order places some headings after the first item and is unsafe for this mapping.

Comparison by full item identity, compatible legacy unit label and source display rounding yields:

| Result | Live rows |
| --- | ---: |
| One distinct source association | 191 |
| Multiple possible source associations | 27 |
| No matching source allocation | 16 |

Of the 191 unique results, 141 recover a missing association; the other 50 already name their context. These are explicit source candidates, not applied links. Twenty-seven ambiguous rows include identical chef knives, cutting boards, chafers' water, tongs, platters, hotel pans and tables. Do not assign them to dishes by array order. Preserve existing packed facts and staff changes when qualifying any repair.

Single-association food rows must retain their source meaning. A prepared sauce, ingredient, tool and service item are not all DishContainer templates. Source event quantities also do not establish a reusable container's physical capacity.

## Five confirmed fluid-volume import errors

These workbook rows say `Oz - Fld`; their matching live rows say `ounce`, which Capsule's conversions treat as mass:

| Cell | Item | Source fluid ounces |
| --- | --- | ---: |
| A264 | Bacon Jam | 10.5 |
| G281 | Caramel Sauce | 83.5 |
| A291 | Chocolate Sauce | 83.5 |
| G294 | Cream sauce for chicken | 167 |
| A347 | Balsamic Glaze | 10.5 |

Repair must preserve volume using a supported volume unit and convert both required and observed packed quantities consistently. It must not use a food-density guess or silently reinterpret mass ounces. This evidence confirms the imported unit error; a repair has not been applied.

## Reproducible evidence

Ignored scratch under `.artifacts/operations-source-study/`:

- `extract-packing-source.py` → `packing-source-items.json`: original worksheet cell addresses, source categories, For fields and nearby notes. Recognizes Cold Food, Dry Food, Dry Goods, Cambro, Cold Beverage Container and Kit - Catering as headings.
- `compare-packing-source.py` → `packing-source-comparison.json`: grouped totals, complete original live rows, unmatched records and differences.
- `extract-packing-associations.py` → `packing-source-associations.json`: PDF page/bounding box, parent section/association, quantity, unit and notes.
- `qualify-packing-associations.py` → `packing-association-candidates.json`: explicit live IDs/versions, all matching page evidence, unique/ambiguous/unmatched classification. Legacy fluid-ounce matching is for diagnosing the import error, not a claim that volume and mass are compatible.
- Input live snapshot: `live-packing-20260909.json`; Ashley list `qn74zdd566841ftstrnhy6f69s8dpsde`.

Next implementation must connect these records through the correct food/equipment model, carry provenance internally, repair confirmed unit and association errors repeatably, and preserve physical work. Complete source conflicts, served app verification, full gates and production proof remain required by the original goal.


## Repeatable fluid-unit repair command (2026-09-09)

The atomic `lib/culinaryOperations:reconcileImportedPackingFluidOunces` seam and generated correction command already implement conversion and preserve packing state. The reviewed selection now lives at `codex-plans/source-backed-operations/recipes/ashley-packing-fluid-units.json`; it selects only the five source-confirmed item IDs, exact descriptions, original fluid-ounce quantities and worksheet-cell provenance.

Preview with a freshly exported packing snapshot containing `PackList`, `PackListItem`, and `Event` arrays:

```powershell
bun scripts/repair-tpp-packing-units.ts --source codex-plans/source-backed-operations/recipes/ashley-packing-fluid-units.json --snapshot <packing-snapshot.json> --out .artifacts/tpp-packing-unit-repair
```

The preview writes plan.json and plan.sha256 with source/snapshot hashes, exact versions, quantities before/after, and preserved status/history/relationship facts. Preview is offline and performs no writes. A changed original quantity/description or template relationship needs a refreshed source review rather than guessing. Already-corrected rows preserve their current quantities and preview as no-ops.

After the repository-authorized release makes the existing repair seam available on the target deployment, apply the same inputs with `--apply --expected-plan-sha256 <reviewed-hash> --url <explicit-Convex-URL> --tenant <matching-tenant>`. Authentication uses the existing agent session; credentials are not command arguments. The server applies the selected list atomically and checks versions and historical state. The CLI records mutation acknowledgement before readback, saves actual rows, and verifies quantities, correction provenance and preserved facts. A lost readback is not a claim that no write happened; inspect receipt.json and safely replay the exact plan.

Current saved-snapshot preview hash: 8642dad9d4623636087daf7ad349be92899e32818807d0cec42119c6c480c7d4. This is not current production approval: refresh the snapshot and preview before application. No production repair has been applied.

Qualification: actual CLI subprocess checks all five conversions, source/identity/unit/template/tenant/invalid-quantity rejection, incorrect apply hash before authentication, and corrected-snapshot no-op preview. Existing generated-command qualification independently passed conversion of required/packed volume, preserved physical facts, no-write replay, stale/duplicate/history/auth protection and future import paths. Authenticated CLI application/readback remains unverified until release and controlled live repair.
