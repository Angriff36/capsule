# CapsuleX — agent commands

Catering / event ops app: Vite + React, Convex, Clerk. Assembled from Manifest proofs.

## Ralph loop (this checkout)

This checkout is a Ralph worktree on branch `ralph/wiggum-loop` (sibling of the
main capsule checkout, which this loop never touches).

- `./loop.sh plan` → studies `specs/ralph/` + `src/`, writes IMPLEMENTATION_PLAN.md
  + ACCEPTANCE_TESTS.md. Human reviews the plan. Then `./loop.sh 20` builds one
  plan item per iteration, commits and pushes this branch every iteration.
- State files: `IMPLEMENTATION_PLAN.md` (the plan — disposable, regenerate freely),
  `ACCEPTANCE_TESTS.md` (the completion contract; `AC-###` ids never renumbered),
  `.ralph.env` (loop config). Telemetry: `.ralph-telemetry.jsonl`; failures:
  `.ralph-failures.md`; rollback: `./rollback.sh`.
- Specs live in `specs/ralph/` (gate: `./lint_specs.sh specs/ralph`).
  `specs/capsule-complete-feature-spec.*` is reference context for planning, not a
  ralph spec. Docs truth: `docs/architecture/*.md` still binds every iteration.
- Validation commands (also in `.ralph.env`): tests `bun run test`; lint
  `bun run typecheck && bun run format:check`; build `bunx vite build`.
  NEVER `bun run build` in this loop — it runs `scripts/vercel-build.sh`, which
  deploys Convex. NEVER `npx convex deploy`. NEVER push `main` (this branch only).
- Tests: capsule's "don't add tests unless the owner asks" rule is satisfied for
  this loop by the ACCEPTANCE_TESTS.md contract — add the focused test each
  `AC-###` requires, in capsule's existing style (`tests/*.test.ts`, proofs under
  `tests/proofs/` for runtime domain behavior). No other new tests.
- Generated files are still never hand-edited: manifest changes go through
  `bun run manifest:regen` INSIDE this worktree so source + generated land in one
  commit (`.builder/` and BUILDER_DIR are available here).

# Documentation (read this whenever you are making any changes)

RYAN_APPROVED 7-23-2026 Created by Ryan
C:/Projects/Manifest/mintlify/llms-full.txt
That is the full docuemntation for manifest, it will save you so many headaches if you read it.
RYAN_APPROVED 7-23-2026 Created by Ryan

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

**New `convex/*.ts` authored seam?** Run `bun run codegen` before `bun run typecheck` — `convex/_generated/api.d.ts` is a strict static module list (runtime `api = anyApi` is dynamic, but the types are not); the dev server does NOT auto-regenerate it, so a fresh authored query/mutation won't typecheck until codegen registers it. In a worktree without `.env.local` (no `CONVEX_DEPLOYMENT`), run `CONVEX_DEPLOYMENT=befitting-armadillo-283 bunx convex codegen --typecheck disable` — codegen validates modules through a dry push and never modifies the deployment (`convex codegen --help`). Node-runtime rule: only actions may live in a `"use node"` file; put helper mutations/queries in a sibling non-node file.

Essential commands: [docs/commands.md](docs/commands.md). Full reference: [docs/operations/commands.md](docs/operations/commands.md).  
Manifest CLI safe vs unsafe in Capsule: [docs/generation/manifest-cli-safety.md](docs/generation/manifest-cli-safety.md).
Agent enter prompt: [docs/generation/AGENT_PROMPT_ENTER_RECIPE.md](docs/generation/AGENT_PROMPT_ENTER_RECIPE.md).
Agent MCP setup: [docs/generation/capsule-agent-mcp.md](docs/generation/capsule-agent-mcp.md).

`bun run check` must pass before claiming work complete. CI runs the same script.

## Tests (agents)

Do **not** create, add, or expand tests unless the owner asks. Run existing
`bun run test` / `bun run test:proofs` / `bun run check` gates when verifying.
Never disable or delete failing tests to go green.

## Design authority (agents)

Applies to all authored UI work: screens, shell, theme, tokens, shared
components, and any styling under `src/app/**`, `src/features/**`, `src/ui/**`,
and `src/styles/**`.

- **Read [DESIGN.md](DESIGN.md) first**, plus the applicable references it
  names (`docs/design-references/`, the owning page under `docs/systems/`),
  **before** proposing or implementing a UI change. Not after.
- `DESIGN.md` is the presentation authority
  ([docs/product/authority.md](docs/product/authority.md)). Its front matter is
  the authoritative source for colors, type faces, and radii;
  `bun run check:design-vocab` compares `src/styles/app.css` against it.
- **A complaint is not authorization.** “Bland,” “unintuitive,” “too pale,”
  “needs better contrast,” “make it pop” — these authorize work _inside_ the
  established visual language. They do not authorize replacing it. Fix the
  specific defect: raise a contrast ratio, tighten a hierarchy, correct a
  spacing error, add the missing focal point.
- **Conflict → stop and ask.** If the requested outcome cannot be reached
  without breaking a `DESIGN.md` rule, say which rule, quote it, describe the
  conflict, and get explicit owner approval to amend the design contract. Then
  amend `DESIGN.md` in the same change.
- **Never override `DESIGN.md` through implementation alone.** Moving a token,
  swapping a type face, or deleting a described component without amending
  `DESIGN.md` is silent drift, not a design decision. That is exactly how the
  2026-08-24 divergence happened (909bc59, f8649bb).
