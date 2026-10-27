@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
echo ==== Millennium HR - fingerprint bridge setup ====
echo This only installs a small reader program. Nothing on the fingerprint device or in the ZKTeco program is changed.
echo.
set "PYEXE="
for /f "delims=" %%P in ('py -3 -c "import sys;print(sys.executable)" 2^>nul') do set "PYEXE=%%P"
if not defined PYEXE for /f "delims=" %%P in ('python -c "import sys;print(sys.executable)" 2^>nul') do set "PYEXE=%%P"
if defined PYEXE if not exist "%PYEXE%" set "PYEXE="
if not defined PYEXE goto nopython
for %%D in ("%PYEXE%") do set "PYW=%%~dpDpythonw.exe"
if not exist "%PYW%" set "PYW=%PYEXE%"
echo Python found: %PYEXE%
echo.
"%PYEXE%" -m pip install --upgrade pyzk
if errorlevel 1 goto nopip
> "%~dp0bridge_python.cmd" echo @set "PY=%PYEXE%"
>> "%~dp0bridge_python.cmd" echo @set "PYW=%PYW%"
if not exist config.ini copy config.example.ini config.ini >nul
set "BR=%~dp0"
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\millennium_bridge.vbs" >nul 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "$q=[char]34; $l=Join-Path ([Environment]::GetFolderPath('Startup')) 'Millennium HR Bridge.lnk'; $s=(New-Object -ComObject WScript.Shell).CreateShortcut($l); $s.TargetPath=$env:PYW; $s.Arguments=$q+$env:BR+'millennium_bridge.py'+$q; $s.WorkingDirectory=$env:BR; $s.Save()"
if errorlevel 1 goto noshortcut
echo.
echo Done. The bridge will start by itself every time this computer starts.
findstr /c:"PASTE-THE-KEY-HERE" config.ini >nul && (echo Now put the device IP and the key in config.ini, save it, then run test_connection.bat & notepad config.ini & pause & exit /b 0)
echo config.ini is already filled in.
echo Next step: run test_connection.bat
pause
exit /b 0

:nopython
echo Python is not installed on this computer.
echo 1. Open https://www.python.org/downloads/windows/
echo 2. Download "Windows installer 64-bit" of the newest Python 3 release.
echo 3. On the first screen tick "Add python.exe to PATH", then click Install Now.
echo 4. Run this file again.
pause
exit /b 1

:nopip
echo.
echo Could not install the pyzk library. Check the internet connection and run this file again.
pause
exit /b 1

:noshortcut
echo.
echo Could not add the bridge to Windows startup. The bridge still works: run start_bridge.bat after each restart.
pause
exit /b 1
