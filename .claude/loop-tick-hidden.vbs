' Scheduled task capsule-loop-tick runs this file. It starts loop-tick.cmd with no
' console window, so a tick does not pop up over the owner's work. It does not wait.
CreateObject("WScript.Shell").Run "cmd /c ""C:\Projects\capsule\.claude\loop-tick.cmd""", 0, False
