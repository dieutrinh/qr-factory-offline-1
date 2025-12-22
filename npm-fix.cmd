@echo off
setlocal
set "NODE=C:\Program Files\nodejs\node.exe"
set "NPMCLI=C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js"

if not exist "%NODE%" (
  echo [ERROR] node.exe not found at %NODE%
  pause
  exit /b 1
)

if not exist "%NPMCLI%" (
  echo [ERROR] npm-cli.js not found at %NPMCLI%
  echo Your Node installation is missing npm.
  pause
  exit /b 1
)

"%NODE%" "%NPMCLI%" %*
