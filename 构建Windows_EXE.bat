@echo off
setlocal EnableExtensions
cd /d "%~dp0"
if errorlevel 1 goto :failed
chcp 65001 >nul

where node >nul 2>nul
if errorlevel 1 goto :node_missing
where npm >nul 2>nul
if errorlevel 1 goto :node_missing
node -e "process.exit(parseInt(process.versions.node.split('.')[0], 10) >= 20 ? 0 : 1)"
if errorlevel 1 goto :node_missing

if not exist "node_modules\electron\dist\electron.exe" goto :install_first
if not exist "node_modules\electron-builder\package.json" goto :install_first
goto :check

:install_first
echo [INFO] Required Electron dependencies are missing. Running installer first...
call "%~dp0安装依赖.bat"
if errorlevel 1 goto :failed

:check
echo [INFO] Checking JavaScript syntax...
call npm run check
if errorlevel 1 goto :failed

if not exist "assets\app.ico" goto :missing_icon

rem Electron is mirrored both for npm installation and packaging in China.
set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"
set "ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/"

echo.
echo [INFO] Bundling Python backend then building one Windows portable EXE...
call npm run build:win
if errorlevel 1 goto :failed

if not exist "dist\MusicDownloader-1.0.4-portable.exe" goto :missing_exe

echo [INFO] Extracting actual icon from the built EXE...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0验证EXE图标.ps1" -ExePath "%~dp0dist\MusicDownloader-1.0.4-portable.exe"
if errorlevel 1 goto :icon_error

echo.
echo [OK] Verified Windows executable was created:
echo %~dp0dist\MusicDownloader-1.0.4-portable.exe
echo [INFO] Open dist\EXE实际图标.png to inspect the embedded icon.
pause
exit /b 0

:node_missing
echo [ERROR] Node.js 20+ or npm was not detected.
echo Install Node.js LTS from: https://nodejs.org/
pause
exit /b 1

:missing_icon
echo [ERROR] Icon file not found: assets\app.ico
pause
exit /b 1

:missing_exe
echo [ERROR] Build ended, but the expected EXE was not found.
echo Check the dist directory and npm output above.
pause
exit /b 1

:icon_error
echo [ERROR] EXE was built but icon extraction could not be verified.
echo Inspect dist\MusicDownloader-1.0.4-portable.exe manually.
pause
exit /b 1

:failed
echo.
echo [ERROR] EXE build failed. See the errors above.
pause
exit /b 1
