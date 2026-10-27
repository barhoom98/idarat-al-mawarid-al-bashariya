@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==== Millennium HR - fingerprint bridge setup ====
where python >nul 2>nul
if errorlevel 1 (
  echo.
  echo Python is not installed.
  echo Install it from https://www.python.org/downloads/ and tick "Add python.exe to PATH", then run this file again.
  pause
  exit /b 1
)
python -m pip install --upgrade pyzk
if errorlevel 1 (
  echo Could not install pyzk. Check the internet connection and run this file again.
  pause
  exit /b 1
)
if not exist config.ini copy config.example.ini config.ini >nul
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
> "%STARTUP%\millennium_bridge.vbs" echo Set WshShell = CreateObject("WScript.Shell")
>> "%STARTUP%\millennium_bridge.vbs" echo WshShell.Run "pythonw ""%~dp0millennium_bridge.py""", 0, False
echo.
echo Done. The bridge will start automatically every time Windows starts.
echo Next: open config.ini, set the device IP and the key, then run test_connection.bat
notepad config.ini
pause
