@echo off
cd /d "%~dp0"
if not exist bridge_python.cmd (echo Run install_windows.bat first. & pause & exit /b 1)
call bridge_python.cmd
start "" "%PYW%" "%~dp0millennium_bridge.py"
echo The bridge is running in the background. Its log is bridge.log in this folder.
timeout /t 5 >nul
