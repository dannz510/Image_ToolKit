#Requires -Version 5.1
<#
.SYNOPSIS
    Stops the Dannz AI Studio dev servers (Vite :3000 + Python API :8000).

.DESCRIPTION
    Kills whatever process is listening on the dev ports. Safe to run even
    when nothing is running.

.EXAMPLE
    .\stop-dev.ps1
.EXAMPLE
    npm run stop
#>
[CmdletBinding()]
param()

$ErrorActionPreference = "Continue"
$ProjectRoot = $PSScriptRoot
if (-not $ProjectRoot) { $ProjectRoot = (Get-Location).Path }

$Ports = @(3000, 8000)
$Stopped = 0

Write-Host ""
Write-Host "  Stopping Dannz AI Studio dev servers..." -ForegroundColor Cyan

foreach ($port in $Ports) {
    $conns = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
    if (-not $conns) {
        Write-Host "   port $port - nothing listening" -ForegroundColor DarkGray
        continue
    }
    $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in $pids) {
        try {
            $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
            $name = if ($proc) { $proc.ProcessName } else { "unknown" }
            Stop-Process -Id $procId -Force -ErrorAction Stop
            Write-Host "   port $port - stopped $name (pid $procId)" -ForegroundColor Green
            $Stopped++
        } catch {
            Write-Host "   port $port - could not stop pid $procId : $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
}

if ($Stopped -eq 0) {
    Write-Host ""
    Write-Host "  Nothing to stop." -ForegroundColor DarkGray
} else {
    Write-Host ""
    Write-Host "  Stopped $Stopped process(es)." -ForegroundColor Green
}
