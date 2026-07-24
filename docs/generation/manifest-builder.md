# Manifest Builder boundary

Canonical description of how this repository is produced. Assembly receipt: [`PRESET.md`](../../PRESET.md). Verification dump: `ASSEMBLY_REPORT.json`.

Essential commands: [commands.md](../commands.md). Full reference: [operations/commands.md](../operations/commands.md). Command idempotency: [command-idempotency.md](./command-idempotency.md).

## Model

CapsuleX is **assembled**, not hand-grown end-to-end:

**Manifest IR → Builder `convex-application` preset → this repo.**

Current preset: `convex-application` **v1.3.5** (`package.json` → `manifestPreset`, status complete in `PRESET.md`).

## Authoritative generators

| Tool                                                | Produces                                                                                                                                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manifest / `@angriff36/manifest` + Builder assemble | Convex surfaces, Zod companion (`schemas/**`), wiring, seed script, client wiring, contract tests (mermaid diagrams opted out via `skipDocsDiagrams` in `manifest.config.yaml`) |
| Convex codegen (`bun run codegen`)                  | `convex/_generated/**`                                                                                                                                                          |

## Generated — do not hand-edit

- `convex/schema.ts` (**DB schema**), `convex/queries.ts`, `convex/mutations.ts`
- `convex/http.ts`, `convex/crons.ts`, `convex/sagas.ts`, `convex/computed.ts`
- `convex/_generated/**`
- `schemas/**` (**Zod companions**, not Convex — see [boundaries.md](../architecture/boundaries.md)), `wiring/**`
- `src/generated/**`, `src/lib/manifest-convex-react.ts`
- `scripts/seed-convex.ts`
- Generated contract tests (e.g. `tests/manifest-convex.contract.test.ts`) — CI smoke that named mutations/queries export; not domain proofs
- `diagrams/` mermaid companions from the docs-diagrams pack — owned regen noise today; not author docs

**Synced-validation (preset ≥ 1.3.5):** Builder emits only `zod.schemas` → `schemas/manifest-schemas.ts`, passes `zodParamsImport: true` into `convex.react`, and adds a `zod` dependency. Hooks call `ParamsSchema.parse` before mutations. Requires a Manifest release that implements `zodParamsImport` + assembly checks `synced-validation.bundle` / `synced-validation.react-wired`.

## Author seams — safe to edit

- `src/app/**`, `src/features/**`, `src/ui/**`
- `convex/lib/**` (especially `authContext.ts`)
- `convex/auth.config.ts`, `convex/authStatus.ts`
- Thin adapters such as `src/lib/api.ts`

Generated Convex surfaces import `getAuthContext` from `./lib/authContext`. That module is fail-closed; customize identity → Capsule role mapping there only (prefer linked `Person.role`; IdP org-role claims are bootstrap fallback — see `docs/systems/auth.md`). Org capability kill-switches load as `disabledCapabilities` on the same auth object; `bun run manifest:regen` re-applies `scripts/apply-org-capability-check-role.ts` so generated `checkRole` honors those flags (and passes the auth object, not only `user.role`). That post-pass refreshes ownership digests for `convex/mutations.ts` / `convex/queries.ts` and **must preserve** `baselined: true` on those entries — stripping it makes `manifest-regen-check` treat the intentional patch as stale and blocks push.

## Flow

Capsule is a **live Manifest project**: editable `.manifest` sources and
`manifest.config.yaml` live in this repo. Builder regenerates owned artifacts
from those in-project files (no external `Manifest-source` IR after init).

1. Edit domain meaning in `src/**/*.manifest` and/or `manifest.config.yaml`.
2. `bun run manifest:regen` — syncs Capsule's exact `@angriff36/manifest` pin into the sibling Builder checkout (so projection code matches Capsule, no PAT), then Builder plans/applies when conflict-free and updates `.builder/ownership.json` in the same transaction. Preview only: `builder generate convex --dry-run`.
3. `bun run codegen` / `bun run dev:convex` as needed.
4. UI consumes APIs through generated hooks via `src/lib/api.ts`.

Recovery when ownership digests are stale (no file rewrites): `builder adopt ownership --apply`, then `bun run manifest:regen`.

### Pre-push “Circular dependency” mentioning `.loop-worktrees/…`

`bun scripts/manifest-regen-check.ts` (`.githooks/pre-push`) compiles every
`.manifest` under the Capsule tree via sibling Builder `ManifestSourceTree`.
Agent worktrees live in gitignored `.loop-worktrees/` and must **not** be
walked — otherwise duplicate graphs compile as one program and Manifest reports
a false circular dependency.

Builder owns the skip: `entry.name === '.loop-worktrees'` in
`../builder/src/lib/manifest-project/manifestSourceTree.ts` (`listFiles`).
If pre-push fails with paths under `.loop-worktrees/`, restore that skip in the
local Builder checkout (do not delete worktrees as the “fix”).

