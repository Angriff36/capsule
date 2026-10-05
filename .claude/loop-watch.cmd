@echo off
REM HOURLY BUILDER WATCH (Ryan 2026-10-02: "make it so you wake up every hour to check on it",
REM "make it survive"). Scheduled task capsule-builder-watch runs loop-watch-hidden.vbs every
REM hour; this starts one Claude session with loop-watch-prompt.txt. It survives restarts.
REM Its output goes to its own log, never to loop-tick.log.
cd /d C:\Projects\capsule
echo [%date% %time%] watch start >> ".claude\loop-watch.log"
type ".claude\loop-watch-prompt.txt" | "C:\Users\Ryan\.local\bin\claude.exe" -p --model claude-opus-5-5 --dangerously-skip-permissions >> ".claude\loop-watch.log" 2>&1
echo [%date% %time%] watch end rc=%ERRORLEVEL% >> ".claude\loop-watch.log"
exit /b 0
