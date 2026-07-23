@echo off
setlocal
cd /d "%~dp0"

echo Starting IEEE ITSS Conference Status Dashboard...
echo.
echo Backend:  http://127.0.0.1:8029
echo Frontend: http://127.0.0.1:5191
echo.
echo This launcher will wait until both services answer, then open the dashboard.
echo The launcher window will close automatically after successful startup.
echo The two service windows must remain open while the dashboard is running.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-all.ps1"
if errorlevel 1 (
  echo.
  echo Startup did not complete. Check the visible service windows for the error.
  pause
  exit /b 1
)

echo.
echo Dashboard is running. Closing the launcher...
timeout /t 1 /nobreak >nul
endlocal
exit /b 0
