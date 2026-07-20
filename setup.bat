@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo 未检测到 Node.js。请先安装 Node.js 20 或更高版本：https://nodejs.org/
  pause
  exit /b 1
)

echo 正在安装网页下载器…
call npm ci
if errorlevel 1 goto :error
call npx playwright install chromium
if errorlevel 1 goto :error
node scripts\install-tools.mjs
if errorlevel 1 goto :error
if not exist export mkdir export

echo.
echo 安装完成。以后双击 start.bat 即可使用。
pause
exit /b 0

:error
echo.
echo 安装失败，请检查网络后重新运行 setup.bat。
pause
exit /b 1
