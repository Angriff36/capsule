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
- Commit OFTEN.  One concern per commit; include proof (`bun run check` or a focused subset).
- Never commit `.env.local`, credentials, or `.artifacts/` dumps.
- Do not amend pushed history or force-push `main`.
- **ONE shared branch: `dev` (owner, 2026-09-20; replaces branch-per-task).**
  Every agent and every session works on `dev`. Never create a branch, never
  switch the checkout to another branch (the owner tests on this checkout), and
  never make a worktree unless the owner asks. Start with
  `git pull --no-rebase origin dev`; stage only your own paths; commit and push
  to `dev` at once and often. Nothing pushes to `main` by hand;
  `.githooks/pre-push` blocks it. A `dev` push is a chore: Vercel
  ignores non-`main` refs (`vercel.json` `ignoreCommand`), so it builds nothing
  and never runs `convex deploy`. Dev work talks to the LOCAL Convex backend.
  **Release only when the owner says "release" in the current conversation.**
  Exception: the product builder's approved daily review releases on its own
  (Ryan, 2026-09-28: "once the reviewer clears it it should go to production").
  A release merges `dev` into `main`, via
  `bash scripts/release.sh --reviewer <model>` after the cross-model review APPROVES
  (only when the merge gate requires a review).
  Do not run a duplicate full check before release. To run review alongside the
  final merge check, use `release.sh --prepare --reviewer <model>`, review the
  printed candidate/base, then `release.sh --publish --reviewer <model>` only
  after both validation and independent APPROVE. See AGENTS.md.
  That single push is the only Vercel production build, and the only Convex
  Cloud deploy unless the build runs in self-hosted backend mode
  (`CONVEX_SELF_HOSTED_URL` set → UI-only, no Convex Cloud deploy): Vercel
  builds `main` only for a `[release]` commit, so a merge
  made on GitHub never deploys. `dev` is permanent: the script moves it to the
  release commit and never archives it (any other branch name is still renamed
  to `archive/<branch>`).
- **Production Convex is self-hosted on the owner's Linux box (`pop-os`).** The Vercel
  `main` build is UI-only, so a release that changes manifests or `convex/` is not complete
  until that box deploys the backend from the release commit. **ONE command does the whole
  production release from the work PC: `bash scripts/deploy-production.sh --reviewer <model>`**
  (owner rule, 2026-09-20; runbook `docs/operations/production-backend-deploy.md`). It runs
  `scripts/release.sh`, waits for the Vercel deployment of the release commit, decides by itself
  if the backend changed, and if so runs `scripts/deploy-backend.sh --expect <sha>` ON THE BOX
  over SSH. Use it in place of a bare `scripts/release.sh`. Never run `convex deploy` against
  production from Windows, never write your own deploy command block, never hand the owner a
  copy/paste handoff, and never rediscover the procedure.
- Put diagnostics under `.artifacts/` (gitignored).

## Format gate

Prettier owns format (`bun run format` / `format:check`). It is part of `bun run check`. Do not reintroduce Biome or parallel formatters.

## Baseline

See `BASELINE.md` for enforced vs N/A gates. Coverage thresholds in `vite.config.ts` may only move upward. Branch protection status: `.github/branch-protection.md`.

PRESERVATION RULE:

If an existing visual artifact, PDF page, form, image, UI component, or layout already exists, treat it as immutable unless I explicitly ask for a redesign.

Do not:
- recreate it
- restyle it
- re-typeset it
- redraw it
- simplify it
- substitute a generated approximation
- replace diagrams or graphics
- change spacing, typography, proportions, or layout

Reuse the original asset/component directly and modify only the specific fields or behavior I requested.

If the requested change can be made by overlaying data or wiring existing components, do that instead of rebuilding the artifact.


<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## Component reuse

Storybook is Capsule's reusable component catalog. Before building or changing UI,
read `docs/design/component-catalog.md`, inspect the matching story and implementation,
and reuse the existing component/variant. Follow AGENTS.md's "Component catalog and
reuse" rules. Action dropdowns use `src/ui/DropdownMenu.tsx`; examples live in
`src/ui/DropdownMenu.stories.tsx`. Add colocated stories and update the catalog when
adding a reusable component. `DESIGN.md` remains presentation authority.
