# CapsuleX — agent ruleset

Behavioral rules for automated contributors. Commands live in `AGENTS.md`. System truth lives under `docs/`.

## Truth split

| File                                                         | Owns                                                                     |
| ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `CLAUDE.md`                                                  | How to behave                                                            |
| `AGENTS.md`                                                  | How to run / maintain                                                    |
| `docs/architecture/*`, `docs/systems/*`                      | What the system is                                                       |
| `docs/architecture/domain-gating-restraint.md`               | Don’t overgate domain policies/guards (Binding for agents)               |
| `docs/architecture/no-invented-deferrals.md`                 | Don’t invent “deferred” / MCP allowlists (Binding for agents)            |
| `docs/architecture/escalate-blockers-to-github.md`           | Blockers → GitHub issues same session; no silent ignore (Binding)        |
| `docs/generation/manifest-builder.md`, `PRESET.md`           | How the repo is produced                                                 |
| `docs/generation/2026-07-16-dx-proof-kit-boundary.md`        | Proof-kit ownership + Manifest semver range (Binding)                    |
| `docs/generation/2026-07-17-command-api-surface-boundary.md` | Command API / webhook direction / no separate AI API (Binding)           |
| `docs/generation/capsule-agent-mcp.md`                       | Capsule product MCP setup (Convex mutations, not Manifest authoring MCP) |
| `src/agent/**`                                               | Authored agent command bridge                                            |
| `README.md`                                                  | Human on-ramp + links                                                    |

## Boundaries

- Preserve generated boundaries. Never hand-edit Manifest/Convex generated trees.
- When unsure whether a file is generated, check `docs/generation/manifest-builder.md` and `PRESET.md` before editing.
- If regeneration would clobber an author seam (`convex/lib/**`, `convex/auth.config.ts`, `convex/authStatus.ts`), stop — do not “fix” generated output by hand.
- Feature work belongs in `src/features/**` plus author Convex seams only.
- Import Convex through `src/lib/api.ts`.

## Engineering

- Prefer small, single-responsibility files (OOP/SRP). Split before a file approaches ~400 lines.
- No drive-by refactors unrelated to the task.
- Do **not** create, add, or expand tests unless the owner asks. Run existing
  tests/gates when verifying; never delete failing tests or remove gates to go green.
- Do not weaken TypeScript strictness.
- Do not add tools that are not wired into `bun run check` / CI.
- Do not invent a second package manager lockfile (`package-lock.json` is rejected).
- Domain policies/guards: do **not** overgate. Follow
  `docs/architecture/domain-gating-restraint.md` (live ops must stay correctable;
  specialty read caps and freeze-at-executing are usually wrong).
- Do **not** invent deferrals, “out of scope,” or tiny allowlists. Follow
  `docs/architecture/no-invented-deferrals.md`. Not built ≠ owner-deferred.
- Do **not** silently ignore product/tooling blockers. Follow
  `docs/architecture/escalate-blockers-to-github.md` — open a GitHub issue in
  `Angriff36/capsule` the same session; workarounds are not escalation.

## Process

- Use `docs/` as architecture truth; keep `AGENTS.md` mechanical (commands only).
- Commit only when asked. One concern per commit; include proof (`bun run check` or a focused subset).
- Never commit `.env.local`, credentials, or `.artifacts/` dumps.
- Do not amend pushed history or force-push `main`.
- **Branch and release rule (owner, 2026-08-25).** Nothing pushes to `main`
  by hand; `.githooks/pre-push` blocks it. All work lives on a branch. Commit
  and push to that branch at once and often — a branch push is a chore: Vercel
  ignores non-`main` refs (`vercel.json` `ignoreCommand`), so it builds nothing
  and never runs `convex deploy`. Dev work talks to the LOCAL Convex backend.
  ONE merge to `main` happens at the end of the branch, via
  `bash scripts/release.sh --reviewer <model>` after the cross-model review APPROVES.
  That single push is the only Vercel production build and the only Convex
  prod deploy: Vercel builds `main` only for a `[release]` commit, so a merge
  made on GitHub never deploys. The script then renames the branch to `archive/<branch>`.
- Put diagnostics under `.artifacts/` (gitignored).

## Format gate

Prettier owns format (`bun run format` / `format:check`). It is part of `bun run check`. Do not reintroduce Biome or parallel formatters.

## Baseline

See `BASELINE.md` for enforced vs N/A gates. Coverage thresholds in `vite.config.ts` may only move upward. Branch protection status: `.github/branch-protection.md`.

# === COGNILAYER (auto-generated, do not delete) ===

## CogniLayer v4 Active
Persistent memory + code intelligence is ON.
ON FIRST USER MESSAGE in this session, briefly tell the user:
  'CogniLayer v4 active — persistent memory is on. Type /cognihelp for available commands.'
Say it ONCE, keep it short, then continue with their request.

## Tools — HOW TO WORK

