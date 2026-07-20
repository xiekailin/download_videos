@echo off
setlocal EnableExtensions
chcp 65001 >nul
call "%~dp0scripts\windows-online\install-and-start.bat"
exit /b %ERRORLEVEL%
