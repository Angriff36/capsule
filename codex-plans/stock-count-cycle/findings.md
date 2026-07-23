# Stock Count Cycle Findings

## Requirements
- Start a count session covering one or more storage locations.
- Freeze expected quantities for the session.
- Walk staff through counting each included item.
- Reconcile actual counts against the frozen system quantities.
- Post inventory adjustment entries for variances.
- Close the count session.
- Verify the core flow with a temporary Playwright spec, then delete the spec.
- Preserve unrelated dirty work and obey generated-file ownership.

## Initial Repository State
- Branch: `main`.
- The checkout contains extensive pre-existing modified and untracked work across generated, authored, documentation, and feature files.
- `npx` is available at `C:\Program Files\nodejs\npx.ps1` for the required Playwright workflow.

## Research Findings
- The governed inventory foundation already has `StorageLocation` and one `InventoryItem` per tenant + ingredient + location.
- `InventoryItem.adjustQuantity(delta, reason)` posts an authenticated `InventoryQuantityAdjusted` event with before/after quantity, delta, unit, location, ingredient, actor, and reason. `InventoryItem.recount(actualQuantity)` changes the balance but its event has no reason, so count reconciliation should use `adjustQuantity` for explicit adjustment-ledger provenance.
- The existing inventory UI routes are `/inventory/demand`, `/inventory/stock`, `/inventory/audit`, `/inventory/traceability`, and `/inventory/purchasing`; `InventoryWorkspaceNav` owns the local tabs and `src/app/App.tsx` owns lazy routes.
- `docs/systems/inventory.md` requires visible provenance for every adjustment and describes the current routes/commands as implementation truth.
- Binding gating guidance says routine operational work should stay available to inventory staff and guards must protect real harm. A count session should not require a new specialty role or freeze ordinary inventory operations.
- Relevant authored files were modified earlier today in the shared checkout, so overlap must be checked immediately before edits.
- Generated reactions directly `await` target command runners inside the same Convex mutation transaction. A line reconciliation event can therefore call `InventoryItem.adjustQuantity` atomically; a failed adjustment aborts the line state change too.
- Generated `createVia` mutations return `{ docId }`, so the UI can create a session and then create its frozen line records against that session.
- Existing parent/child creation flows (for example PrepTask + dependencies) intentionally create the parent first, then child records using the returned `docId`.
- Relevant file hashes remained stable across a two-second overlap check; there was no observed active rewrite during discovery.
- The UI design direction is an industrial count sheet: high-contrast progress rail, location scopes, one large count input at a time, visible frozen-versus-counted variance, and a compact session ledger. It reuses the repo's Archivo/display and IBM Plex Mono tokens rather than introducing new fonts or a disconnected visual system.

## Technical Decisions
| Decision | Rationale |
|---|---|
| No permanent tests | Repository instructions prohibit adding/expanding tests unless requested; the user specifically requested a temporary verification test only. |
| Reconcile through `InventoryItem.adjustQuantity` | It provides the required reasoned, actor-attributed adjustment ledger rather than a reasonless recount event. |
| Add `StockCountSession` and `StockCountLine` in a new authored Manifest module | Durable source-first state is required for frozen expectations, resumable counts, reconciliation, and closeout; generated files remain Builder-owned. |
| Snapshot expected quantity inside `StockCountLine.freeze` | Reading `self.inventoryItem.quantityOnHand` in the governed command freezes the server-side ledger value at line creation rather than trusting a client-supplied expected number. |
| Separate match confirmation from variance reconciliation | Exact matches close without a zero-delta ledger entry; only true variances emit the event that posts an adjustment. |
| Let inventory staff start, count, reconcile, and close sessions | This is routine operational work; adding management-only gates would create user tedium without proportionate harm. |
| Store selected location IDs and names on the session | The count scope remains visible even for an empty location, while line records remain normalized by inventory item. |

## Issues Encountered
| Issue | Resolution |
|---|---|
| Large dirty shared checkout | Work in narrowly named files and inspect overlap before editing. |
| A second live agent wrote the stock-count Manifest and Builder ledger while this session was inspecting the checkout | Paused all implementation edits and confirmed the feature-specific files were stable for 20 seconds before continuing with read-only review. |
| PowerShell rejected `rg ... src/inventory/*.manifest` | Use explicit paths or `--glob '*.manifest'`; do not repeat the invalid Windows wildcard path. |
| PowerShell parsed a double-quoted `rg` regex as syntax | Use single-quoted regex strings for embedded quote/wildcard patterns. |
| A compute local used by `StockCountLine.freeze` became `__draft.frozenQuantity` in generated createVia output | Use the relationship expression directly in Manifest; do not patch Builder-owned output. |

## Resources
- `AGENTS.md`
- `.aboardai/context/codex-implementation.md`
- `.aboardai/context/computer-use.md`
- `.aboardai/context/review-changes.md`
- `.aboardai/context/SKILL.md`

## Visual/Browser Findings
- The isolated Playwright screenshot shows the completed count sheet clearly: the session is closed, the scoped Walk-in cooler is visible, the Roma tomatoes line preserves the frozen 10 kg expectation beside the counted 8 kg result, and the line is marked reconciled.
- The count workspace keeps its primary state, progress, line queue, and closeout record legible at the tested desktop viewport. The tightly packed global inventory tabs are a limitation of the temporary component harness, which did not load the full application-shell stylesheet; they were outside the stock-count acceptance flow.

## Implementation Audit
- The feature-specific Manifest module, generated Convex/schema/client bindings, `/inventory/counts` route, inventory navigation tab, documentation, and authored React/CSS workspace are already present in the shared checkout.
- The UI creates a governed session, freezes one line per scoped `InventoryItem`, supports recovery from partial line creation, records/revises counts, reconciles against the live ledger, and closes only when every frozen line is reconciled.
- Feature verification is complete: generation ownership, typecheck, build, focused formatting, the full disposable Playwright flow, visual inspection, and temporary-file cleanup all passed. Only unrelated shared-checkout gate failures remain.
