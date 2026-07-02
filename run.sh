#!/bin/bash
set -e
cd "$(dirname "$0")"

echo ""
echo "  Photo Culler"
echo "  ============"

# Require Python 3.8+
if ! command -v python3 &>/dev/null; then
    echo ""
    echo "  ERROR: python3 not found."
    echo "  Install Python 3.8+ from https://python.org"
    exit 1
fi

PY_VER=$(python3 -c 'import sys; print(sys.version_info >= (3, 8))')
if [ "$PY_VER" != "True" ]; then
    echo ""
    echo "  ERROR: Python 3.8 or newer is required."
    python3 --version
    exit 1
fi

# Create venv on first run
if [ ! -d ".venv" ]; then
    echo "  Setting up virtual environment..."
    python3 -m venv .venv
fi

# Install / sync dependencies
echo "  Checking dependencies..."
.venv/bin/pip install -r requirements.txt -q

# Free port 5050 if occupied
lsof -ti :5050 | xargs kill -9 2>/dev/null || true

echo "  Starting — browser will open automatically"
echo ""
.venv/bin/python app.py
