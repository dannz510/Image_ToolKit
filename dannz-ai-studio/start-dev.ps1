#Requires -Version 5.1
<#
.SYNOPSIS
    One-shot launcher for Dannz AI Studio.

.DESCRIPTION
    Starts both halves of the dev stack and opens the browser:

      1. Python API  - http://127.0.0.1:8000  (npm run api)
      2. Vite server - http://localhost:3000  (npm run dev)

    Safe to re-run: if either port is already listening the existing server is
    reused instead of starting a duplicate. Logs are written to .dev-logs/.

.PARAMETER NoBrowser
    Start the servers but do not open the browser.

.PARAMETER SkipApi
    Frontend only - do not start the Python API. All canvas features still
    work; only AI background removal is unavailable.

.EXAMPLE
    .\start-dev.ps1
.EXAMPLE
    npm start
.EXAMPLE
    .\start-dev.ps1 -NoBrowser -SkipApi
#>
[CmdletBinding()]
param(
    [switch]$NoBrowser,
    [switch]$SkipApi
)

$ErrorActionPreference = "Continue"
$ProjectRoot = $PSScriptRoot
if (-not $ProjectRoot) { $ProjectRoot = (Get-Location).Path }
Set-Location -LiteralPath $ProjectRoot

$ApiPort = 8000
$WebPort = 3000
$LogDir = Join-Path $ProjectRoot ".dev-logs"
$Failed = $false

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host ">> $Message" -ForegroundColor Cyan
}

function Write-Ok([string]$Message) {
    Write-Host "   [OK] $Message" -ForegroundColor Green
}

function Write-Warn([string]$Message) {
    Write-Host "   [!]  $Message" -ForegroundColor Yellow
}

function Write-Err([string]$Message) {
    Write-Host "   [X]  $Message" -ForegroundColor Red
}

function Test-Port([int]$Port) {
    return [bool](Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
}

function Wait-ForPort([int]$Port, [int]$TimeoutSeconds = 90) {
    for ($i = 0; $i -lt $TimeoutSeconds; $i++) {
        if (Test-Port $Port) { return $true }
        Start-Sleep -Seconds 1
    }
    return $false
}

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Magenta
Write-Host "   Dannz AI Studio - dev launcher" -ForegroundColor Magenta
Write-Host "  ============================================" -ForegroundColor Magenta

# ---------------------------------------------------------------- prerequisites
Write-Step "Checking prerequisites"

# node / npm
if (Get-Command "npm" -ErrorAction SilentlyContinue) {
    $nodeVersion = (& node --version 2>&1) -join " "
    Write-Ok "Node: $nodeVersion"
} else {
    Write-Err "npm not found. Install Node.js 18+ from https://nodejs.org and re-run this script."
    $Failed = $true
}

# node_modules
if (Test-Path -LiteralPath (Join-Path $ProjectRoot "node_modules")) {
    Write-Ok "node_modules present"
} else {
    Write-Warn "node_modules missing - running npm install (first run only, may take a few minutes)..."
    & npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Err "npm install failed. Check your Node/NPM installation, then re-run this script."
        exit 1
    }
    Write-Ok "npm install finished"
}

# python (only needed for the API)
$PythonExe = $null
if (-not $SkipApi) {
    $PythonExe = if (Get-Command "python" -ErrorAction SilentlyContinue) { "python" }
                 elseif (Get-Command "python3" -ErrorAction SilentlyContinue) { "python3" }
    if (-not $PythonExe) {
        Write-Err "Python not found. Install Python 3.9+ from https://python.org and re-run, or launch frontend-only with -SkipApi."
        $Failed = $true
    } else {
        $pyVersion = (& $PythonExe --version 2>&1) -join " "
        Write-Ok "Python: $pyVersion"
        # rembg powers the AI cutout; warn early (the app itself still works
        # without it - only the removal call fails).
        & $PythonExe -c "import rembg, onnxruntime" 2>$null
        if ($LASTEXITCODE -ne 0) {
            Write-Warn "rembg/onnxruntime not installed in this Python. The app will run, but AI removal will fail."
            Write-Warn "Fix with:  npm run api:install"
        } else {
            Write-Ok "rembg + onnxruntime importable"
        }
    }
}

