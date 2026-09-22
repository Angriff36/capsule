' Scheduled task capsule-loop-tick runs this file. It starts loop-tick.cmd with no
' console window, so a tick does not pop up over the owner's work. It WAITS for
' the tick to finish: while it waits the scheduled task counts as running, so a
' tick that outlasts the hour is not joined by a second one (loop-constraints.md:
' one fix at a time). Ticks never run concurrently.
CreateObject("WScript.Shell").Run "cmd /c ""C:\Projects\capsule\.claude\loop-tick.cmd""", 0, True
