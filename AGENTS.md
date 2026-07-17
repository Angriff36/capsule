# CapsuleX — agent commands

Catering / event ops app: Vite + React, Convex, Clerk. Assembled from Manifest proofs.

## Directory ownership

| Path                                                             | Role                                                     |
| ---------------------------------------------------------------- | -------------------------------------------------------- |
| `src/app/**`, `src/features/**`, `src/ui/**`                     | Authored UI                                              |
| `convex/lib/**`, `convex/auth.config.ts`, `convex/authStatus.ts` | Author Convex seams                                      |
| `convex/{schema,queries,mutations,http,crons,sagas,computed}.ts` | Generated — do not edit                                  |
| `convex/_generated/**`                                           | Convex codegen — do not edit                             |
| `src/generated/**`, `src/lib/manifest-convex-react.ts`           | Manifest client wiring — do not edit                     |
| `schemas/`, `wiring/`, `scripts/seed-convex.ts`                  | Manifest assembly — do not edit                          |
| `tests/`                                                         | Vitest (authored policy/seam + generated contract tests) |
| `docs/`                                                          | Architecture / systems / generation truth                |
| `diagrams/`                                                      | Manifest docs-diagrams companion                         |
| `.artifacts/`, `graphify-out/`                                   | Ignored scratch only                                     |

## Commands

```bash
bun install --frozen-lockfile
bun run dev              # Vite → http://localhost:7811
bun run dev:convex       # Convex sync
bun run toolchain        # Bun/Node pin check
bun run typecheck
bun run format           # prettier --write .
bun run format:check     # prettier --check .
bun run secrets
bun run test
bun run test:coverage    # vitest + coverage ratchet
bun run build
bun run baseline:decay   # monthly hygiene checks
bun run check            # toolchain + typecheck + format:check + secrets + test:coverage + build + baseline:decay
bun run codegen          # convex codegen
bun run manifest:regen      # only regen entry — Builder apply when conflict-free
bun run seed             # requires Convex URL
```

Essential commands: [docs/commands.md](docs/commands.md). Full reference: [docs/operations/commands.md](docs/operations/commands.md).

`bun run check` must pass before claiming work complete. CI runs the same script.

## Do not hand-edit

`convex/{schema,queries,mutations,http,crons,sagas,computed}.ts`, `convex/_generated/**`, `schemas/**`, `wiring/**`, `src/generated/**`, `src/lib/manifest-convex-react.ts`, `scripts/seed-convex.ts`, generated contract tests, `diagrams/` companions.

## Regeneration (one command)

```bash
bun run manifest:regen
```

Builder plans, applies when conflict-free, and updates `.builder/ownership.json` in one transaction. Optional flags after `--` (e.g. `--install`).

Do **not** use `manifest generate`, `manifest:build`, or `place-manifest-convex-react.ts` — blocked or absent; they bypass ownership.

`bun run check` verifies owned files still match the ownership ledger. Pre-commit rejects commits that touch owned paths without updating ownership.

Import Convex API through `src/lib/api.ts`. Details: `docs/generation/manifest-builder.md`.

Proof-kit / integration-guard / Manifest pin work: read
`docs/generation/2026-07-16-dx-proof-kit-boundary.md` first (Capsule twin of the
Manifest binding plan). Exact registry pin only; thin feature-root wrappers over
the Manifest guard engine — do not invent app-side guard logic or hand-maintained
capability inventories.

## Secrets / env

- Contract: `.env.example`
- Local secrets: `.env.local` (ignored) or Convex/Clerk dashboards
- Never commit secret values
- `bun run secrets` must stay green (fixture: `tests/fixtures/secret-scan/synthetic-leak.txt`)
