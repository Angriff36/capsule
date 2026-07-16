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

If a Builder regenerate would overwrite an author seam, **stop**. Preserve the seam; never “fix” generated output by hand.

Full assembly rules: [manifest-builder](../generation/manifest-builder.md). Receipt: [`PRESET.md`](../../PRESET.md).
