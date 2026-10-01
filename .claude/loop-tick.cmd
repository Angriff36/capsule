@echo off
REM tick-model: Opus 5.5 on the Anthropic plan (GLM 5.3 flash, then MiniMax-M3 fallback) - Ryan 2026-09-25
REM PRODUCT BUILDER - ONE ROUND per call. The MAKER builds all day in one batch worktree
REM with no review in between. Once a day loop-review-due.ps1 opens the review; from then on
REM each round the maker answers the review and hands off, and loop-land.ps1 (plain code +
REM a reviewer from a different provider) checks the whole batch at once, round after round,
REM until it approves; APPROVE releases dev to production. loop-publish.ps1 puts each
REM round on dev at once, before review (Ryan 2026-09-28). The maker never checks or lands
REM its own work. Exit 10 = a round finished and more work may wait; loop-tick-hidden.vbs
REM then starts the next round at once, with NO round limit (Ryan 2026-09-27). Exit 0 = stop:
REM the maker wrote _nothing-left (nothing open, or all that is left is blocked), every maker
REM model failed, loop-pause-all is set, or no reviewer can answer. (No for /L loop: exit /b
REM inside for /L keeps counting, and goto labels are unreliable in LF files.)
REM The maker runs with permission checks ON: settings.local.json is its allowlist,
REM loop-maker-settings.json adds the maker-only deny list (no push, no PRs, no self-review).
cd /d C:\Projects\capsule
set BUILDER_DIR=C:\Projects\builder
findstr /C:"loop-pause-all" STATE.md >nul 2>&1 && exit /b 0
pwsh -NoProfile -ExecutionPolicy Bypass -File ".claude\loop-lock.ps1" || exit /b 0
if exist ".loop-worktrees\_nothing-left" del ".loop-worktrees\_nothing-left"
pwsh -NoProfile -ExecutionPolicy Bypass -File ".claude\loop-review-due.ps1" >> ".claude\loop-tick.log" 2>&1
REM A hand-off left from an earlier run (no reviewer was available) is reviewed
REM again BEFORE new work starts. Still no reviewer -> stop this run.
if exist ".loop-worktrees\_handoff\*.json" (
  pwsh -NoProfile -ExecutionPolicy Bypass -File ".claude\loop-land.ps1" >> ".claude\loop-tick.log" 2>&1
  if exist ".loop-worktrees\_handoff\*.json" (
    echo [%date% %time%] no reviewer available - work kept, run ends >> ".claude\loop-tick.log"
    exit /b 0
  )
)
REM CONTROL-PLANE BLOCKER (Ryan 2026-09-29): a problem in the loop itself is fixed by the
REM separate repair process, never by the maker. No new input = no model wakes, nothing logged.
if exist ".loop-worktrees\_control-blocker.json" pwsh -NoProfile -ExecutionPolicy Bypass -File ".claude\loop-repair.ps1" >> ".claude\loop-tick.log" 2>&1
if exist ".loop-worktrees\_control-blocker.json" exit /b 0
REM Ryan's comments on the live site become issues the maker works first, and are
REM marked done when the fix is live (Ryan 2026-10-01). Never stops the round.
pwsh -NoProfile -ExecutionPolicy Bypass -File ".claude\loop-site-comments.ps1"
echo [%date% %time%] build round start >> ".claude\loop-tick.log"
set MAKEROK=1
type ".claude\loop-tick-prompt.txt" | claude -p --model claude-opus-5-5 --settings ".claude\loop-maker-settings.json" >> ".claude\loop-tick.log" 2>&1
if errorlevel 1 (
  echo [%date% %time%] Opus round failed - retrying on GLM flash >> ".claude\loop-tick.log"
  REM On the GLM plan the haiku alias maps to glm-5.3-flash.
  type ".claude\loop-tick-prompt.txt" | pwsh -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Ryan\.claude\claude-glm.ps1" -p --model haiku --settings ".claude\loop-maker-settings.json" >> ".claude\loop-tick.log" 2>&1
  if errorlevel 1 (
    echo [%date% %time%] GLM flash round failed - retrying on MiniMax >> ".claude\loop-tick.log"
    type ".claude\loop-tick-prompt.txt" | pwsh -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Ryan\.claude\claude-minimax.ps1" -p --settings ".claude\loop-maker-settings.json" >> ".claude\loop-tick.log" 2>&1
    if errorlevel 1 set MAKEROK=0
  )
)
if exist ".loop-worktrees\_nothing-left" exit /b 0
if "%MAKEROK%"=="0" exit /b 0
REM Every round goes to dev at once so Ryan can test it (Ryan 2026-09-28).
pwsh -NoProfile -ExecutionPolicy Bypass -File ".claude\loop-publish.ps1" >> ".claude\loop-tick.log" 2>&1
if exist ".loop-worktrees\_handoff\*.json" pwsh -NoProfile -ExecutionPolicy Bypass -File ".claude\loop-land.ps1" >> ".claude\loop-tick.log" 2>&1
exit /b 10
