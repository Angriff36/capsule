# Restore TPP recipes onto dishes

The historical TPP import created whole recipes as draft Components. Those recipes belong on the existing Dishes. `scripts/repair-tpp-recipes.ts` previews a source-backed repair and applies each recipe atomically through `repairImportedDishRecipe`.

The repair preserves customer descriptions, dish IDs, event references, and existing prep work. Original recipe text, methods, yields, and nested subrecipes are saved in dedicated dish recipe fields. Quantified ingredients and prep templates are restored from the export. Actual made subrecipes use Components; the misplaced whole-recipe drafts are retired only after their source has been copied successfully. Existing Manifest reactions update purchasing demand for events already using a repaired dish.

Source exports that describe a physical batch without a serving yield retain their quantities as recipe text. They do not become invented per-guest ingredient amounts. Empty source recipes retain provenance without invented ingredients or instructions.

## Run

1. Read the source recipe JSON and a fresh authenticated catalog snapshot. Keep both under ignored `.artifacts/`; they contain private business data.
2. Run `bun scripts/repair-tpp-recipes.ts --source <recipes.json> --snapshot <catalog.json> --out <directory>`.
3. Review `plan.json` and record `plan.sha256`. Verify the target dish IDs, versions, source draft IDs, quantities, and notes.
4. Apply the same source and snapshot with `--apply --expected-plan-sha256 <sha256> --url <Convex URL> --tenant <tenant ID>`.
5. Inspect `receipt.json` and query the repaired dishes, prep, ingredients, components, and existing-event demand. Repeat the same command to resume an interrupted run; successful operations replay their durable receipt.

For a later prep-coverage correction, `--prep-only` uses a separate operation key and restores task templates without reattaching components or ingredient lines. Preview and apply must both use that flag and the same fresh snapshot.

The backend checks tenant ownership, source identity/text, and expected dish versions. It refuses conflicting ingredient/task quantities and ambiguous ingredient records. Never replace the reviewed snapshot during a partial run: reconcile any newly edited records before preparing another operation.

## September 2026 qualification

The export contains 217 distinct recipe entries matching 222 existing dish records, including five duplicate service variants. 143 whole-recipe drafts were misplaced. The complete projection contains 921 prep templates, 373 direct ingredient lines, and 56 subrecipe instances before formula deduplication and duplicate-dish expansion.

A source-line audit expanded prep recognition to all named source subrecipes and the exported action verbs, including temper, soak, steam, bread, and julienne. Remaining non-task lines are raw ingredients or supply SKUs.

Local qualification processed all 217 recipes and replayed every operation without duplication. An existing-dish fixture preserved its description and portioning, rejected a stale version, retired the source draft, and produced eight prep tasks plus two ingredient contributions/demands at 167 servings. Desktop and mobile browser verification covered the dish recipe section. These are qualification results, not a production completion receipt.

Package names use curated house aliases, including the existing ten-inch pizza recipes. Exact-name duplicate service variants prefer a restored recipe, then matching service style, then the oldest record. The live catalog's duplicate groups were audited before applying this repair; the resolver does not merge or delete them.

Tracking: [issue 304](https://github.com/Angriff36/capsule/issues/304).