**Commit that skip in Builder — do not leave it dirty or stash it.** Capsule’s
regen/pre-push runs the sibling Builder working tree (`BUILDER_DIR`). An
uncommitted fix disappears the moment an agent bulk-stashes “unrelated Builder
WIP” for a clean Capsule `/commit`. Proven failure 2026-07-21: the skip existed
only as a dirty `M` on a tracked file, got stashed with pin/ownership WIP, and
blocked `git push` until re-committed as `d1c77d6`.

### Local Convex: “Could not find public function” after a schema reshape

Symptom: client calls a generated query (e.g. `queries:listDishRecipe`) that exists in
`convex/queries.ts`, but `bun run dev:convex` logs `Schema validation failed` and never
finishes the push. Root cause is almost always **stale local documents** that still have
removed fields (or lack newly required ones) — not a missing export.

Example (2026-07-19): Dish dropped direct `recipeId` for `DishRecipe` joins; local `dishes`
rows still carried `recipeId`, so every push failed and new queries never registered.

Fix local data (do not hand-edit generated schema long-term):

1. Inspect: `bunx convex data <table> --format jsonArray`
2. Export/transform/import cleaned rows (`bunx convex import --table … --replace -y …`),
   migrating values into join tables when needed.
3. Confirm push: `.artifacts/convex.stderr.log` shows `Convex functions ready!` with no
   following `Schema validation failed`.
4. Confirm registration: `bunx convex function-spec` lists the query identifier.

Chicken-and-egg (import rejected because the **deployed** schema still requires a removed
field): briefly push with `defineSchema(tables, { schemaValidation: false })`, import the
cleaned data, then restore default validation and push again. Prefer regenerating schema
afterward so the temp flag does not linger.

## Why generated files change (and where fixes belong)

Manifest projection emits runtime behavior into Builder-owned paths. Examples that **belong** in `convex/mutations.ts` — never hand-edited:

- `__resolveRelation` and relation hydration before guards/constraints
- Transition tables enforced before patch
- Atomic `createVia*` draft → checks → insert
- Event/reaction fan-out into governed downstream commands
- Command idempotency table + optional `idempotencyKey` (Manifest 3.6.21+)

Examples that **belong** in `src/lib/manifest-convex-react.ts`:

- `useCreate*` hook wiring to the inferred initialization command (`QualityCheck_createViaOpen`, etc.)

When `@angriff36/manifest` gains projection behavior, consuming that release means **regenerating** those files — not patching them. Workforce relation guards, createVia draft seeding, and QualityCheck hook selection are projection output, not feature UI.

**Correct workflow for any agent bumping Manifest:**

1. Edit `.manifest` sources if domain meaning changed.
2. Bump `@angriff36/manifest` pin in `package.json`.
3. `bun install`
4. `bun run manifest:regen`
5. Authored work only under `src/features/**`, `src/app/**`, `tests/proofs/**`, integration guard scripts

Do **not** use bare `manifest generate` / `manifest build`, `bun run manifest:build`, or `place-manifest-convex-react.ts`.
~~There is no npm script for them.~~
> **Correction (2026-07-22):** Builder's `convex-application` preset still emits
> `manifest:compile` / `manifest:build` into owned `package.json`. Those scripts
> are **unsafe** here — they bypass Builder ownership. Capsule regen is only
> `bun run manifest:regen`. `place-manifest-convex-react.ts` is deny-guarded;
> `manifest:build` is not yet wired through the same deny path.

Full safe/unsafe Manifest CLI inventory for Capsule:
[manifest-cli-safety.md](./manifest-cli-safety.md).

`bun run check` verifies owned files match the ownership ledger. Pre-commit rejects owned-file commits without an ownership update.

## Ownership drift — symptoms and recovery

Builder stores SHA-256 digests in `.builder/ownership.json`. Regen compares **recorded hash → disk → desired output**. Any mismatch blocks `--apply`.

Common failure modes (any agent, any session):

| Symptom                                                     | Typical cause                                                                                                                                                |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `owned-file-modified` on `convex/mutations.ts`              | Manifest bump + mutations committed without `--apply` refreshing ownership (e.g. consumed 3.6.20 output manually)                                            |
| `owned-file-modified` on `authContext.ts` / `encryption.ts` | Prettier/`lint-staged` reformatted Builder-owned seams (not in `.prettierignore`); or ledger updated without matching file; or seam customized without adopt |
| `owned-file-modified` on `manifest-convex-react.ts`         | Hand-edited hook target instead of fixing initialization command selection in `.manifest` + regen                                                            |
| `package.json` pin/script conflicts                         | `ownership.package` still records old Builder pins while app intentionally diverged                                                                          |
| `owned-file-missing` on `tsconfig.builder.json`             | File deleted locally; ownership still claims it                                                                                                              |

**Recovery (current disk state is truth):**

