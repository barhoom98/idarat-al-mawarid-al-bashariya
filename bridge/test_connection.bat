@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist bridge_python.cmd (echo Run install_windows.bat first. & pause & exit /b 1)
call bridge_python.cmd
set PYTHONIOENCODING=utf-8
"%PY%" millennium_bridge.py --test
echo.
echo If both steps say OK, start the bridge with start_bridge.bat - or just restart the computer.
pause
