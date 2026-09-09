# Source-backed catering workflow

## Goal and authority

Fulfill the complete request in attachment `6b4eed7c-f119-448b-b84b-b99ee7cb5560/pasted-text-1.txt`: study all relevant event, recipe, report and training sources; repair the connected application and existing affected live data; verify desktop/mobile, calculations, repeatability, preserved work, reports, review, gates, authorized release and deployed behavior. An audit or partial fix is not completion.

Authoritative training: `work/training docs/Ops-training/Mangia_Ops_Final_Lock_Training.pdf`. Prep presentation: `work/training docs/Prep/menu-with-prep.pdf`. Migration source: `.artifacts/tpp-migration-20260905/tpp_migration`.

## Phases

1. In progress: inventory and visually study source pages/photos; build requirements with source/page evidence and worked examples.
2. In progress: trace current runtime, classification, links and live data against every requirement. Prior audits are leads only.
3. In progress: implement connected domain/UI/report repairs and repeatable data repair with preview and before/after evidence; preserve edits, assignments, completed work and history. First bounded correction preserves prep instructions during serving refresh; full connected repair remains required.
4. Pending: verify real examples including guest count, individual servings, substitutions, removals, recipe relationship changes, no duplicate tasks or ingredient double counting, recipe links, desktop/mobile and printed outputs.
5. Pending: required checks, independent cross-model approval, branch push/release through repository process, deployed application and live-data verification.

## Constraints

- Do not invent recipes, yields, quantities, cooking times, operational policies or missing-data conclusions.
- Dishes are finished dishes; components are actual subrecipes; prep tasks are work instructions.
- Preserve provenance internally while showing usable kitchen information.
- Do not add tests beyond owner-authorized acceptance requirements. Existing gates and actual-runtime verification remain required.
- Follow DESIGN.md before UI changes and Manifest regeneration ownership rules before domain changes.
- No manual deploy or external communications unless authorized; repository release and blocker-issue instructions apply.

## Current state

Started 2026-09-09 from clean main at `41363479`, then created `fix/source-backed-catering-workflow`. Actual checkout was not the Ralph branch described in AGENTS.md. All 52 specified PDF pages and all source photo contact sheets reviewed; training transcript read in full. Fresh authenticated production snapshot acquired without mutations. Local reproduction proves imported prep duplication after a template is restored without linking old rows; issue #310 records it. One authored instruction-preservation correction is implemented and focused checks pass; no live writes or release yet.

## Resume next

Quantity checkpoint is committed on `fix/source-backed-catering-workflow` (`ea79c6b6`, followed by Builder baseline commit `25d7885d`). Branch push passed regeneration guard; this is not a release. Continue existing-data/source recipe reconstruction next, using the exact workbook cells in runtime-gaps.md. Full goal unchanged. Scratch reproduction and logs live in `.artifacts/operations-source-study/`; no production writes occurred. Intermediate unused Builder baseline cache files remain untracked and should not be confused with user edits. Referenced current baselines were committed.

Continue from `source-review.md` and `runtime-gaps.md`. Original migration workbooks now have cell-addressed read-only extraction under `.artifacts/operations-source-study/workbooks/` (90 files, zero extraction errors). Crucially, Menu_Item_Cost_per_Event provides Ashley ingredient/subrecipe quantities missing from recipes.json, and Heating_and_Serving_Event_Menu supplies methods. Reconstruct source-proven relationships using those sources plus photographed batch recipes; investigate conflicting units before applying repair. Do not repeat completed visual review. Report PDFs outside the seven required PDFs and remaining workbook-specific coverage still need relevant inspection. DESIGN.md has now been read in full; owning culinary/production docs partially read and Galley references still need inspection before UI work. Its front matter is authoritative over stale body palette/type/radius prose per AGENTS.md. One authored synchronizer edit is uncommitted; focused checks pass, full completion gates not run.
