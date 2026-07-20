@echo off
chcp 65001 >nul
setlocal

set "APP_DIR=%~dp0"
cd /d "%APP_DIR%"
set "PLAYWRIGHT_BROWSERS_PATH=%APP_DIR%runtime\ms-playwright"

if not exist "%APP_DIR%runtime\node\node.exe" (
  echo 便携版不完整：缺少内置 Node.js。
  echo 请重新解压完整的 Windows 便携包。
  pause
  exit /b 1
)

if not exist "%APP_DIR%node_modules" (
  echo 便携版不完整：缺少程序依赖。
  echo 请重新解压完整的 Windows 便携包。
  pause
  exit /b 1
)

"%APP_DIR%runtime\node\node.exe" local\server.mjs
set "APP_EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%APP_EXIT_CODE%"=="0" echo 下载器异常停止，退出码：%APP_EXIT_CODE%
if "%APP_EXIT_CODE%"=="0" echo 下载器已停止。
pause
exit /b %APP_EXIT_CODE%
