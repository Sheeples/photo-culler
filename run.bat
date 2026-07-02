@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo.
echo   Photo Culler
echo   ============

:: ── Check Python ───────────────────────────────────────────────────────────
python --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo   ERROR: Python not found.
    echo   Install Python 3.8+ from https://python.org
    echo   Make sure to check "Add Python to PATH" during installation.
    echo.
    pause
    exit /b 1
)

:: Require 3.8+
python -c "import sys; sys.exit(0 if sys.version_info >= (3,8) else 1)" >nul 2>&1
if errorlevel 1 (
    echo.
    echo   ERROR: Python 3.8 or newer is required.
    python --version
    echo.
    pause
    exit /b 1
)

:: ── Virtual environment ─────────────────────────────────────────────────────
if not exist ".venv\" (
    echo   Setting up virtual environment...
    python -m venv .venv
    if errorlevel 1 (
        echo   ERROR: Failed to create virtual environment.
        pause
        exit /b 1
    )
)

:: ── Dependencies ────────────────────────────────────────────────────────────
echo   Checking dependencies...
.venv\Scripts\pip install -r requirements.txt -q
if errorlevel 1 (
    echo   ERROR: Failed to install dependencies.
    pause
    exit /b 1
)

:: ── Free port 5050 ──────────────────────────────────────────────────────────
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr /R " :5050 "') do (
    taskkill /F /PID %%a >nul 2>&1
)

:: ── Launch ───────────────────────────────────────────────────────────────────
echo   Starting ^— browser will open automatically
echo.
.venv\Scripts\python app.py

echo.
pause
