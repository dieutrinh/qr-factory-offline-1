@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "LOG=%~dp0run.log"
echo =============================== > "%LOG%"
echo Started: %DATE% %TIME%>> "%LOG%"
echo Folder:  %CD%>> "%LOG%"
echo ===============================>> "%LOG%"

echo.
echo =========================================
echo  QR Factory Offline (Electron) - RUN APP
echo =========================================
echo.

REM --- Always use local npm wrapper to avoid broken npm.cmd ---
set "NPM_CMD=%~dp0npm-fix.cmd"

if not exist "%NPM_CMD%" (
  echo [ERROR] Missing "%NPM_CMD%">> "%LOG%"
  echo [ERROR] Missing npm-fix.cmd in project folder.
  echo Please create: %NPM_CMD%
  echo.
  pause
  exit /b 1
)

echo Using: %NPM_CMD%
echo.

echo 1) Checking NPM...
call "%NPM_CMD%" -v >> "%LOG%" 2>&1
if errorlevel 1 (
  echo [ERROR] npm check failed.>> "%LOG%"
  echo [ERROR] npm check failed. Open run.log
  pause
  exit /b 1
)

echo 2) Installing (first time only)...
call "%NPM_CMD%" install >> "%LOG%" 2>&1
if errorlevel 1 (
  echo [ERROR] npm install failed.>> "%LOG%"
  echo [ERROR] npm install failed. Open run.log
  pause
  exit /b 1
)

echo 3) Starting app...
call "%NPM_CMD%" start >> "%LOG%" 2>&1
if errorlevel 1 (
  echo [ERROR] npm start failed.>> "%LOG%"
  echo [ERROR] npm start failed. Open run.log
  pause
  exit /b 1
)

echo.
echo If app opened, you can close this window.
echo Log: "%LOG%"
pause
