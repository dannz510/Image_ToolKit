@echo off
REM ============================================================
REM  Dannz AI Studio - stop the dev servers (Vite :3000 + API :8000)
REM ============================================================
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-dev.ps1" %*
echo.
pause
endlocal
