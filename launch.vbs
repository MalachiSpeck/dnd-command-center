Set WshShell = CreateObject("WScript.Shell")
' Run the batch file in hidden mode (0 = hidden, False = don't wait for completion)
WshShell.Run """C:\Users\mattm\Desktop\dnd-command-center\start_server.bat""", 0, False
