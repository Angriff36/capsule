@echo off
REM Capsule PRODUCT loop - Ralph-style shift: 4 back-to-back iterations, fresh
REM context each, one backlog item -> one draft PR per iteration.
REM Model: GLM 5.2 via z.ai (MiniMax-M3 fallback) - zero Anthropic quota.
REM Scheduled task: capsule-product-loop. Kill: schtasks /delete /tn capsule-product-loop /f
REM (or add a loop-pause-all line to STATE.md - checked at each iteration start).
cd /d C:\Projects\capsule
set BUILDER_DIR=C:\Projectsuilder
for /L %%i in (1,1,4) do (
  echo [%date% %time%] product-loop iteration %%i start >> ".claude\product-loop.log"
  type "PROMPT-product.md" | pwsh -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Ryan\.claude\claude-glm.ps1" -p --dangerously-skip-permissions >> ".claude\product-loop.log" 2>&1
  if errorlevel 1 (
    echo [%date% %time%] GLM failed on iteration %%i - retrying on MiniMax >> ".claude\product-loop.log"
    type "PROMPT-product.md" | pwsh -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Ryan\.claude\claude-minimax.ps1" -p --dangerously-skip-permissions >> ".claude\product-loop.log" 2>&1
  )
  findstr /C:"loop-pause-all" STATE.md >nul 2>&1 && exit /b 0
)
