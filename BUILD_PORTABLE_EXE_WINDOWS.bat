@echo off
setlocal EnableExtensions

cd /d "%~dp0"
title QR Factory Offline - BUILD PORTABLE EXE

echo ==========================================
echo QR Factory Offline (Electron) - BUILD PORTABLE EXE
echo ==========================================
echo.

REM --- Find npm.cmd reliably ---
set "NPM_CMD="
if exist "%ProgramFiles%\nodejs\npm.cmd" set "NPM_CMD=%ProgramFiles%\nodejs\npm.cmd"
if not defined NPM_CMD if exist "%ProgramFiles(x86)%\nodejs\npm.cmd" set "NPM_CMD=%ProgramFiles(x86)%\nodejs\npm.cmd"
if not defined NPM_CMD for %%I in (npm.cmd) do set "NPM_CMD=%%~$PATH:I"

if not defined NPM_CMD (
  echo [ERROR] npm.cmd not found. Please (re)install Node.js LTS and make sure "npm -v" works.
  pause
  exit /b 1
)

echo 1) npm install (first time only)...
call "%NPM_CMD%" install
if errorlevel 1 (
  echo [ERROR] npm install failed.
  pause
  exit /b 1
)

echo.
echo 2) Building portable .exe...
call "%NPM_CMD%" run dist:win
if errorlevel 1 (
  echo [ERROR] Build failed.
  pause
  exit /b 1
)

echo.
echo ✅ DONE. Check: %cd%\dist\ for "QR Factory Offline.exe"
pause
