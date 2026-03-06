@echo off
setlocal
cd /d "%~dp0"

echo Running stream key fetch for channel "live-test-v1" uid "0"...
node fetchStreamKey.js live-test-v1 0

echo.
echo Done. Press any key to close.
pause >nul
