@echo off
chcp 65001 >nul
title ConcreZip - Conversor Word
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "& ([scriptblock]::Create((Get-Content -LiteralPath '%~dp0ConcreZip.WordBridge.ps1' -Raw -Encoding UTF8)))"
if errorlevel 1 pause
