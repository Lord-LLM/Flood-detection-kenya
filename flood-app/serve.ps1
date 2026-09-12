<#
  serve.ps1 — a minimal static file server, no Python/Node required.
  Serves the folder this script lives in (the flood-app root) over HTTP,
  with correct MIME types for the file types this PWA uses (.json,
  .geojson, .js, .css, manifest.json, etc). Needed because service
  workers and fetch() of local JSON/GeoJSON require a real http:// origin,
  not file://.

  Usage:
    powershell -ExecutionPolicy Bypass -File serve.ps1
    powershell -ExecutionPolicy Bypass -File serve.ps1 -Port 8080

  Then open http://localhost:8080 in your browser. Ctrl+C to stop.
#>

param(
  [int]$Port = 8080
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$mime = @{
  ".html"    = "text/html; charset=utf-8"
  ".htm"     = "text/html; charset=utf-8"
  ".css"     = "text/css; charset=utf-8"
  ".js"      = "application/javascript; charset=utf-8"
  ".json"    = "application/json; charset=utf-8"
  ".geojson" = "application/geo+json; charset=utf-8"
  ".png"     = "image/png"
  ".jpg"     = "image/jpeg"
  ".jpeg"    = "image/jpeg"
  ".svg"     = "image/svg+xml"
  ".ico"     = "image/x-icon"
  ".webmanifest" = "application/manifest+json; charset=utf-8"
}

$listener = New-Object System.Net.HttpListener
$prefix = "http://localhost:$Port/"
$listener.Prefixes.Add($prefix)

try {
  $listener.Start()
} catch {
  Write-Host "Could not start server on port $Port. It may already be in use." -ForegroundColor Red
  Write-Host "Try: powershell -ExecutionPolicy Bypass -File serve.ps1 -Port 8081" -ForegroundColor Yellow
  exit 1
}

Write-Host "Serving $root"
Write-Host "Open $prefix in your browser. Press Ctrl+C to stop." -ForegroundColor Green

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response

    $urlPath = [System.Uri]::UnescapeDataString($request.Url.AbsolutePath)
    if ($urlPath -eq "/") { $urlPath = "/index.html" }

    # Normalize and prevent path traversal outside $root
    $filePath = Join-Path $root ($urlPath.TrimStart("/") -replace "/", [IO.Path]::DirectorySeparatorChar)
    $fullPath = [System.IO.Path]::GetFullPath($filePath)

    if (-not $fullPath.StartsWith($root)) {
      $response.StatusCode = 403
      $response.Close()
      continue
    }

    if (Test-Path $fullPath -PathType Leaf) {
      $ext = [System.IO.Path]::GetExtension($fullPath).ToLower()
      $contentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
      $bytes = [System.IO.File]::ReadAllBytes($fullPath)
      $response.ContentType = $contentType
      $response.ContentLength64 = $bytes.Length
      $response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $response.StatusCode = 404
      $notFound = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $urlPath")
      $response.OutputStream.Write($notFound, 0, $notFound.Length)
    }
    $response.Close()
  }
} finally {
  $listener.Stop()
  $listener.Close()
}