FIRST RUN ON A PROJECT:
When DNA shows "[new session]" or "[first session]":
1. Run /onboard — indexes project docs (PRD, README), builds initial memory
2. Run code_index() — builds AST index for code intelligence
Both are one-time. After that, updates are incremental.
If file_search or code_search return empty → these haven't been run yet.

UNDERSTAND FIRST (before making changes):
- memory_search(query) → what do we know? Past bugs, decisions, gotchas
- code_context(symbol) → how does the code work? Callers, callees, dependencies
- file_search(query) → search project docs (PRD, README) without reading full files
- code_search(query) → find where a function/class is defined
Use BOTH memory + code tools for complete picture. They are fast — call in parallel.

BEFORE RISKY CHANGES (mandatory):
- Renaming, deleting, or moving a function/class → code_impact(symbol) FIRST
- Changing a function's signature or return value → code_impact(symbol) FIRST
- Modifying shared utilities used across multiple files → code_impact(symbol) FIRST
- ALSO: memory_search(symbol) → check for related decisions or known gotchas
Both required. Structure tells you what breaks, memory tells you WHY it was built that way.

AFTER COMPLETING WORK:
- memory_write(content) → save important discoveries immediately
  (error_fix, gotcha, pattern, api_contract, procedure, decision)
- session_bridge(action="save", content="Progress: ...; Open: ...")
DO NOT wait for /harvest — session may crash.

SUBAGENT MEMORY PROTOCOL:
When spawning Agent tool for research or exploration:
- Include in prompt: synthesize findings into consolidated memory_write(content, type, tags="subagent,<task-topic>") facts
  Assign a descriptive topic tag per subagent (e.g. tags="subagent,auth-review", tags="subagent,perf-analysis")
- Do NOT write each discovery separately — group related findings into cohesive facts
- Write to memory as the LAST step before return, not incrementally — saves turns and tokens
- Each fact must be self-contained with specific details (file paths, values, code snippets)
- When findings relate to specific files, include domain and source_file for better search and staleness detection
- End each fact with 'Search: keyword1, keyword2' — keywords INSIDE the fact survive context compaction
- Record significant negative findings too (e.g. 'no rate limiting exists in src/api/' — prevents repeat searches)
- Return: actionable summary (file paths, function names, specific values) + what was saved + keywords for memory_search
- If MCP tools unavailable or fail → include key findings directly in return text as fallback
- Launch subagents as foreground (default) for reliable MCP access — user can Ctrl+B to background later
Why: without this protocol, subagent returns dump all text into parent context (40K+ tokens).
With protocol, findings go to DB and parent gets ~500 token summary + on-demand memory_search.

BEFORE DEPLOY/PUSH:
- verify_identity(action_type="...") → mandatory safety gate
- If BLOCKED → STOP and ask the user
- If VERIFIED → READ the target server to the user and request confirmation

## VERIFY-BEFORE-ACT
When memory_search returns a fact marked ⚠ STALE:
1. Read the source file and verify the fact still holds
2. If changed → update via memory_write
3. NEVER act on STALE facts without verification

## Process Management (Windows)
- NEVER use `taskkill //F //IM node.exe` — kills ALL Node.js INCLUDING Claude Code CLI!
- Use: `npx kill-port PORT` or find PID via `netstat -ano | findstr :PORT` then `taskkill //F //PID XXXX`

## Git Rules
- Commit often, small atomic changes. Format: "[type] what and why"
- commit = Tier 1 (do it yourself). push = Tier 3 (verify_identity).

## Project DNA: capsule
Stack: React 18.3.0, TypeScript, Tailwind CSS
Style: [unknown]
Structure: .artifacts, .builder, .convex, .fallow, .githooks, .github, codex-plans, convex
Deploy: [NOT SET]
Active: [new session]
Last: [first session]

## Last Session Bridge
Progress: capsule-ralph ralph/wiggum-loop iteration 99 (2026-09-05) — R2-14 re-verified, still blocked on owner key rotation (issue #265, OPEN, zero comments, updatedAt unchanged since 2026-09-03). Fresh live-env precheck with full build-gate flags (--environment production, --require VITE_CONVEX_URL,VITE_CLERK_PUBLISHABLE_KEY, --expected-deployment impartial-mule-193, --env-file + --no-env-files): same 2 blockers only (pk_test_* publishable key, unrecognized secret key); no expected-deployment finding (frontend correctly on impartial-mule-193). Temp env file deleted (zero remain); redacted JSON at .artifacts/release/precheck265.json. Preview verified 7812 serving this checkout (exit 0). Docs-only commit 024fc67 pushed; no new tag. All 11 release-2 ACs PASS, review APPROVED (report6.md), tags through v0.0.70.
Open: owner rotates production Clerk keys → re-run precheck (zero blockers) → CAPSULE_RELEASE_URL=https://capsule-tau-eight.vercel.app bash scripts/release.sh --reviewer gpt-5.6-sol. AC-006/AC-013 J-halves need a session with ANTHROPIC_API_KEY (evidence gaps, not gates).

# === END COGNILAYER ===

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