New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

# ---------------------------------------------------------------- 1) Python API
if (-not $SkipApi -and $PythonExe) {
    Write-Step "Python API  (http://127.0.0.1:$ApiPort)"
    if (Test-Port $ApiPort) {
        Write-Ok "Port $ApiPort already in use - reusing the running API"
    } else {
        $env:PYTHONUNBUFFERED = "1"
        # Dev-only: allows localhost origins + loopback URL imports via /api/fetch_image.
        # Never set this on a public deployment.
        $env:DANNZ_DEV = "1"
        $apiLog = Join-Path $LogDir "api.log"
        $apiErr = Join-Path $LogDir "api.err.log"
        try {
            $apiProc = Start-Process -FilePath $PythonExe `
                -ArgumentList "-u", "api/server.py" `
                -WorkingDirectory $ProjectRoot `
                -WindowStyle Hidden `
                -RedirectStandardOutput $apiLog `
                -RedirectStandardError $apiErr `
                -PassThru
            Write-Host "   pid $($apiProc.Id)  logs: .dev-logs/api.log" -ForegroundColor DarkGray
        } catch {
            Write-Err "Could not start the API: $($_.Exception.Message)"
            $Failed = $true
        }
    }
} elseif ($SkipApi) {
    Write-Step "Python API  (skipped via -SkipApi)"
}

# ---------------------------------------------------------------- 2) Vite
Write-Step "Vite dev server  (http://localhost:$WebPort)"
$ViteProc = $null
if (Test-Port $WebPort) {
    Write-Ok "Port $WebPort already in use - reusing the running dev server"
} else {
    $viteLog = Join-Path $LogDir "vite.log"
    $viteErr = Join-Path $LogDir "vite.err.log"
    # npm is npm.cmd, not a Win32 executable - Start-Process cannot launch it
    # directly when output is redirected, so it is wrapped in cmd.exe /c.
    try {
        $ViteProc = Start-Process -FilePath "cmd.exe" `
            -ArgumentList "/c", "npm run dev" `
            -WorkingDirectory $ProjectRoot `
            -WindowStyle Hidden `
            -RedirectStandardOutput $viteLog `
            -RedirectStandardError $viteErr `
            -PassThru
        Write-Host "   pid $($ViteProc.Id)  logs: .dev-logs/vite.log" -ForegroundColor DarkGray
    } catch {
        Write-Err "Could not start Vite: $($_.Exception.Message)"
        $Failed = $true
    }

    if ($ViteProc) {
        Write-Host "   waiting for the server to answer on port $WebPort ..." -ForegroundColor DarkGray
        if (Wait-ForPort $WebPort 90) {
            Write-Ok "Dev server is up"
        } else {
            Write-Err "Vite did not open port $WebPort within 90s. Check .dev-logs/vite.err.log"
            $Failed = $true
        }
    }
}

# ---------------------------------------------------------------- 3) browser
if (-not $NoBrowser -and -not $Failed) {
    Write-Step "Opening browser"
    try {
        Start-Process "http://localhost:$WebPort"
        Write-Ok "http://localhost:$WebPort"
    } catch {
        Write-Warn "Could not open the browser automatically - open http://localhost:$WebPort manually"
    }
}

# ---------------------------------------------------------------- summary
Write-Host ""
Write-Host "  --------------------------------------------" -ForegroundColor DarkCyan
if ($Failed) {
    Write-Host "   Startup finished with problems - see the messages above." -ForegroundColor Red
    Write-Host "   Logs: $LogDir" -ForegroundColor Red
    exit 1
}

Write-Host "   App:      http://localhost:$WebPort" -ForegroundColor Green
if (-not $SkipApi) {
    $apiState = if (Test-Port $ApiPort) { "online" } else { "offline - AI removal disabled, canvas features still work" }
    Write-Host "   API:      http://127.0.0.1:$ApiPort  ($apiState)" -ForegroundColor Green
}
Write-Host "   Logs:     $LogDir" -ForegroundColor Green
Write-Host "   Stop:     .\stop-dev.ps1    (or: npm run stop)" -ForegroundColor Green
Write-Host "  --------------------------------------------" -ForegroundColor DarkCyan
Write-Host ""
