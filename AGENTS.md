# CapsuleX — agent commands

Catering / event ops app: Vite + React, Convex, Clerk. Assembled from Manifest proofs.

## Directory ownership

| Path                                                             | Role                                                     |
| ---------------------------------------------------------------- | -------------------------------------------------------- |
| `src/app/**`, `src/features/**`, `src/ui/**`                     | Authored UI                                              |
| `src/agent/**`, `scripts/capsule-mcp.ts`                         | Authored agent command bridge (MCP → Convex mutations)   |
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
bun run agent:mint-jwt   # write CAPSULE_AGENT_JWT (UI session + org first)
bun run agent:enter-recipe -- <recipe.txt>
bun run agent:mcp        # Capsule command MCP (needs CAPSULE_AGENT_JWT)
```

Essential commands: [docs/commands.md](docs/commands.md). Full reference: [docs/operations/commands.md](docs/operations/commands.md).
Agent enter prompt: [docs/generation/AGENT_PROMPT_ENTER_RECIPE.md](docs/generation/AGENT_PROMPT_ENTER_RECIPE.md).
Agent MCP setup: [docs/generation/capsule-agent-mcp.md](docs/generation/capsule-agent-mcp.md).

`bun run check` must pass before claiming work complete. CI runs the same script.

## Domain gating (agents)

Before adding or tightening policies/guards/constraints in `src/**/*.manifest`,
read [docs/architecture/domain-gating-restraint.md](docs/architecture/domain-gating-restraint.md).
Agents overgate by default — freeze mid-service edits, invent specialty read
roles, block 86/swap paths. Gate on real harm only.

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
Manifest binding plan). Registry pin per that twin (caret range allowed;
`file:`/`link:` forbidden); thin feature-root wrappers over the Manifest guard
engine — do not invent app-side guard logic or hand-maintained capability
inventories.

Command API / webhooks / external agents: read
`docs/generation/2026-07-17-command-api-surface-boundary.md` first. Manifest
`webhook` is **inbound** only; outbound uses publish/outbox/EventBus; assistants
and partners share the same generated command contract — no separate AI API.

## Secrets / env

- Contract: `.env.example`
- Local secrets: `.env.local` (ignored) or Convex/Clerk dashboards
- Never commit secret values
- `bun run secrets` must stay green (fixture: `tests/fixtures/secret-scan/synthetic-leak.txt`)

## Merge gate: Codex approval required (owner rule, 2026-07-19 — ALL agents: Claude Code, Cursor, Codex, any other)

No PR merges until Codex (gpt-5.6-sol) reviews and APPROVES the diff:

```bash
codex -c model="gpt-5.6-sol" review --base main
# or with custom instructions piped via:  codex -c model="gpt-5.6-sol" review -
```

The review prompt MUST include: "Review the changes AND ensure they do NOT
add tedium for app users via guardrails and policies that barely matter —
this is a catering app, not a bank. Changes should REDUCE user tedium and let
users actually use the app instead of being policy-denied every time they try
to do anything. Flag any new guard, policy, approval, or validation that
blocks a reasonable user action without a proportionate real-world reason."

Codex APPROVE = authorization to merge. Codex REJECT = fix or escalate to the
human; never merge over a rejection.
