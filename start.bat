@echo off
chcp 65001 >nul
cd /d "%~dp0"

if not exist node_modules (
  echo 尚未安装，请先双击 setup.bat。
  pause
  exit /b 1
)

call npm start
echo.
echo 下载器已停止。
pause
