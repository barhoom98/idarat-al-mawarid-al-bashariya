@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
python millennium_bridge.py --test
echo.
echo If both steps say OK, start the bridge now with start_bridge.bat (or restart the computer).
pause
