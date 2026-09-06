# Honest, resumable recipe review implementation plan

> For agentic workers: use superpowers:subagent-driven-development or superpowers:executing-plans to implement these tasks with review checkpoints. This document does not start implementation.

**Goal:** A kitchen user can correct an imported formula, save and reopen its review, finalize once, and inspect the original source from the resulting Component.

**Architecture:** Keep deterministic parsing in authored TypeScript, lifecycle rules in the existing ComponentImport manifests, and atomic business creation in the existing culinary operation seam. Connect the current import workbench to durable review records instead of replacing the kitchen UI. Preserve the legacy finalizer interface for agent callers.

**Tech Stack:** React, TypeScript, Convex, Manifest, Vitest; current repository pins remain unchanged.

**Spec:** [PR03](../../specs/ralph/production-03-recipe-truth.md), especially the flat-formula portions of PR03-01/03/08, with PR01 provenance and PR12/13 isolation/retry contracts. See [data evidence](data-audit.md). This is the first delivery, not completion of all PR03 criteria.

## Global constraints

- Unknown ingredient price or unmatched units are incomplete cost, not zero cost.
- No density, portion weight, or nutrition value is assumed to finish the import.
- Source values remain visible; user corrections do not replace original source text.
- Parsing/matching remain authored TypeScript; generated files change only through `bun run manifest:regen`.
- Preserve kitchen access, current valid imports, mixed fractions, existing atomic rollback/replay and incomplete-cost display. No new manager approval or provider dependency.
- Read AGENTS.md, DESIGN.md, docs/systems/culinary.md, the existing import design and Convex guidelines before execution. DESIGN front matter governs tokens; preserve the existing source/result workbench and mobile switch.
- Tests below are proposed acceptance coverage. Before adding them, bind this approved slice into the existing acceptance contract without renumbering historical AC IDs; follow the repository's test-authorization rule.
- Root for every relative implementation path below: `C:\projects\capsule-release-20260905`. These are implementation instructions, not files changed by this planning pass.

## Task 1: Represent unknown measurements honestly

**Modify:** `src/features/kitchen/import/ComponentImportTypes.ts`, `ComponentTextParser.ts`, `ComponentCsvParser.ts`, `UnitOfMeasureMapper.ts`, `ComponentImportCoordinator.ts`, `ComponentImportFinalizer.ts` in that same folder; existing parser/review controls consuming those types.

**Test:** `tests/component-text-parser.test.ts`; create `tests/component-import-review-readiness.test.ts` under the acceptance contract.

**Interfaces:** Add `UnitOfMeasureMapper.resolve(raw: string): UnitOfMeasure | null`; retain `map` for compatibility outside import. Parsed/review quantity and yield fields become `number | null`, units become `UnitOfMeasure | null`. Preserve raw tokens and line text. Add `reviewMeasurementIssues(review): { lineIndex: number | null; field: "quantity" | "unit" | "yieldQuantity" | "yieldUnit"; message: string }[]`. The finalizer narrows these to its existing required-number projection only after validation.

- [ ] Add regression assertions for missing yield, unknown units, known mixed fractions and existing CSV error handling. Example core assertions:

```ts
const mapper = new UnitOfMeasureMapper();
expect(mapper.resolve("mystery-pack")).toBeNull();
expect(mapper.resolve("fl oz")).toBeNull(); // no supported volume-oz unit yet
expect(mapper.resolve("kg")).toBe("kilogram");
```

- [ ] Run `bun run test -- tests/component-text-parser.test.ts tests/component-import-review-readiness.test.ts`; expect failure on the missing strict resolver and formerly guessed values.
- [ ] Implement strict alias lookup without a fallback. For unrecognized source measurements, keep null plus raw text. Do not infer one portion, one each, mass from volume, or purchased ingredients from instruction sentences. Preserve valid fractional parsing.

```ts
// Strict import resolution: unknown is a review issue, not a fallback unit.
resolve(raw: string): UnitOfMeasure | null {
  const normalized = raw.trim().toLowerCase();
  return normalized === "" ? null : (UNIT_ALIASES[normalized] ?? null);
}
```

