param()

$ErrorActionPreference = "Stop"
$nativeDirectory = $PSScriptRoot
$projectDirectory = Split-Path -Parent $nativeDirectory
$sourcePath = Join-Path $nativeDirectory "ConcreZip.WordBridge.ps1"
$launcherPath = Join-Path $nativeDirectory "Iniciar Conversor Word.cmd"
$archivePath = Join-Path $projectDirectory "public\concrezip-conversor-word.zip"

$batchHeader = @'
@echo off
setlocal
chcp 65001 >nul
title ConcreZip - Conversor Word
set "CONCREZIP_LAUNCHER=%~f0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$source = [IO.File]::ReadAllText($env:CONCREZIP_LAUNCHER, [Text.Encoding]::UTF8); $marker = '# CONCREZIP_POWERSHELL_PAYLOAD'; $markerIndex = $source.LastIndexOf($marker, [StringComparison]::Ordinal); if ($markerIndex -lt 0) { throw 'O conteudo interno do conversor nao foi encontrado.' }; $script = $source.Substring($markerIndex + $marker.Length); & ([scriptblock]::Create($script))"
set "CONCREZIP_EXIT=%ERRORLEVEL%"
if not "%CONCREZIP_EXIT%"=="0" pause
exit /b %CONCREZIP_EXIT%
# CONCREZIP_POWERSHELL_PAYLOAD
'@

$bridgeSource = [IO.File]::ReadAllText($sourcePath, [Text.Encoding]::UTF8)
$launcher = ($batchHeader + "`n" + $bridgeSource).Replace("`r`n", "`n").Replace("`n", "`r`n")
[IO.File]::WriteAllText($launcherPath, $launcher, [Text.UTF8Encoding]::new($false))

$archiveDirectory = Split-Path -Parent $archivePath
[void][IO.Directory]::CreateDirectory($archiveDirectory)
Compress-Archive -LiteralPath $launcherPath -DestinationPath $archivePath -CompressionLevel Optimal -Force

Write-Host "Conversor autônomo gerado em: $launcherPath"
Write-Host "Pacote atualizado em: $archivePath"
