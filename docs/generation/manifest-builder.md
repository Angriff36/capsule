# Manifest Builder boundary

Canonical description of how this repository is produced. Assembly receipt: [`PRESET.md`](../../PRESET.md). Verification dump: `ASSEMBLY_REPORT.json`.

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

1. Publish Manifest proofs.
2. Builder assemble → `PRESET.md` / `ASSEMBLY_REPORT.json` (and generated trees).
3. Wire Clerk + env (`.env.example` contract).
4. `bun run codegen` / `bun run dev:convex`.
5. UI consumes APIs through generated hooks via `src/lib/api.ts`.

## Authored Event integration

- Use generated hooks from `src/lib/manifest-convex-react.ts` first, and import the generated Convex API only through the approved `src/lib/api.ts` seam.
- Event creation currently uses `convex/lib/eventPlanning.ts` to allocate Client, Venue, Event, and EventGuest records, invoke their generated commands, and clean up rejected allocations. Keep policy, validation, lifecycle, encryption, tenant enforcement, events, and reactions in the generated command surface.
- Consume lifecycle availability from `src/generated/manifest-wiring-bindings.ts`; do not recreate transition tables in authored feature code.
- Generated runtime behavior still needs focused reaction tests. Structural generation and typed wiring do not prove downstream reactions execute correctly.
- `bun run check:event-manifest` enforces this authored Event boundary and is part of `bun run check`.

## Hard rule

If regeneration would clobber an author seam, **stop**. Preserve `convex/lib/**`, `convex/auth.config.ts`, and `convex/authStatus.ts`. Never “fix” generated output by hand — re-assemble or re-codegen from the authoritative source.
