# Resolved issues

## 2026-10-04 — contribution provenance was not persisted

- Added a Manifest-owned `calculationSnapshot` to each
  `EventIngredientContribution`, including the legacy component formula and
  the revision-two demand engine's source inputs.
- Added a supersession ledger event and stored supersession reason so the
  demand ledger can distinguish retired calculation sources.
- Verified with `bun run manifest:regen`, documented Convex codegen, and the
  focused culinary acceptance and component-to-demand runtime proofs.
