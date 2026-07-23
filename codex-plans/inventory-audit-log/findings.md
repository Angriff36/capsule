# Inventory Audit Log - Findings

## Initial state

- Branch: `main`; starting HEAD: `a421dc5`.
- The worktree has extensive pre-existing modified and untracked files, including `src/inventory/stock.manifest`, `src/inventory/transfer.manifest`, `src/features/inventory/StockBookPage.tsx`, generated Convex/Manifest outputs, and repository docs.
- Every pre-existing change is treated as user-owned. No cleanup, stashing, or reversion is authorized.
- Repository rules prohibit hand-editing generated Convex/Manifest/client wiring outputs and require `bun run manifest:regen` for generation.
- Permanent test additions are prohibited unless requested. The feature request explicitly requires a temporary Playwright verification test that must be deleted after the run.

## Memory relevance

- Prior Capsule memory emphasizes re-checking the exact checkout, respecting broad regenerated deltas, preserving dirty work, and tracing actual Manifest/generated/runtime seams before editing.

## Architecture findings

- `InventoryItem` is governed in `src/inventory/stock.manifest` and already emits domain events with `previousQuantity` and `quantityOnHand` for open, receive, adjust, recount, transfer in/out, and removal.
- `InventoryReservation` emits reserve/release/consume events, but reservation changes affect availability rather than `InventoryItem.quantityOnHand`; its payload currently carries reservation quantity and item ID, not stock before/after.
- The stock UI entry is `src/features/inventory/StockBookPage.tsx` at `/inventory/stock`; the existing page and Manifest are both already modified in the dirty tree.
- A newly added `src/inventory/transfer.manifest` and generated transfer diagram indicate an overlapping transfer feature is present in this checkout and must be composed with, not replaced.
- Domain gating guidance permits safety-critical use-by issuance blocking but cautions against adding low-value approval/policy friction. This audit feature should be observational and append-only, not introduce new user approval steps.
- Initial broad search hit a Windows glob error for `playwright.config.*`; future config discovery should use `rg --files` followed by exact paths instead of shell wildcard syntax.
- The existing stock-book dirty diff already contains concurrent expiry, PAR/reorder, and transfer work. Any UI change must be surgical and avoid refactoring this page.
- A previous same-day global audit-log investigation proved that Capsule's generated Convex mutations have no supported transactional mutation-wrapper/audit hook, and that `manifestEvents` rows lack actor identity and are not emitted for every generic mutation. That blocks a truthful global audit log, but this narrower feature may still be implementable by enriching the specific inventory events and materializing a dedicated inventory ledger.
- The prior global audit investigation filed `Angriff36/capsule#43` for the missing projection-wide audit hook. This feature should not claim that global blocker is solved.
- Capsule's current thin authored wiring pattern is routes/UI over generated hooks plus narrow authored Convex seams; public system docs are expected to describe shipped capability from real routes and commands.
- Manifest command bodies can reference `user.id` in emitted payloads; existing authored examples do so. Actor identity can therefore be added to the specific inventory events without a projection-wide wrapper.
- Generated inventory mutations persist emitted events in `manifestEvents` with event type, entity, entity ID, payload, and timestamp. Inventory quantity adjustment, opening, receiving, reservation, transfer, and waste events are already observable there.
- Waste currently invokes `InventoryItem.adjustQuantity` through a generated reaction with reason `Waste`, so the resulting `InventoryQuantityAdjusted` event is the canonical before/after stock change for that workflow.
- The generated transfer command emits `StockTransferRecorded`; the exact inventory debit/credit reactions and event coverage still need targeted inspection.
- One generated-code search regex was malformed by PowerShell parsing; further searches will use simpler literals and exact line windows.
- `InventoryItem` quantity-changing commands are open, receive, adjust, recount, transfer out, and transfer in; their events already carry before/after stock. Actor identity is the principal missing field.
- Reservations change available quantity but not on-hand quantity. Their audit presentation therefore needs to distinguish `available` before/after from `on hand` before/after instead of implying stock was physically issued.
- The checkout's waste flow ultimately emits `InventoryQuantityAdjusted` with reason `Waste`; this avoids duplicating a second stock-debit entry from `WasteRecorded`.
- Exact transfer reaction behavior and custom-query exposure still need bounded line reads because broad generated-query searches are too noisy.
- `StockTransfer.record` is the single durable transfer command and reacts in-transaction into `InventoryItem.transferOut` and `transferIn`; the two resulting InventoryItem events are the authoritative per-item before/after ledger entries.
- `InventoryReservation.consume` reacts into `InventoryItem.adjustQuantity` with reason `Reservation consumed`, so one workflow produces a reservation-state entry plus the physical on-hand issue entry.
- `manifestEvents` has indexes by type, entity, and entity ID. A custom authored query can efficiently read direct InventoryItem events by entity ID; reservation events require three type-index reads and payload filtering because no inventory-item payload index exists.
- Custom top-level Convex modules are an established authored seam in this checkout and can import `getAuthContext`; UI imports their generated API through the single `src/lib/api.ts` export.
- A dedicated query plus a client-side deterministic SHA-256 chain can make the append-only inventory event history tamper-evident without hand-editing generated schema/mutations. The displayed root digest will change if a historical row is changed, removed, inserted, or reordered; the UI must describe this precisely rather than claiming a database signature.
- Capsule Manifest policies require capability checks rather than handwritten role lists. The custom audit read should therefore authorize by invoking the generated `listInventoryItem` query from a public Convex action, then delegate the raw event scan to an internal query; this reuses the generated `inventoryAccess` policy instead of duplicating roles in app code.
- A dedicated `/inventory/audit` workspace page is lower-conflict than expanding the already heavily edited stock-book page. It can show a chronological all-item ledger with an item filter, actor IDs, before/after values, reasons, and chain digests.
- The UI will label measures explicitly (`on hand` versus `reserved`) so reservation lifecycle changes are not presented as physical stock movement.
- At 09:51-09:52 local time, another session wrote `StockReceiptScanner.tsx`, `StockBookPage.tsx`, `convex/_generated/api.d.ts`, and `codex-plans/inventory-barcode-scan/*`; additional feature sessions continued updating plans during two monitoring windows. This is active shared-worktree activity, not historical dirty state.
