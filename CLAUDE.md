# CapsuleX — agent ruleset

Behavioral rules for automated contributors. Commands live in `AGENTS.md`. System truth lives under `docs/`.

## Truth split

| File                                                  | Owns                                               |
| ----------------------------------------------------- | -------------------------------------------------- |
| `CLAUDE.md`                                           | How to behave                                      |
| `AGENTS.md`                                           | How to run / maintain                              |
| `docs/architecture/*`, `docs/systems/*`               | What the system is                                 |
| `docs/generation/manifest-builder.md`, `PRESET.md`    | How the repo is produced                           |
| `docs/generation/2026-07-16-dx-proof-kit-boundary.md` | Proof-kit ownership + exact Manifest pin (Binding) |
| `README.md`                                           | Human on-ramp + links                              |

## Boundaries

- Preserve generated boundaries. Never hand-edit Manifest/Convex generated trees.
- When unsure whether a file is generated, check `docs/generation/manifest-builder.md` and `PRESET.md` before editing.
- If regeneration would clobber an author seam (`convex/lib/**`, `convex/auth.config.ts`, `convex/authStatus.ts`), stop — do not “fix” generated output by hand.
- Feature work belongs in `src/features/**` plus author Convex seams only.
- Import Convex through `src/lib/api.ts`.

## Engineering

- Prefer small, single-responsibility files (OOP/SRP). Split before a file approaches ~400 lines.
- No drive-by refactors unrelated to the task.
- Do not weaken TypeScript strictness, delete failing tests, or remove gates to go green.
- Do not add tools that are not wired into `bun run check` / CI.
- Do not invent a second package manager lockfile (`package-lock.json` is rejected).

## Process

- Use `docs/` as architecture truth; keep `AGENTS.md` mechanical (commands only).
- Commit only when asked. One concern per commit; include proof (`bun run check` or a focused subset).
- Never commit `.env.local`, credentials, or `.artifacts/` dumps.
- Do not amend pushed history or force-push `main`.
- Put diagnostics under `.artifacts/` (gitignored).

## Format gate

Prettier owns format (`bun run format` / `format:check`). It is part of `bun run check`. Do not reintroduce Biome or parallel formatters.

## Baseline

See `BASELINE.md` for enforced vs N/A gates. Coverage thresholds in `vite.config.ts` may only move upward. Branch protection status: `.github/branch-protection.md`.
