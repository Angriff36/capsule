# Inventory Audit Log - Task Plan

## Goal

Implement a chronological, tamper-evident history of every InventoryItem quantity change, including actor, timestamp, reason/type, and before/after quantity, following Capsule's authored/generated boundaries.

## Constraints

- Preserve all pre-existing dirty and untracked work.
- Do not hand-edit generated Manifest/Convex/client wiring paths.
- Do not add permanent tests unless the owner asks; use the requested temporary Playwright verification and remove it afterward.
- Use `bun` commands and `bun run manifest:regen` as the only regeneration entry.
- Read domain gating restraint before changing Manifest policies or guards.
- Run the focused verification and `bun run check` before completion.

## Phases

1. **Explore and establish ownership** - complete
   - Inspect inventory Manifest, existing inventory UI, routes, generated query/mutation shape, styles, and relevant docs.
   - Determine whether current dirty changes overlap and whether the work can proceed safely.
2. **Design the smallest end-to-end seam** - complete
   - Define persisted audit representation, tamper-evidence mechanism, query path, and UI placement.
   - Confirm generated/authored boundaries and regeneration requirements.
3. **Implement** - in progress
   - Change authored Manifest/UI/seams only, preserving unrelated work.
   - Regenerate only through `bun run manifest:regen` if domain changes require it.
4. **Verify** - pending
   - Run focused static/runtime checks.
   - Create, run, and delete a temporary Playwright test for the core flow.
   - Run `bun run check`.
5. **Close out** - pending
   - Review the final diff for scope and unrelated changes.
   - Archive the completed plan and provide the required `<summary>` block.

## Decisions

- Use an isolated feature plan directory because the shared checkout already contains several concurrent feature plans.
- Add `actorId: user.id` only to inventory item and reservation events that represent quantity state; waste and issues already converge through `InventoryQuantityAdjusted`.
- Read raw events through an authored `inventoryAudit` Convex action. The action first invokes generated `getInventoryItem` for authorization and item ownership, then calls an internal event query.
- Present one selected InventoryItem at a time on `/inventory/audit`, with a chronological event table and explicit `on hand` versus `reserved` measures.
- Compute an ordered SHA-256 chain in the browser from normalized immutable event facts. Display the current root and row digests with precise copy: the root changes if history changes, and can be recorded for later comparison.
- Use an industrial/utilitarian ledger aesthetic inside Capsule's existing Archivo + IBM Plex Mono palette: dense evidence table, strong item selector, integrity rail, and restrained status accents.

## Errors Encountered

| Error | Attempt | Resolution |
| --- | --- | --- |
| `rg` could not expand `playwright.config.*` on Windows | 1 | Use `rg --files` to discover exact config filenames before reading/searching them. |
| First findings update used a nonexistent `## Decisions` anchor | 1 | Re-read the isolated planning files and applied the update against exact current content. |
| Generated-code `rg` pattern had an unclosed group after PowerShell parsing | 1 | Use simple literal searches and line-window reads instead of compound escaped regexes. |
| PowerShell passed `convex/*.ts` globs literally to `rg` | 1 | Discover or enumerate exact files; avoid Windows wildcard arguments for `rg`. |
| Second findings update included a duplicate/nonexistent trailing anchor | 1 | Apply focused insertions against one exact existing line and log the failure. |
| Another session actively edited overlapping inventory/generated files during implementation | 1 | Stopped before `bun run manifest:regen` and verification, preserving both sessions' changes as required by Capsule's shared-worktree rule. |
