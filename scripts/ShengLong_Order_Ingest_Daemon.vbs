Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "python C:\Gass\scripts\shenglong_order_ingest_daemon.py --interval 5", 0, False
