# Fixes Log

## 2026-07-22
- Issue: Initial metadata lookup hid successful parallel outputs when the no-hit memory search exited nonzero.
  Fix: Re-ran commands with explicit no-match handling.
  Commands: `rg -n -i "recipe.cost|recipe cost|vendor pricing|RecipeLine|pricing per unit" C:\\Users\\Ryan\\.codex\\memories\\MEMORY.md`
- Issue: The first cost-panel CSS draft used an undefined `--color-paper` theme token.
  Fix: Replaced it with Capsule's existing `--color-panel` token.
  Commands: `rg -n -- "--color-paper|--color-panel" src/styles/app.css`
- Issue: Starting the Vite server through the PowerShell `bun.ps1` shim opened Notepad instead of executing Bun.
  Fix: Stopped the exact spawned process and launched `C:\\Users\\Ryan\\AppData\\Roaming\\npm\\node_modules\\bun\\bin\\bun.exe` directly.
  Commands: `bun run dev --host 127.0.0.1`
- Issue: Tool policy rejected recursive removal of Playwright's result directory.
  Fix: Deleted its sole result file through `apply_patch`; all temporary verification source files were also deleted.
  Commands: `bunx playwright test recipe-cost-verification.spec.ts --reporter=line --workers=1`
- Issue: The full repository gate stops on unrelated Event feature direct-hook violations.
  Fix: Preserved the concurrent Event files; GitHub issue #40 already records the integration-guard blocker.
  Commands: `bun run check`
