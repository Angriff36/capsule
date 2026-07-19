# Authored vs generated boundaries

## Import rules

- App code imports Convex through `src/lib/api.ts` only.
- Generated Convex modules import auth via `convex/lib/authContext.ts` (`getAuthContext`).
- Do not deep-import `convex/_generated/**` or `src/generated/**` from features.

## Safe to edit (author seams)

| Path                                                          | Notes                            |
| ------------------------------------------------------------- | -------------------------------- |
| `src/app/**`                                                  | Shell, AuthGate, navigation      |
| `src/features/**`                                             | Domain UI slices                 |
| `src/ui/**`                                                   | Shared UI primitives             |
| `src/lib/api.ts`, `src/lib/format.ts`, `src/lib/workspace.ts` | Thin adapters                    |
| `convex/lib/**`                                               | Auth context, encryption helpers |
| `convex/auth.config.ts`, `convex/authStatus.ts`               | Clerk / status seams             |
| Authored tests under `tests/` (not contract fixtures)         | Policy / seam proofs             |

## Do not hand-edit (regenerate)

| Path                                                             | Producer                   |
| ---------------------------------------------------------------- | -------------------------- |
| `convex/{schema,queries,mutations,http,crons,sagas,computed}.ts` | Manifest Builder           |
| `convex/_generated/**`                                           | `bun run codegen` / Convex |
| `schemas/**`, `wiring/**`                                        | Manifest Builder           |
| `src/generated/**`, `src/lib/manifest-convex-react.ts`           | Manifest Builder           |
| `scripts/seed-convex.ts`                                         | Manifest Builder           |
| Contract tests / `diagrams/` companions                          | Manifest Builder           |

### Convex schema vs `schemas/**` (do not confuse)

| Path                          | What it is                                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `convex/schema.ts`            | **Real Convex DB schema** (tables, indexes, `v.*` validators). Runtime authority.                                 |
| `schemas/manifest-schemas.ts` | **Bundled Zod companion** (synced-validation). Not Convex. Wired into `manifest-convex-react` hooks via `.parse`. |

**Plain English — what Zod is for:** Convex already checks args on the server. The Zod bundle is a client checklist from the same Manifest model so hooks reject bad input *before* the mutation runs.

**Synced-validation (Builder preset ≥ 1.3.5 + Manifest `zodParamsImport`):** Emit **only** `schemas/manifest-schemas.ts`. React hooks parse command params. Per-command microfiles are not assembled (legacy dumps deleted on next ownership-aware regen).

**Benefit when wired:** client parse rejects bad shapes before the network; hooks stay aligned with Manifest command params. Does **not** replace server guards/policies.

### What must stay in git vs companion noise

| Keep tracked (CI / runtime)                                   | Today tracked because ownership, low product value                          |
| ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Authored `tests/**`                                           | `diagrams/**` mermaid companions                                            |
| `tests/manifest-convex.contract.test.ts` (export smoke)       | Legacy `schemas/*.schema.ts` microfiles (removed after regen on new preset) |
| `convex/schema.ts` + surfaces + `schemas/manifest-schemas.ts` |                                                                             |

Untracking diagrams is still a companion packaging change. Do not delete owned paths without `.builder/ownership.json` via regen.

If a Builder regenerate would overwrite an author seam, **stop**. Preserve the seam; never “fix” generated output by hand.

Full assembly rules: [manifest-builder](../generation/manifest-builder.md). Receipt: [`PRESET.md`](../../PRESET.md).
