@echo off
setlocal EnableExtensions
chcp 65001 >nul

set "APP_DIR=%~dp0..\.."
for %%I in ("%APP_DIR%") do set "APP_DIR=%%~fI"
set "LOG_DIR=%APP_DIR%\startup_logs"
set "STATE_DIR=%APP_DIR%\.windows-runtime"
set "PLAYWRIGHT_BROWSERS_PATH=%STATE_DIR%\ms-playwright"
set "LOCK_HASH=%STATE_DIR%\package-lock.sha256"
set "LOCK_HASH_TMP=%STATE_DIR%\package-lock.current.sha256"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%" >nul 2>nul
if not exist "%STATE_DIR%" mkdir "%STATE_DIR%" >nul 2>nul
set "LOG_FILE=%LOG_DIR%\startup_%RANDOM%%RANDOM%.log"

echo 启动日志目录：%LOG_DIR%
echo 本次详细日志：%LOG_FILE%
echo 正在检查运行环境，请不要关闭这个窗口...
(
  echo [%DATE% %TIME%] install-and-start.bat
  echo APP_DIR=%APP_DIR%
) > "%LOG_FILE%"

call :main
set "EXIT_CODE=%ERRORLEVEL%"
if "%EXIT_CODE%"=="0" exit /b 0
goto :failed

:main
cd /d "%APP_DIR%"
if errorlevel 1 (
  echo 无法进入程序目录：%APP_DIR%
  echo 无法进入程序目录：%APP_DIR%>> "%LOG_FILE%"
  exit /b 1
)

call :check_node
if not errorlevel 1 goto :node_ready

echo 未检测到 Node.js 20 或更高版本，准备自动安装官方 Node.js LTS...
echo 未检测到 Node.js 20 或更高版本，准备使用 winget 安装。>> "%LOG_FILE%"
call :install_node
if errorlevel 1 exit /b 1
call :refresh_path
call :check_node
if errorlevel 1 (
  echo Node.js 安装后仍无法使用，可能需要重启电脑后再试。
  echo Node.js 安装后复检失败。>> "%LOG_FILE%"
  exit /b 1
)

:node_ready
for /f "delims=" %%V in ('node --version 2^>nul') do set "NODE_VERSION=%%V"
echo 使用 Node.js：%NODE_VERSION%
echo 使用 Node.js：%NODE_VERSION%>> "%LOG_FILE%"

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo 找不到 npm.cmd，请重新安装 Node.js LTS。
  echo 找不到 npm.cmd。>> "%LOG_FILE%"
  exit /b 1
)

if not exist "%APP_DIR%\package-lock.json" (
  echo 程序包不完整：缺少 package-lock.json。
  echo 缺少 package-lock.json。>> "%LOG_FILE%"
  exit /b 1
)

certutil -hashfile "%APP_DIR%\package-lock.json" SHA256 > "%LOCK_HASH_TMP%" 2>> "%LOG_FILE%"
if errorlevel 1 (
  echo 无法计算依赖清单校验值。
  exit /b 1
)

if not exist "%LOCK_HASH%" goto :install_dependencies
fc /b "%LOCK_HASH%" "%LOCK_HASH_TMP%" >nul 2>> "%LOG_FILE%"
if errorlevel 1 goto :install_dependencies

call :verify_dependencies
if errorlevel 1 goto :install_dependencies
del "%LOCK_HASH_TMP%" >nul 2>nul
goto :launch

:install_dependencies
echo 首次启动或程序依赖已更新，正在联网安装，可能需要几分钟...
echo 开始安装依赖。>> "%LOG_FILE%"
call npm.cmd ci --omit=dev --no-audit --no-fund >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
  echo npm 依赖安装失败，请检查网络连接。
  exit /b 1
)

echo 正在安装 Chromium 浏览器组件...
call "%APP_DIR%\node_modules\.bin\playwright.cmd" install chromium >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
  echo Chromium 安装失败，请检查网络连接。
  exit /b 1
)

echo 正在安装视频下载组件...
node scripts\install-tools.mjs >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
  echo 视频下载组件安装失败，请检查网络连接。
  exit /b 1
)

call :verify_dependencies
if errorlevel 1 (
  echo 依赖安装完成，但组件完整性检查失败。
  exit /b 1
)
move /y "%LOCK_HASH_TMP%" "%LOCK_HASH%" >nul
if errorlevel 1 (
  echo 无法保存安装状态，请确认程序目录可写。
  exit /b 1
)

:launch
if not exist "%APP_DIR%\export" mkdir "%APP_DIR%\export" >nul 2>nul
echo.
echo 正在启动高清视频下载器：http://127.0.0.1:3210
echo 浏览器未自动打开时，请手动访问：http://127.0.0.1:3210
echo 视频保存在：%APP_DIR%\export
echo 服务运行中；关闭此窗口会停止服务。
echo [%DATE% %TIME%] 启动本地服务。>> "%LOG_FILE%"
node local\server.mjs >> "%LOG_FILE%" 2>&1
exit /b %ERRORLEVEL%

:check_node
where node >nul 2>nul
if errorlevel 1 exit /b 1
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 20 ? 0 : 1)" >nul 2>> "%LOG_FILE%"
exit /b %ERRORLEVEL%

:install_node
winget --version >nul 2>> "%LOG_FILE%"
if errorlevel 1 (
  echo 当前电脑没有 winget，无法自动安装 Node.js。
  echo 请从 https://nodejs.org/ 手动安装 Node.js LTS 后重新双击 START_HERE.bat。
  echo winget 不可用。>> "%LOG_FILE%"
  exit /b 1
)

winget install --exact --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements --force >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
  echo winget 安装 Node.js LTS 失败。
  exit /b 1
)
exit /b 0

:refresh_path
set "USER_PATH="
set "MACHINE_PATH="
for /f "tokens=2,*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USER_PATH=%%B"
for /f "tokens=2,*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "MACHINE_PATH=%%B"
if defined USER_PATH call set "PATH=%%USER_PATH%%;%%PATH%%"
if defined MACHINE_PATH call set "PATH=%%MACHINE_PATH%%;%%PATH%%"
exit /b 0

:verify_dependencies
if not exist "%APP_DIR%\node_modules" exit /b 1
node -e "const fs=require('fs');const {chromium}=require('playwright');const files=[chromium.executablePath(),'tools/yt-dlp.exe',require('ffmpeg-static'),require('ffprobe-static').path];process.exit(files.every((file)=>file&&fs.existsSync(file))?0:1)" >> "%LOG_FILE%" 2>&1
exit /b %ERRORLEVEL%

:failed
echo.
echo 启动失败，错误码：%EXIT_CODE%
echo 详细日志：%LOG_FILE%
echo 请检查网络后重新双击 START_HERE.bat；仍失败时把日志文件发给维护者。
echo.
pause
exit /b %EXIT_CODE%
