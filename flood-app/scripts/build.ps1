<#
  Create a deployable static bundle without local credentials or editor history.

  Usage:
    powershell -ExecutionPolicy Bypass -File scripts/build.ps1
    Deploy the generated .dist directory.
#>

$ErrorActionPreference = "Stop"
$appRoot = Split-Path -Parent $PSScriptRoot
$outputRoot = Join-Path $appRoot ".dist"

if (Test-Path $outputRoot) {
  Remove-Item $outputRoot -Recurse -Force
}

New-Item $outputRoot -ItemType Directory | Out-Null

Get-ChildItem $appRoot -Force -File -Recurse |
  Where-Object {
    $_.FullName -notlike "$outputRoot*" -and
    $_.FullName -notlike "$(Join-Path $appRoot 'config\keys.local.js')" -and
    $_.FullName -notlike "$(Join-Path $appRoot '.history\')*"
  } |
  ForEach-Object {
    $relativePath = $_.FullName.Substring($appRoot.Length).TrimStart([IO.Path]::DirectorySeparatorChar)
    $destination = Join-Path $outputRoot $relativePath
    $destinationDirectory = Split-Path -Parent $destination
    New-Item $destinationDirectory -ItemType Directory -Force | Out-Null
    Copy-Item $_.FullName $destination
  }

if (Test-Path (Join-Path $outputRoot "config\keys.local.js")) {
  throw "Build failed: config/keys.local.js is present in the deploy bundle."
}

Write-Host "Deploy bundle created at $outputRoot"