# Manifest Builder boundary

Canonical description of how this repository is produced. Assembly receipt: [`PRESET.md`](../../PRESET.md). Verification dump: `ASSEMBLY_REPORT.json`.

Essential commands: [commands.md](../commands.md). Full reference: [operations/commands.md](../operations/commands.md). Command idempotency: [command-idempotency.md](./command-idempotency.md).

## Model

CapsuleX is **assembled**, not hand-grown end-to-end:

**Manifest IR → Builder `convex-application` preset → this repo.**

Current preset: `convex-application` **v1.3.4** (`package.json` → `manifestPreset`, status complete in `PRESET.md`).

## Authoritative generators

| Tool                                                | Produces                                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Manifest / `@angriff36/manifest` + Builder assemble | Convex surfaces, schemas, wiring, seed script, client wiring, contract tests, diagrams companions |
| Convex codegen (`bun run codegen`)                  | `convex/_generated/**`                                                                            |

## Generated — do not hand-edit

- `convex/schema.ts`, `convex/queries.ts`, `convex/mutations.ts`
- `convex/http.ts`, `convex/crons.ts`, `convex/sagas.ts`, `convex/computed.ts`
- `convex/_generated/**`
- `schemas/**`, `wiring/**`
- `src/generated/**`, `src/lib/manifest-convex-react.ts`
- `scripts/seed-convex.ts`
- Generated contract tests (e.g. `tests/manifest-convex.contract.test.ts`)
- `diagrams/` companions from the docs-diagrams pack

## Author seams — safe to edit

- `src/app/**`, `src/features/**`, `src/ui/**`
- `convex/lib/**` (especially `authContext.ts`)
- `convex/auth.config.ts`, `convex/authStatus.ts`
- Thin adapters such as `src/lib/api.ts`

Generated Convex surfaces import `getAuthContext` from `./lib/authContext`. That module is fail-closed; customize IdP claims there only.

## Flow

Capsule is a **live Manifest project**: editable `.manifest` sources and
`manifest.config.yaml` live in this repo. Builder regenerates owned artifacts
from those in-project files (no external `Manifest-source` IR after init).

1. Edit domain meaning in `src/**/*.manifest` and/or `manifest.config.yaml`.
2. `bun run manifest:regen` — Builder plans and applies when conflict-free; updates `.builder/ownership.json` in the same transaction. Preview only: `builder generate convex --dry-run`.
3. `bun run codegen` / `bun run dev:convex` as needed.
4. UI consumes APIs through generated hooks via `src/lib/api.ts`.

Recovery when ownership digests are stale (no file rewrites): `builder adopt ownership --apply`, then `bun run manifest:regen`.

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

Do **not** use `manifest generate`, `manifest:build`, or `place-manifest-convex-react.ts`. There is no npm script for them.

`bun run check` verifies owned files match the ownership ledger. Pre-commit rejects owned-file commits without an ownership update.

## Ownership drift — symptoms and recovery

Builder stores SHA-256 digests in `.builder/ownership.json`. Regen compares **recorded hash → disk → desired output**. Any mismatch blocks `--apply`.

Common failure modes (any agent, any session):

| Symptom                                                     | Typical cause                                                                                                     |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `owned-file-modified` on `convex/mutations.ts`              | Manifest bump + mutations committed without `--apply` refreshing ownership (e.g. consumed 3.6.20 output manually) |
| `owned-file-modified` on `authContext.ts` / `encryption.ts` | Ownership ledger records wrong digest — ledger updated without matching file, or seam customized without adopt    |
| `owned-file-modified` on `manifest-convex-react.ts`         | Hand-edited hook target instead of fixing initialization command selection in `.manifest` + regen                 |
| `package.json` pin/script conflicts                         | `ownership.package` still records old Builder pins while app intentionally diverged                               |
| `owned-file-missing` on `tsconfig.builder.json`             | File deleted locally; ownership still claims it                                                                   |

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
