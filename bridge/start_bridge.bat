@echo off
cd /d "%~dp0"
start "" pythonw "%~dp0millennium_bridge.py"
echo The bridge is running in the background. Its log is bridge.log in this folder.
timeout /t 5 >nul
