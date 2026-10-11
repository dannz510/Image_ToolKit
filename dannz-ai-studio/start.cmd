@echo off
REM ============================================================
REM  Dannz AI Studio - double-click launcher
REM  Runs start-dev.ps1 (Python API + Vite) with a bypassed
REM  execution policy, then keeps the window open so you can
REM  read the startup log.
REM ============================================================
setlocal
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-dev.ps1" %*
set "EXITCODE=%ERRORLEVEL%"

echo.
if not "%EXITCODE%"=="0" (
  echo Startup reported problems ^(exit %EXITCODE%^) - scroll up for details.
  pause
  exit /b %EXITCODE%
)

echo Servers are running in the background. This window can be closed.
echo To stop them:  stop-dev.cmd   or   npm run stop
pause
endlocal
