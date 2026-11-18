@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title IDF 3D Model Platform
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-Platform.ps1"
if errorlevel 1 (
  echo.
  echo The IDF platform could not be started. Review the message above.
  pause
)
