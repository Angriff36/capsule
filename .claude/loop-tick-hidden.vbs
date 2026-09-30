' Scheduled task capsule-loop-tick runs this file. It starts loop-tick.cmd with no
' console window, so a round does not pop up over the owner's work. loop-tick.cmd does
' ONE build round; exit code 10 means "a round finished, more work may wait", so the
' next round starts at once - no round limit (Ryan 2026-09-27). Any other exit code
' stops the run until the next scheduled start (every 5 minutes; loop-lock.ps1 keeps it to one runner). It WAITS for each round: while it waits
' the scheduled task counts as running, so a second copy never starts beside it
' (loop-constraints.md: one writer at a time).
Set sh = CreateObject("WScript.Shell")
Do
  rc = sh.Run("cmd /c ""C:\Projects\capsule\.claude\loop-tick.cmd""", 0, True)
Loop While rc = 10
