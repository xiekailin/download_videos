@echo off
setlocal EnableExtensions
chcp 65001 >nul

set "INSTALLER=%~dp0scripts\windows-online\install-and-start.bat"

if not exist "%INSTALLER%" (
  echo Startup failed: installer script was not found.
  echo Please extract the complete ZIP before running START_HERE.bat.
  echo Missing file: "%INSTALLER%"
  echo.
  pause
  exit /b 1
)

rem Run the installer in a child CMD process so an early parser error cannot close this window.
cmd.exe /d /c call "%INSTALLER%"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo Startup failed, exit code: %EXIT_CODE%
  echo Please send the newest file under startup_logs to the maintainer.
  echo.
  pause
  exit /b %EXIT_CODE%
)

echo.
echo The downloader has stopped.
echo If this appeared immediately, check the newest file under startup_logs.
echo.
pause
exit /b 0