- Recorded, not-yet-resolved divergences live in
  [design-contract-exceptions.json](design-contract-exceptions.json), one entry
  per token with a reason. Do **not** add an entry to make a new change pass —
  an entry records an owner decision that is still open, and adding one for
  fresh work is the silent override this rule forbids.

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

**If the diff touches authored UI** — screens, shell, theme, tokens, shared
components, or styling under `src/app/**`, `src/features/**`, `src/ui/**`,
`src/styles/**` — the prompt MUST ALSO include the following, and the reviewer
must be given `DESIGN.md` itself, not just the diff:

> "DESIGN.md is the presentation authority for this repo. Read it, then
> compare these changes against it directly. (1) List every DESIGN.md rule the
> diff violates — quote the rule and point at the line that breaks it; check
> the front-matter colors, type faces, and radii against src/styles/app.css,
> and the Components, Do's and Don'ts, Responsive, and Accessibility sections
> against the markup. (2) Distinguish a usability improvement made WITHIN the
> established visual language (better contrast inside the palette, clearer
> hierarchy, fixed spacing, a real focal point) from a REPLACEMENT of the
> visual language (new palette, new type system, a described component deleted
> or re-shaped, a forbidden pattern introduced). (3) REJECT any replacement of
> the visual language that changes implementation only. A visual-language
> change is acceptable ONLY if this same diff also amends DESIGN.md to match
> and cites the owner's explicit approval for that amendment. An unamended
> DESIGN.md plus a changed look is a REJECT, no matter how good the new look
> is. (4) Adding a token to design-contract-exceptions.json to make new work
> pass is a REJECT — that file records open owner decisions, it does not grant
> them."

A reviewer that was not given `DESIGN.md` has not reviewed the presentation.
Treat that verdict as incomplete and re-run the review with the file attached.

Reviewer APPROVE = authorization to merge. Reviewer REJECT = fix or escalate
to the human; never merge over a rejection. The PR body must name the
reviewing model and its verdict.

RYAN_APPROVED 2026-08-01: **Green CI + independent cross-model APPROVE is
FULL push/merge authorization.** No additional owner sign-off is required to
push to main or merge a PR (this repo and Angriff36/Manifest alike) once the
required gates pass and a non-authoring model has approved the diff. Do not
hold reviewed, green work waiting for a human. Everything else in this gate
(never self-approve, never merge over a REJECT, name the reviewer in the PR
body) still applies.

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

**Branch and release rule (owner, 2026-08-25).** Direct pushes to `main`
are blocked by `.githooks/pre-push`. Every task works on a branch and pushes
to that branch immediately and often; those pushes are chores — `vercel.json`
`ignoreCommand` skips every non-`main` ref, so nothing builds and nothing
deploys. Dev work uses the LOCAL Convex backend (`bun run dev:convex`,
127.0.0.1:3210). ONE merge to `main` happens at the end of the branch:

```text
bash scripts/release.sh --reviewer <model>
```

It requires a clean tree, the branch pushed, and the reviewer that APPROVED
the diff (merge gate above). It merges `--no-ff` into `main`, runs
`bun run check` on the merge (CI does not run on `main`; the pre-push hook
refuses `main` without proof of that run), pushes `main`
once with `CAPSULE_RELEASE=1` (the only Vercel production build and the only
Convex prod deploy for that branch — Vercel builds `main` only for a commit
whose subject starts with `[release]`, so a merge made on GitHub, PR button
or auto-merge, lands but never deploys), then renames the branch to
`archive/<branch>` locally and on origin. Start the next task from `main`.

**Manual deploy commands and settings changes are HUMAN-AUTHORIZED only.** No
loop or agent runs `npx convex deploy`, `vercel deploy`, or edits Vercel/Clerk
settings without the human explicitly asking in the current conversation.

**Pushing `main` deploys BOTH frontend and Convex backend** (since
`cc24315`, 2026-07-24): `vercel.json`'s `buildCommand` is
`convex deploy --cmd 'vite build'`, so every Vercel production build pushes
Convex functions/schema to prod (`impartial-mule-193`) together with the UI.
A gate-approved `git push` to `main` therefore ships everything CI verified —
no separate `npx convex deploy -y` step is needed for changes that ride a
`main` push. (Before `cc24315`, Vercel shipped only the UI and new Convex
queries would Server Error until a manual deploy — that skew is why the
buildCommand now deploys both; do not remove it.)

When the human asks for a MANUAL deploy (no `main` push involved):

1. Backend first, if `convex/` or manifests changed:
   `bun run manifest:regen` (manifest changes only) → `npx convex deploy -y`
   → prod deployment `impartial-mule-193`.
2. Frontend: `vercel deploy --prod --yes --archive=tgz`.

Invariants agents must not break (each broke a real deploy once):

- `vercel.json` SPA rewrites stay.
- `.vercelignore` patterns stay ROOT-ANCHORED (`/generated`, never bare
  `generated` — it swallows `src/generated`).
- `package.json` `prepare` keeps its `|| exit 0` guard (gitless build env).
- Frontend env (`VITE_CONVEX_URL`, `VITE_CLERK_PUBLISHABLE_KEY`) lives in
  Vercel project env and is baked at build; backend env lives on the Convex
  deployment (`npx convex env set ... --prod`).
- New domains must also land in Clerk allowed origins or sign-in loops.
