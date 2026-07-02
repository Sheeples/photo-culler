#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "  Photo Culler" -ForegroundColor Cyan
Write-Host "  ============" -ForegroundColor Cyan

# ── Check Python ──────────────────────────────────────────────────────────────
$python = $null
foreach ($cmd in @('python', 'python3', 'py')) {
    if (Get-Command $cmd -ErrorAction SilentlyContinue) {
        $python = $cmd; break
    }
}
if (-not $python) {
    Write-Host ""
    Write-Host "  ERROR: Python not found." -ForegroundColor Red
    Write-Host "  Install Python 3.8+ from https://python.org" -ForegroundColor Yellow
    Write-Host "  Check 'Add Python to PATH' during installation." -ForegroundColor Yellow
    Read-Host "`n  Press Enter to exit"
    exit 1
}

$ok = & $python -c "import sys; sys.exit(0 if sys.version_info >= (3,8) else 1)" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "  ERROR: Python 3.8 or newer is required." -ForegroundColor Red
    & $python --version
    Read-Host "`n  Press Enter to exit"
    exit 1
}

# ── Virtual environment ───────────────────────────────────────────────────────
if (-not (Test-Path '.venv')) {
    Write-Host "  Setting up virtual environment..."
    & $python -m venv .venv
}

$pip    = if ($IsWindows -or $env:OS -eq 'Windows_NT') { '.\.venv\Scripts\pip'    } else { './.venv/bin/pip'    }
$pyExe  = if ($IsWindows -or $env:OS -eq 'Windows_NT') { '.\.venv\Scripts\python' } else { './.venv/bin/python' }

# ── Dependencies ──────────────────────────────────────────────────────────────
Write-Host "  Checking dependencies..."
& $pip install -r requirements.txt -q

# ── Free port 5050 ────────────────────────────────────────────────────────────
try {
    $conns = Get-NetTCPConnection -LocalPort 5050 -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
        Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
    }
    if ($conns) { Start-Sleep -Milliseconds 500 }
} catch {}

# ── Launch ────────────────────────────────────────────────────────────────────
Write-Host "  Starting — browser will open automatically" -ForegroundColor Green
Write-Host ""
& $pyExe app.py