`UNIT_ALIASES` here names the extracted, audited strict alias dictionary: copy only existing aliases whose dimensions are known. Leave the legacy map's permissive aliases isolated for compatibility. Audit actual enum spellings before updating fixture expectations; do not introduce a new unit enum solely for this task.

- [ ] Make readiness combine matching and measurement issues. Keep saving/reading incomplete review possible; only finalizing the affected incomplete formula requires correction. Show field-specific text and link focus to the first issue.
- [ ] Rerun both files plus `bun run typecheck`; expect passing old valid-import cases and new unknown-state cases. Commit the parser/type/control changes together as `fix: preserve unknown recipe measurements for review`.

## Task 2: Make durable review commands executable

**Modify:** `src/culinary/component-import.manifest`; regenerate owned output. Create acceptance test `tests/proofs/component-import-review.runtime.test.ts`.

**Interfaces:** Retain existing ComponentImport/ComponentImportLine identity and lifecycle. Add commands `reviseReview` (reviewed header fields) and `reviseMeasurements` (reviewed quantity/unit/preparation note), legal on editable reviews and preserving source text. Add a monotonic `reviewRevision` to the parent and require the revision on review saves/finalization. Changes to resolved measurements invalidate readiness until rechecked, not original provenance.

- [ ] Build a tenant kitchen-user fixture using the existing runtime proof harness. Assert the complete generated lifecycle, not only helper output:

```text
upload -> recordParse -> beginReview
stage line -> confirmExisting(existing tenant ingredient)
stage line -> confirmNew -> attachCreatedIngredient(new tenant ingredient)
recordResolutionProgress -> approveReview -> beginFinalization
recordComponent(new tenant component) -> complete
```

Assert stored target IDs, completed status and unchanged original source. A second tenant's IDs and a stale review revision must fail without writes. Run `bun run test -- tests/proofs/component-import-review.runtime.test.ts`; expect the current old-FK guards to reject valid new relationships.
- [ ] Repair `recordComponent`, `confirmExisting` and `attachCreatedIngredient` command shapes in the manifest. Their guards currently dereference the old stored foreign key before assigning the supplied one. Validate supplied targets through supported parameter relations; preserve tenant/deleted-state checks. Check the confirmed-new line constraint against the linked-ingredient transition. If the pinned compiler cannot express this, report the concrete compiler blocker; do not bypass it by editing generated mutations.
- [ ] Add the two narrowly scoped correction commands and revision check. Keep completed/cancelled imports immutable and allow recoverable failed/finalizing review states through their existing resume commands. Read domain-gating restraint before touching guards.
- [ ] Run `bun run manifest:regen`, the focused runtime test and `bun run typecheck`. Expected: full lifecycle passes, cross-tenant/stale revision attempts leave no change, ownership ledger matches. Commit authored and generated output together as `fix: make component import review lifecycle executable`.

## Task 3: Persist the review and finalize it atomically

**Modify:** `convex/lib/culinaryOperations.ts` (already exports the authored mutation), `src/features/kitchen/import/ComponentImportFinalizer.ts`. Create focused authored persistence adapter `src/features/kitchen/import/ComponentImportRepository.ts`. Extend the acceptance-bound runtime proofs in `tests/proofs/safe-culinary-operations.runtime.test.ts`.

**Interfaces:** Repository exposes `create(review, source): Promise<{ importId: string; reviewRevision: number }>`, `load(importId): Promise<ComponentImportReviewState>`, and `save(review, expectedRevision): Promise<{ reviewRevision: number }>`. Source is `{ kind, filename?, rawText, csvSheetText?, csvLinesText? }`; CSV inputs remain separately recoverable, not ambiguous concatenation. Implementation uses tenant-authorized governed commands in a transaction; no client loop of partially successful row writes. Add optional `{ importId, expectedRevision }` to the existing atomic import projection's outer request, keeping legacy callers valid.

- [ ] Add failure/retry assertions to the existing atomic seam fixture:

