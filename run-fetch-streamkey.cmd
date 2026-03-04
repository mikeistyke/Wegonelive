@echo off
setlocal
cd /d "%~dp0"

set "CHANNEL=%~1"
if "%CHANNEL%"=="" set "CHANNEL=item-001"

set "UID=%~2"
if "%UID%"=="" set "UID=0"

echo Running stream key fetch for channel "%CHANNEL%" uid "%UID%"...
node fetchStreamKey.js %CHANNEL% %UID%

echo.
echo Done. Press any key to close.
pause >nul