```bash
builder adopt ownership --apply   # re-baseline digests only
bun run manifest:regen
```

If adopt dry-run refuses a path, read its classification (`identical` vs `baselined` vs `unproven`). Customized author seams (`convex/lib/authContext.ts`) should be **baselined** to current content so Builder stops treating your Clerk claim mapping as drift.

After recovery, commit `.builder/ownership.json` together with any regenerated files from `--apply`.

**Verify ledger matches disk** (optional spot-check):

```bash
node -e "
const fs=require('fs');const c=require('crypto');
const o=JSON.parse(fs.readFileSync('.builder/ownership.json','utf8'));
for (const [p,{sha256:expected}] of Object.entries(o.files)) {
  if (!fs.existsSync(p)) { console.log('MISSING', p); continue; }
  const actual=c.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  if (actual!==expected) console.log('MISMATCH', p);
}
"
```

## Authored Event integration

- Use generated hooks from `src/lib/manifest-convex-react.ts` first, and import the generated Convex API only through the approved `src/lib/api.ts` seam.
- Event creation uses generated `createVia*` / `useCreate*` hooks directly (no authored `eventPlanning` allocation seam). Keep policy, validation, lifecycle, encryption, tenant enforcement, events, and reactions in the generated command surface.
- Consume lifecycle availability from `src/generated/manifest-wiring-bindings.ts`; do not recreate transition tables in authored feature code.
- Generated runtime behavior still needs focused reaction tests. Structural generation and typed wiring do not prove downstream reactions execute correctly.
- `bun run check:event-manifest` enforces this authored Event boundary and is part of `bun run check`.

## Authored Culinary integration

- Use generated hooks from `src/lib/manifest-convex-react.ts` first, including the governed `useCreate*` hooks for Ingredient, Recipe, RecipeIngredient, Dish, Menu, and EventDish.
- Culinary creation needs no authored allocation seam. Generated `createVia*` mutations construct one final document atomically (draft → checks → mutate → single persist); nothing is written on failure.
- Keep validation, tenant enforcement, lifecycle, events, and reactions in generated runtime behavior. Consume lifecycle availability from `src/generated/manifest-wiring-bindings.ts`; do not recreate transition tables in authored Kitchen code.
- Generated runtime behavior still requires focused reaction tests. Typed wiring and generated creation cleanup do not prove downstream demand or production reactions execute correctly.
- `bun run check:culinary-manifest` enforces this authored Culinary boundary and is part of `bun run check`.

## Authored Inventory and Procurement integration

- Use generated hooks from `src/lib/manifest-convex-react.ts`, including governed creation for IngredientDemand, StorageLocation, InventoryItem, InventoryReservation, Vendor, VendorOrder, and VendorOrderLine. `PurchaseNeed.create` is itself a generated allocating command.
- Inventory and Procurement need no authored allocation seam. Do not write their documents in `convex/lib/**` or reproduce demand, reservation, need, order, vendor, or receipt lifecycles locally.
- Consume proven lifecycle availability from `src/generated/manifest-wiring-bindings.ts`. `VendorOrderLine.recordReceipt` has generated capability and input metadata but no static lifecycle array because its next state is quantity-dependent; let the generated command decide legality.
- Generated runtime behavior still requires focused reaction tests. The authored UI explicitly does not claim demand-to-purchase, add-line-to-ordered, cancellation, or receipt-to-stock automation while the projection evidence remains open.
- `bun run check:supply-manifest` enforces this authored boundary and is part of `bun run check`.

## Authored Production and Quality integration

- Use generated hooks from `src/lib/manifest-convex-react.ts`, including governed `useCreatePrepTask` and `useCreateQualityCheck` (open).
- Production and Quality need no authored allocation seam. Consume lifecycle availability from `src/generated/manifest-wiring-bindings.ts`.
- Runtime proof for failed quality blocking: `tests/proofs/quality-check-fail-block.runtime.test.ts`.
- `bun run check:production-manifest` enforces this authored boundary and is part of `bun run check`.

## Hard rule

If regeneration would clobber an author seam, **stop**. Preserve `convex/lib/**`, `convex/auth.config.ts`, and `convex/authStatus.ts`. Never “fix” generated output by hand — re-assemble or re-codegen from the authoritative source.

**Ownership invariant:** any commit touching Builder-owned generated paths must include `.builder/ownership.json` from the same `bun run manifest:regen` transaction.

## Event prep and weekly inventory order workflow

The source contract for DishTask templates, EventDish-owned PrepTask rows,
IngredientDemand provenance, and weekly draft VendorOrder reconciliation is
documented in [event-prep-and-weekly-order-workflow.md](../event-prep-and-weekly-order-workflow.md).
Edit the `.manifest` sources and regenerate owned projections; do not hand-edit
Convex output. The current Manifest compiler does not support child-creating
reactions, so the Capsule orchestrator owns generated-row reconciliation while
the Manifest events and commands remain the domain contract.
