@echo off
setlocal
set "PACKAGE_ROOT=%~dp0"
set "BACKEND=%PACKAGE_ROOT%resources\backend\music_backend.exe"
if not exist "%BACKEND%" set "BACKEND=%PACKAGE_ROOT%backend\music_backend.exe"
if not exist "%BACKEND%" (
  >&2 echo Bundled music backend was not found. Run this command from the extracted player package.
  exit /b 2
)
for /f "tokens=2 delims=:" %%C in ('chcp') do set "AGENT_ORIGINAL_CODEPAGE=%%C"
chcp 65001 >nul
if not defined NETEASE_SKILL_STATE_DIR set "NETEASE_SKILL_STATE_DIR=%PACKAGE_ROOT%缓存\agent"
if not defined NETEASE_DOWNLOAD_DIR set "NETEASE_DOWNLOAD_DIR=%PACKAGE_ROOT%下载"
if not exist "%NETEASE_SKILL_STATE_DIR%" mkdir "%NETEASE_SKILL_STATE_DIR%" >nul 2>nul
if not exist "%NETEASE_DOWNLOAD_DIR%" mkdir "%NETEASE_DOWNLOAD_DIR%" >nul 2>nul
if defined AGENT_ORIGINAL_CODEPAGE chcp %AGENT_ORIGINAL_CODEPAGE% >nul
"%BACKEND%" %*
exit /b %ERRORLEVEL%
