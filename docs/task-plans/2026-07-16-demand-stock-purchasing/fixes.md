# Fixes Log

## 2026-07-16

- Issue: Required Superpowers bootstrap executable is absent.
  Fix: Logged the missing environment capability and continued with available repository instructions.
  Command: `~/.codex/superpowers/.codex/superpowers-codex bootstrap`

- Issue: Git grouped the Culinary documentation and a pre-existing projection-status line in one interactive hunk.
  Fix: Reset only `docs/generation/manifest-builder.md` in the index, split the hunk, and staged only the Culinary block.
  Commands: `git reset HEAD -- docs/generation/manifest-builder.md`; `git add -p -- docs/generation/manifest-builder.md`

- Issue: Repository formatting gate detected the new temporary planning markdown files.
  Fix: Format only `codex-plans/*.md`; keep them outside the Kitchen commit and archive after the next slice.
  Command: `bunx prettier --write codex-plans/*.md`

- Issue: Local full gate reaches baseline decay with 43 root entries because preserved untracked/ignored workspace entries count toward the cap.
  Fix: Keep those files untouched and verify the committed tree in an isolated clean worktree; HEAD has only 32 tracked root entries.
  Commands: `git ls-tree --name-only HEAD`; post-commit `git worktree add` and `bun run check`

- Issue: First isolated Windows worktree showed 92 Prettier failures across nearly every text file.
  Fix: Treat this as checkout-wide CRLF conversion, inspect Git line-ending configuration, and recreate the disposable worktree with `core.autocrlf=false` before rerunning the gate.
  Command: `git config --show-origin core.autocrlf`

# Fixes and recoveries

- A probe guessed two Kitchen hook/lifecycle filenames that do not exist. Resolve paths with `rg --files src/features/kitchen` before reading analogous authored patterns; no repository files were changed by the failed read.
- A second probe guessed `navigationCatalog.ts` and `AppShell.tsx`; actual paths must be resolved under `src/app` before reading. The useful `App.tsx` and mutation search still completed.
- A style probe guessed `src/index.css`; actual stylesheet paths should be resolved with `rg --files src/styles` before editing. The DESIGN contract was read successfully.
- Launching the Bun shim directly with `Start-Process` failed because `bun.ps1` is not a Win32 executable. Launching that shim through a hidden PowerShell process started Vite successfully; the temporary process was stopped after browser discovery found no attached backend.
- The local full gate reached baseline decay and failed on 43 root entries versus cap 38 because preserved unrelated untracked artifacts are present. Verify the isolated commit in a clean `core.autocrlf=false` worktree, as with Kitchen.
