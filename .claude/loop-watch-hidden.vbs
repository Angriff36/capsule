' Scheduled task capsule-builder-watch runs this file every hour. It starts loop-watch.cmd
' with no console window and waits for it, so two watches never run at once.
Set sh = CreateObject("WScript.Shell")
sh.Run "cmd /c ""C:\Projects\capsule\.claude\loop-watch.cmd""", 0, True
