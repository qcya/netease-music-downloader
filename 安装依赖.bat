@echo off
setlocal EnableExtensions
cd /d "%~dp0"
if errorlevel 1 goto :failed
chcp 65001 >nul

echo [INFO] Checking Node.js and npm...
where node >nul 2>nul
if errorlevel 1 goto :node_missing
where npm >nul 2>nul
if errorlevel 1 goto :node_missing
node -e "process.exit(parseInt(process.versions.node.split('.')[0], 10) >= 20 ? 0 : 1)"
if errorlevel 1 goto :node_missing

echo [INFO] Checking Python 3.10+...
set "PYTHON_CMD="
py -3.10 -c "import sys;assert sys.version_info >= (3,10)" >nul 2>nul
if not errorlevel 1 set "PYTHON_CMD=py -3.10"
if defined PYTHON_CMD goto :python_ready
py -3 -c "import sys;assert sys.version_info >= (3,10)" >nul 2>nul
if not errorlevel 1 set "PYTHON_CMD=py -3"
if defined PYTHON_CMD goto :python_ready
python -c "import sys;assert sys.version_info >= (3,10)" >nul 2>nul
if not errorlevel 1 set "PYTHON_CMD=python"
if not defined PYTHON_CMD goto :python_missing

:python_ready
echo [1/2] Installing Python dependencies...
%PYTHON_CMD% -m pip install -r "skill\requirements.txt"
if errorlevel 1 goto :failed

echo [2/2] Installing Electron dependencies...
echo [INFO] Using npm mirror plus a separate Electron binary mirror.
set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"
set "ELECTRON_CUSTOM_DIR="
set "ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/"

if exist "node_modules\electron\dist\electron.exe" if exist "node_modules\electron-builder\package.json" goto :success

rem npm registry mirror alone cannot solve Electron binary download errors.
call npm install --registry=https://registry.npmmirror.com/ --no-audit --no-fund --fetch-retries=3
if errorlevel 1 goto :retry_backup
if not exist "node_modules\electron\dist\electron.exe" goto :retry_backup
if not exist "node_modules\electron-builder\package.json" goto :retry_backup
goto :success

:retry_backup
echo.
echo [WARN] Primary mirror failed. Retrying with Huawei Cloud Electron mirror...
set "ELECTRON_MIRROR=https://mirrors.huaweicloud.com/electron/"
set "ELECTRON_CUSTOM_DIR={{ version }}"
if exist "node_modules\electron" rmdir /s /q "node_modules\electron"
call npm install --registry=https://registry.npmmirror.com/ --no-audit --no-fund --fetch-retries=3
if errorlevel 1 goto :failed
if not exist "node_modules\electron\dist\electron.exe" goto :binary_missing
if not exist "node_modules\electron-builder\package.json" goto :binary_missing

:success
echo.
echo [OK] Dependencies are installed and Electron binary exists.
echo [INFO] Run the desktop startup BAT, or build the Windows EXE.
pause
exit /b 0

:binary_missing
echo.
echo [ERROR] npm ended but required Electron files are missing.
echo [ERROR] Check node_modules\electron\dist\electron.exe
pause
exit /b 1

:node_missing
echo [ERROR] Node.js 20+ or npm was not detected.
echo Download Node.js LTS from: https://nodejs.org/
pause
exit /b 1

:python_missing
echo [ERROR] Python 3.10+ was not detected.
echo Download Python from: https://www.python.org/downloads/windows/
pause
exit /b 1

:failed
echo.
echo [ERROR] Install failed. Check the connection to the mirror above.
echo [INFO] You may retry this BAT. Do not run the EXE build until install succeeds.
pause
exit /b 1
