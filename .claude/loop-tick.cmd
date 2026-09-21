@echo off
REM tick-model: GLM 5.2 via z.ai (MiniMax-M3 fallback) - zero Anthropic quota
REM Each round: the MAKER makes one fix and stops; then loop-land.ps1 (plain code +
REM a reviewer from a different provider) checks it and lands it on dev. The maker
REM never checks or lands its own work. Up to 4 rounds per tick; a round with no
REM hand-off file means the maker found nothing to do, so the tick ends.
REM The maker runs with permission checks ON: settings.local.json is its allowlist,
REM loop-maker-settings.json adds the maker-only deny list (no push, no PRs, no self-review).
cd /d C:\Projects\capsule
set BUILDER_DIR=C:\Projects\builder
for /L %%i in (1,1,4) do (
  findstr /C:"loop-pause-all" STATE.md >nul 2>&1 && exit /b 0
  echo [%date% %time%] tick round %%i start >> ".claude\loop-tick.log"
  type ".claude\loop-tick-prompt.txt" | pwsh -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Ryan\.claude\claude-glm.ps1" -p --settings ".claude\loop-maker-settings.json" >> ".claude\loop-tick.log" 2>&1
  if errorlevel 1 (
    echo [%date% %time%] GLM tick failed - retrying on MiniMax >> ".claude\loop-tick.log"
    type ".claude\loop-tick-prompt.txt" | pwsh -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Ryan\.claude\claude-minimax.ps1" -p --settings ".claude\loop-maker-settings.json" >> ".claude\loop-tick.log" 2>&1
  )
  if not exist ".loop-worktrees\_handoff\*.json" exit /b 0
  pwsh -NoProfile -ExecutionPolicy Bypass -File ".claude\loop-land.ps1" >> ".claude\loop-tick.log" 2>&1
)
