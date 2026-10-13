@echo off
setlocal EnableExtensions
cd /d "%~dp0"
if errorlevel 1 goto :failed
chcp 65001 >nul

where npm >nul 2>nul
if errorlevel 1 goto :missing_node

if exist "node_modules\electron\dist\electron.exe" goto :run
if exist "node_modules\electron\dist\electron" goto :run
echo [INFO] Electron not installed. Running setup...
call "%~dp0安装依赖.bat"
if errorlevel 1 goto :failed

:run
echo [INFO] Starting the Electron desktop app...
call npm start
if errorlevel 1 goto :failed
exit /b 0

:missing_node
echo [ERROR] npm not found. Install Node.js 20+ from https://nodejs.org/
pause
exit /b 1

:failed
echo.
echo [ERROR] Desktop app failed to start. See the errors above.
pause
exit /b 1
