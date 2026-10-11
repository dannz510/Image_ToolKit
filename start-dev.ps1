# Dannz AI Studio - one-shot dev launcher
# Starts Python API (port 8000) + Vite (port 3000), then opens the browser.

$ErrorActionPreference = "Continue"
$ProjectRoot = $PSScriptRoot
if (-not $ProjectRoot) { $ProjectRoot = (Get-Location).Path }

Write-Host "=== Dannz AI Studio - starting dev stack ===" -ForegroundColor Cyan

# 1) Python local API on :8000
#    DANNZ_DEV=1 enables the localhost origins + loopback URL imports
#    (/api/fetch_image) and the permissive dev CORS list. Never set this on a
#    public deployment.
Write-Host "[1/3] Starting Python API (http://127.0.0.1:8000) ..." -ForegroundColor Yellow
$env:PYTHONUNBUFFERED = "1"
$env:DANNZ_DEV = "1"
$apiExe = if (Get-Command "python3" -ErrorAction SilentlyContinue) { "python3" } else { "python" }
Start-Process -FilePath $apiExe `
  -ArgumentList "-u","api/server.py" `
  -WorkingDirectory $ProjectRoot `
  -WindowStyle Hidden `
  -PassThru | ForEach-Object { Write-Host "    API pid $($_.Id)" -ForegroundColor DarkGray }

# 2) Vite dev server on :3000
Write-Host "[2/3] Starting Vite dev server (http://localhost:3000) ..." -ForegroundColor Yellow
Start-Process -FilePath "npm" `
  -ArgumentList "run", "dev" `
  -WorkingDirectory $ProjectRoot `
  -WindowStyle Hidden `
  -PassThru | ForEach-Object { Write-Host "    Vite pid $($_.Id)" -ForegroundColor DarkGray }

# 3) Wait until :3000 answers, then open browser
Write-Host "[3/3] Waiting for http://localhost:3000 ..." -ForegroundColor Yellow
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
  try {
    $resp = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 2
    if ($resp.StatusCode -eq 200) { $ready = $true; break }
  } catch { Start-Sleep -Seconds 1 }
}

if ($ready) {
  Write-Host "    Server is up. Opening browser..." -ForegroundColor Green
  Start-Process "http://localhost:3000"
  Write-Host "=== Done. Both servers running in background. ===" -ForegroundColor Cyan
} else {
  Write-Host "    WARNING: server did not become ready in 60s. Check logs." -ForegroundColor Red
}