@echo off
setlocal
cd /d "%~dp0"

echo Starting IEEE ITSS Conference Status Dashboard...
echo.
echo Backend:  http://127.0.0.1:8029
echo Frontend: http://127.0.0.1:5191
echo.
echo Two visible PowerShell service windows will open.
echo This launcher will wait until both services answer, then open the dashboard.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-all.ps1"
if errorlevel 1 (
  echo.
  echo Startup did not complete. Check the visible service windows for the error.
  pause
  exit /b 1
)

echo.
echo Dashboard is running. Leave the service windows open while using it.
pause
endlocal
