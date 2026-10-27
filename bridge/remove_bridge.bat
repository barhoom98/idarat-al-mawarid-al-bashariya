@echo off
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -like 'python*' -and $_.CommandLine -like '*millennium_bridge.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }; Remove-Item -LiteralPath (Join-Path ([Environment]::GetFolderPath('Startup')) 'Millennium HR Bridge.lnk') -ErrorAction SilentlyContinue"
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\millennium_bridge.vbs" >nul 2>nul
echo The bridge is stopped and will no longer start with Windows.
echo You can delete this folder now. The fingerprint device and the ZKTeco program were never changed.
pause
