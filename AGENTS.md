# CapsuleX — agent commands

Catering / event ops app: Vite + React, Convex, Clerk. Assembled from Manifest proofs.

## Directory ownership

| Path                                                             | Role                                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `src/app/**`, `src/features/**`, `src/ui/**`                     | Authored UI                                                               |
| `src/app.manifest`, `src/**/*.manifest`                          | Authored Manifest domain (root entry + modules; no daisy-chain `use`)     |
| `src/agent/**`, `scripts/capsule-mcp.ts`                         | Authored agent command bridge (MCP → Convex mutations)                    |
| `convex/lib/**`, `convex/auth.config.ts`, `convex/authStatus.ts` | Author Convex seams                                                       |
| `convex/{schema,queries,mutations,http,crons,sagas,computed}.ts` | Generated — do not edit                                                   |
| `convex/_generated/**`                                           | Convex codegen — do not edit                                              |
| `src/generated/**`, `src/lib/manifest-convex-react.ts`           | Manifest client wiring — do not edit                                      |
| `schemas/`, `wiring/`, `scripts/seed-convex.ts`                  | Manifest assembly — do not edit                                           |
| `tests/`                                                         | Vitest (authored policy/seam + generated contract tests)                  |
| `docs/`                                                          | Architecture / systems / generation truth                                 |
| `diagrams/`                                                      | Opted out (`skipDocsDiagrams` in `manifest.config.yaml`) — do not rebuild |
| `.artifacts/`, `graphify-out/`                                   | Ignored scratch only                                                      |
| `.aboardai/**`                                                   | AboardAI product board (features/kanban) — **never move or stash**        |

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
bun run agent:mcp        # Capsule MCP stdio host for Cursor (idle in a TTY is expected; needs CAPSULE_AGENT_JWT)
# Note: agent:llm-tools / agent:mcp:verify are documented in docs/generation/capsule-agent-mcp.md
# but are not package.json scripts in this checkout — use the MCP host + mint-jwt path above.
```

Essential commands: [docs/commands.md](docs/commands.md). Full reference: [docs/operations/commands.md](docs/operations/commands.md).  
Manifest CLI safe vs unsafe in Capsule: [docs/generation/manifest-cli-safety.md](docs/generation/manifest-cli-safety.md).
Agent enter prompt: [docs/generation/AGENT_PROMPT_ENTER_RECIPE.md](docs/generation/AGENT_PROMPT_ENTER_RECIPE.md).
Agent MCP setup: [docs/generation/capsule-agent-mcp.md](docs/generation/capsule-agent-mcp.md).

`bun run check` must pass before claiming work complete. CI runs the same script.

## Tests (agents)

Do **not** create, add, or expand tests unless the owner asks. Run existing
`bun run test` / `bun run test:proofs` / `bun run check` gates when verifying.
Never disable or delete failing tests to go green.

## Domain gating (agents)

Before adding or tightening policies/guards/constraints in `src/**/*.manifest`,
read [docs/architecture/domain-gating-restraint.md](docs/architecture/domain-gating-restraint.md).
Agents overgate by default — freeze mid-service edits, invent specialty read
roles, block 86/swap paths. Gate on real harm only.

## No invented deferrals (agents)

Do not write “deferred,” “out of scope,” or shrink MCP/UI to a tiny allowlist
unless the owner said so. Read
[docs/architecture/no-invented-deferrals.md](docs/architecture/no-invented-deferrals.md).
Not built ≠ owner-deferred. AC minimum ≠ product ceiling.

## Escalate blockers to GitHub (agents)

Do not silently ignore schema drift, broken command paths, stale MCP catalogs,
auth remint gaps, or idempotency traps. Open a GitHub issue in
`Angriff36/capsule` in the same session. Read
[docs/architecture/escalate-blockers-to-github.md](docs/architecture/escalate-blockers-to-github.md).
Workarounds are temporary bridges — they do not replace the issue.

## Do not hand-edit

`convex/{schema,queries,mutations,http,crons,sagas,computed}.ts`, `convex/_generated/**`, `schemas/**`, `wiring/**`, `src/generated/**`, `src/lib/manifest-convex-react.ts`, `scripts/seed-convex.ts`, generated contract tests, `diagrams/` companions.

## Regeneration (one command)

```bash
bun run manifest:regen
```

Builder plans, applies when conflict-free, and updates `.builder/ownership.json` in one transaction. Optional flags after `--` (e.g. `--install`).

Do **not** use bare `manifest generate` / `manifest build`, `bun run manifest:build`, or `place-manifest-convex-react.ts` — they bypass Builder ownership. Preset may still emit `manifest:build` / `manifest:compile` in `package.json`; only `place-manifest-convex-react` is deny-guarded today. Regen path: `bun run manifest:regen` only.

`bun run check` verifies owned files still match the ownership ledger. Pre-commit rejects commits that touch owned paths without updating ownership.

**Sibling Builder (`BUILDER_DIR`):** Capsule pre-push / `manifest:regen-check`
runs that checkout’s working tree. If you fix a Builder bug that Capsule’s
regen gate needs (e.g. skip `.loop-worktrees` in `ManifestSourceTree`),
**commit it in Builder immediately** as its own atomic commit. Do not leave it
uncommitted or bulk-stash it with unrelated Builder WIP — that removes the fix
from disk and breaks Capsule `git push`. See
`docs/generation/manifest-builder.md` § Pre-push circular dependency.

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

## Merge gate: independent cross-model review required (owner rule, 2026-07-19; cross-model fallback 2026-07-22 — ALL agents: Claude Code, Cursor, Codex, any other)

No PR merges until an AI model that did NOT author the diff reviews and
APPROVES it. The reviewer must be a different model than the author; a model
never approves its own diff.

Primary reviewer — Codex gpt-5.6-sol:

```bash
codex -c model="gpt-5.6-sol" review --base main
# or with custom instructions piped via:  codex -c model="gpt-5.6-sol" review -
```

Cross-model alternates, when Codex is unavailable (quota/outage) or authored
the change — **any frontier model that did not author the diff is
eligible**; the named routes are the preferred defaults:

- Diff authored by Codex or grok → **Fable 5** reviews (a fresh Claude
  review pass, not the session/agent that wrote the code).
- Diff authored by Claude/Fable or Codex → **grok via Cursor CLI** reviews:
  `agent -p --trust --model cursor-grok-4.5-high-fast "<review prompt + diff scope>"`
  (PowerShell; `agent` is a PowerShell script on this machine).
- Diff authored by GLM/MiniMax (loop implementers) → Codex primary; either
  Fable 5 or grok as the fallback.

If no eligible reviewer can produce a verdict, treat it as REJECT and
escalate to the human; never merge unreviewed.

Whichever model reviews, the prompt MUST include: "Review the changes AND
ensure they do NOT add tedium for app users via guardrails and policies that
barely matter — this is a catering app, not a bank. Changes should REDUCE
user tedium and let users actually use the app instead of being policy-denied
every time they try to do anything. Flag any new guard, policy, approval, or
validation that blocks a reasonable user action without a proportionate
real-world reason."

Reviewer APPROVE = authorization to merge. Reviewer REJECT = fix or escalate
to the human; never merge over a rejection. The PR body must name the
reviewing model and its verdict.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## Deploying (agents: read before touching anything deploy-shaped)

**Deploys are HUMAN-AUTHORIZED only.** No loop or agent runs
`npx convex deploy`, `vercel deploy`, or edits Vercel/Clerk settings without
the human explicitly asking in the current conversation. Merging a PR to
`main` DOES auto-deploy the frontend (GitHub→Vercel integration, production
branch `main`) — that is expected and fine; it ships whatever CI already
verified.

When the human asks for a deploy, the correct order is:

1. Backend first, if `convex/` or manifests changed:
   `bun run manifest:regen` (manifest changes only) → `npx convex deploy -y`
   → prod deployment `tangible-skunk-448`.
2. Frontend: merge to `main` (auto-deploys) or
   `vercel deploy --prod --yes --archive=tgz`.

Invariants agents must not break (each broke a real deploy once):

- `vercel.json` SPA rewrites stay.
- `.vercelignore` patterns stay ROOT-ANCHORED (`/generated`, never bare
  `generated` — it swallows `src/generated`).
- `package.json` `prepare` keeps its `|| exit 0` guard (gitless build env).
- Frontend env (`VITE_CONVEX_URL`, `VITE_CLERK_PUBLISHABLE_KEY`) lives in
  Vercel project env and is baked at build; backend env lives on the Convex
  deployment (`npx convex env set ... --prod`).
- New domains must also land in Clerk allowed origins or sign-in loops.
