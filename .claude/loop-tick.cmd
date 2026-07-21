@echo off
REM tick-model: GLM 5.2 via z.ai (MiniMax-M3 fallback) - zero Anthropic quota
cd /d C:\Projects\capsule
set BUILDER_DIR=C:\Projectsuilder
type ".claude\loop-tick-prompt.txt" | pwsh -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Ryan\.claude\claude-glm.ps1" -p --dangerously-skip-permissions >> ".claude\loop-tick.log" 2>&1
if errorlevel 1 (
  echo [%date% %time%] GLM tick failed - retrying on MiniMax >> ".claude\loop-tick.log"
  type ".claude\loop-tick-prompt.txt" | pwsh -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Ryan\.claude\claude-minimax.ps1" -p --dangerously-skip-permissions >> ".claude\loop-tick.log" 2>&1
)