```text
save revision 1; load -> identical source, reviewed values and line decisions
save expected revision 0 -> conflict and no changed records
finalize(operation A, revision 1) -> one Component, BOM and completed import
retry(operation A, revision 1) -> same Component/result receipt
reuse operation A with changed payload -> conflict, not false saved success
inject failure before completion -> no partial Component/Ingredient/BOM graph
```

- [ ] Run `bun run test -- tests/proofs/safe-culinary-operations.runtime.test.ts tests/proofs/component-import-finalize.runtime.test.ts`; the new durable assertions must fail before implementation.
- [ ] Persist reviewed header and lines with revision validation and existing command semantics. Extend finalization inside the existing transaction to attach created ingredients, record resulting component, and complete the same import. Reuse materialization receipts; do not add a second independent idempotency store.

```text
authorize tenant -> resolve operation receipt -> validate review revision
load reviewed source graph -> validate all lines -> create business graph
link each result -> complete import -> record receipt -> return component ID
```

- [ ] Treat `SourceFingerprint.digest` as a display/dedup candidate, not security or unique identity: its current normalized 32-bit hash can collide. Reuse stable import ID/revision and operation key for writes; a matching name/hash alone never merges formulas.
- [ ] Run both runtime suites and typecheck; expect legacy finalizer behavior preserved, durable completion/replay proven, foreign-tenant import or ingredient denied before writes. Commit as `feat: persist and finalize recipe reviews atomically`.

## Task 4: Resume from the workbench and inspect original source

**Modify:** `src/features/kitchen/import/ComponentImportPage.tsx`, `src/features/kitchen/ComponentDetailPage.tsx`, and `docs/systems/culinary.md`. Create `src/features/kitchen/import/ComponentImportSourcePanel.tsx` for read-only source display.

**Interfaces:** Keep `/kitchen/components/import`; use `?importId=<id>` for reopenable review identity. The repository from Task 3 owns persistence; the page owns field editing/focus and save feedback. Component detail resolves its tenant-readable completed import; absence of provenance on older native Components is not an error.

- [ ] Record browser acceptance cases before implementation: paste text, correct an unknown unit/yield, save, close/reopen URL, verify corrections and raw source, finalize, then reopen source from Component detail. Repeat with CSV pair and a new ingredient; verify missing price stays incomplete coverage.
- [ ] Connect the existing review pane to durable create/load/save. Offer a compact resumable-import list on the existing import route. Show Saving/Saved/Save failed truthfully; a save error retains entered values and provides retry. On revision conflict preserve local edits and offer reload/review rather than overwriting someone else's saved draft.

```text
no importId -> source entry + resumable review list
importId loading -> accessible loading state
loaded editable review -> source/result editor + save + finalize
completed review -> link to resulting Component + original source
denied/missing -> plain explanation, no source leakage
```

- [ ] Keep existing mobile source/result switching, live announcements and first-error focus. Never add a new palette or blanket approval gate. Source panel displays original text, filename and import identity independently from corrected measurements; render source as text, never HTML.
- [ ] Verify desktop and 360px mobile, keyboard-only correction/save, denied access, empty list, failed save, stale revision, browser reload and lost finalization acknowledgement. Inspect the real route in a local backend fixture; mocked parser tests alone do not pass this task.
- [ ] Run all acceptance-bound focused tests, `bun run typecheck`, format, regeneration/ownership check where applicable and `bun run check` in the local non-Vercel environment. No production build environment or deploy command is part of this plan. Update docs with actual evidence and remaining limitations. Commit as `feat: resume recipe imports and show source provenance`.

## Exit and follow-on coverage

The first delivery passes only when the ordinary UI resumes an edited review, finalizes exactly once, and exposes unchanged source on the resulting Component. Missing price remains incomplete cost. This improves parts of PR03-01/03/08 and PR01 provenance; it does not mark whole compound criteria PASS.

Nested formulas/cycle handling, scaled-equivalent source identity, purchase-pack conversions, historical formula/cost versions, allergen/nutrition evidence, and event-demand scaling still require the next culinary delivery in [the sequence](delivery-sequence.md). All other PR01–14 work remains explicitly recorded in the criterion ledgers. Merge/deployment is a separate guarded release after review, not a consequence of saving this plan.
