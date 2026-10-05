# Findings

## Initial discovery
- Existing generic planning files concern a separate staffing feature, so this feature has its own planning directory.
- Sales domain sources live under `src/sales`; proposal revision seams are in `convex/lib/proposalRevision.ts`, related proposal helpers, and runtime proofs under `tests/proofs/`.
- Culinary demand is exposed from `convex/culinaryDemand.ts` and the model under `convex/lib/culinaryModel/`.
- UI work must follow `DESIGN.md` and reuse the component catalog before creating a new component.

## Sales model and UI
- `ProposalDishSelection` is already the approved menu-flow target: it is tenant-scoped, catalog-backed through published `Menu` + active `Dish`, and only editable while the proposal is draft/sent/viewed.
- `ProposalMenuSelectionPanel` already renders published catalog dishes and creates generated dish-selection rows. A tasting application seam should use this same entity/command instead of inventing proposal menu storage or priced proposal lines.
- `ProposalRevision` is immutable captured history, so an approved tasting must write only a mutable proposal and never a revision. Proposal draft status is the writable boundary.
