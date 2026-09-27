@echo off
REM tick-model: Opus 5.5 on the Anthropic plan (GLM 5.3 flash, then MiniMax-M3 fallback) - Ryan 2026-09-25
REM PRODUCT BUILDER - ONE ROUND per call: the MAKER works one capability from
REM IMPLEMENTATION_PLAN.md up to a review checkpoint and stops; then loop-land.ps1 (plain
REM code + a reviewer from a different provider) checks it and lands it on dev. The maker
REM never checks or lands its own work. Exit 10 = a round finished and more work may wait;
REM loop-tick-hidden.vbs then starts the next round at once, with NO round limit (Ryan
REM 2026-09-27: do not stop because "a scheduler tick or artificial round count was
REM reached"). Exit 0 = stop: no hand-off (nothing open, or all that is left is blocked),
REM loop-pause-all is set, or no reviewer can answer. (No for /L loop: exit /b inside
REM for /L keeps counting, and goto labels are unreliable in LF files.)
REM The maker runs with permission checks ON: settings.local.json is its allowlist,
REM loop-maker-settings.json adds the maker-only deny list (no push, no PRs, no self-review).
cd /d C:\Projects\capsule
set BUILDER_DIR=C:\Projects\builder
findstr /C:"loop-pause-all" STATE.md >nul 2>&1 && exit /b 0
REM A hand-off left from an earlier run (no reviewer was available) is reviewed
REM again BEFORE new work starts. Still no reviewer -> stop this run; making
REM more work that nothing can review just burns the maker's plan.
if exist ".loop-worktrees\_handoff\*.json" (
  pwsh -NoProfile -ExecutionPolicy Bypass -File ".claude\loop-land.ps1" >> ".claude\loop-tick.log" 2>&1
  if exist ".loop-worktrees\_handoff\*.json" (
    echo [%date% %time%] no reviewer available - work kept, run ends >> ".claude\loop-tick.log"
    exit /b 0
  )
)
echo [%date% %time%] build round start >> ".claude\loop-tick.log"
type ".claude\loop-tick-prompt.txt" | claude -p --model claude-opus-5-5 --settings ".claude\loop-maker-settings.json" >> ".claude\loop-tick.log" 2>&1
if errorlevel 1 (
  echo [%date% %time%] Opus tick failed - retrying on GLM flash >> ".claude\loop-tick.log"
  REM On the GLM plan the haiku alias maps to glm-5.3-flash.
  type ".claude\loop-tick-prompt.txt" | pwsh -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Ryan\.claude\claude-glm.ps1" -p --model haiku --settings ".claude\loop-maker-settings.json" >> ".claude\loop-tick.log" 2>&1
  if errorlevel 1 (
    echo [%date% %time%] GLM flash tick failed - retrying on MiniMax >> ".claude\loop-tick.log"
    type ".claude\loop-tick-prompt.txt" | pwsh -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Ryan\.claude\claude-minimax.ps1" -p --settings ".claude\loop-maker-settings.json" >> ".claude\loop-tick.log" 2>&1
  )
)
if not exist ".loop-worktrees\_handoff\*.json" exit /b 0
pwsh -NoProfile -ExecutionPolicy Bypass -File ".claude\loop-land.ps1" >> ".claude\loop-tick.log" 2>&1
exit /b 10
