@echo off
powershell -NoProfile -ExecutionPolicy Bypass -Command "$n=0; Get-CimInstance Win32_Process | Where-Object { $_.Name -like 'python*' -and $_.CommandLine -like '*millennium_bridge.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; $n++ }; if ($n) { 'The bridge is stopped.' } else { 'The bridge was not running.' }"
echo Nothing is lost while it is stopped: missed punches are sent when it starts again.
echo To start it again: start_bridge.bat - or restart the computer.
pause
