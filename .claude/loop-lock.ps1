# One writer at a time. The scheduled task starts loop-tick-hidden.vbs every few minutes;
# if the starter was stopped while a round still runs (the round's cmd outlives it), the
# scheduler no longer sees that round. Exit 1 = another loop-tick.cmd is still running.
$mine = $PID
$others = Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" | Where-Object { $_.CommandLine -like '*loop-tick.cmd*' }
if (@($others).Count -gt 1) { exit 1 }
exit 0
