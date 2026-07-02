# Photo Culler

A local desktop-style app for culling photos fast. Swipe or press arrow keys to keep or reject photos one by one. When you're done, it shows you exactly which files to delete and can delete them for you with a single click.

Runs entirely on your machine. No cloud, no account, no internet required.

![Culling screen showing a photo card with Reject/Undo/Keep buttons](https://raw.githubusercontent.com/Sheeples/photo-culler/main/docs/screenshot-sonichu.png)

---

## Features

- **Swipe-style card UI** — swipe the card left/right, click buttons, or use the keyboard
- **Zoom & pan** — click the magnifying glass (or press `Space`) to inspect a photo at full resolution; scroll to zoom, drag to pan, pinch on touch screens
- **RAW file support** — reads 23 RAW formats (CR2, CR3, NEF, ARW, DNG, ORF, RAF, RW2, and more) by extracting the embedded JPEG preview; falls back to full decode when no preview is embedded
- **Finish early** — stop mid-session at any time; unreviewed photos are automatically kept
- **Undo** — step back through decisions during culling with `Z`
- **Confirmed delete** — a modal shows exactly which files will be removed, with a 2-second countdown before the destructive button unlocks
- **Delete from the app** — or copy the shell command and run it yourself
- **Cross-platform** — macOS, Linux, and Windows; auto-opens the browser on launch

---

## Requirements

- **Python 3.8 or newer** — [python.org/downloads](https://www.python.org/downloads/)
  - Windows: check *"Add Python to PATH"* during installation
- **Git** (to clone) — [git-scm.com](https://git-scm.com)

No Node.js, no npm, no Electron, no Docker.

---

## Quick start

```bash
git clone https://github.com/sheeples/photo-culler.git
cd photo-culler
```

**macOS / Linux**
```bash
./run.sh
```

**Windows — PowerShell** *(recommended)*
```powershell
.\run.ps1
```

**Windows — Command Prompt**
```cmd
run.bat
```

The first run creates a virtual environment and installs dependencies automatically. Subsequent runs start in under a second. Your browser opens at `http://localhost:5050`.

---

## Usage

### 1. Load a folder

Enter the path to a folder containing photos, e.g. `~/Photos/vacation` or `C:\Users\you\Pictures\trip`. Click **Load Photos**.

Supported formats: JPEG, PNG, WEBP, HEIC, TIFF, GIF, BMP, AVIF, and all major RAW formats (see full list below).

### 2. Cull

| Action | Keyboard | Mouse / touch |
|---|---|---|
| Keep | `→` or `C` | Click **Keep** or swipe right |
| Reject | `←` or `X` | Click **Reject** or swipe left |
| Undo last decision | `Z` | Click **Undo** |
| Zoom in | `Space` | Click the magnifying glass icon |
| Finish early | — | Click **Finish** in the top bar |

**Zoom controls** (while zoomed in):
- Scroll wheel — zoom in / out toward the cursor
- Drag — pan around the image
- Double-click — toggle between fit-to-screen and 100%
- `Fit` / `1:1` buttons in the toolbar
- `Esc` or click outside the image — close zoom

### 3. Review results

After the last card (or after clicking **Finish**), you'll see:

- How many photos were kept vs. rejected
- The full list of files marked for deletion
- A shell command you can copy and run yourself
- A **Delete Files Now** button that opens a confirmation modal listing every file, with a 2-second lockout before you can confirm — preventing accidental permanent deletion

---

## Supported RAW formats

| Manufacturer | Extensions |
|---|---|
| Canon | `.cr2` `.cr3` |
| Nikon | `.nef` `.nrw` |
| Sony | `.arw` |
| Adobe / Universal | `.dng` |
| Olympus / OM System | `.orf` |
| Panasonic | `.rw2` |
| Fujifilm | `.raf` |
| Leica / Panasonic | `.rwl` |
| Minolta / Konica | `.mrw` |
| Pentax | `.pef` `.ptx` |
| Samsung | `.srw` |
| Sigma | `.x3f` |
| Hasselblad | `.3fr` `.mef` |
| Mamiya | `.mos` |
| Kodak | `.kdc` `.dcr` `.erf` |
| RED | `.r3d` |
| Generic | `.raw` |

RAW decoding uses [rawpy](https://github.com/letmaik/rawpy) (LibRaw). The embedded JPEG preview is served for speed; if none exists, a full demosaic is performed.

---

## Project structure

```
photo-culler/
├── app.py              # Flask backend — serves images, handles file moves
├── requirements.txt    # Python dependencies (Flask, rawpy, Pillow)
├── run.sh              # macOS / Linux launcher
├── run.bat             # Windows CMD launcher
├── run.ps1             # Windows PowerShell launcher
├── templates/
│   └── index.html      # Single-page app shell
└── static/
    ├── style.css        # All styles
    └── app.js           # All frontend logic (no framework, no build step)
```

---

## Stopping the server

Press `Ctrl+C` in the terminal window where you ran the launch script.

If port 5050 is in use when you start, the launcher kills the old process automatically.

---

## Troubleshooting

**"rawpy not found" / RAW files show a broken image**
Run the launcher again — it will install the missing dependency. If it persists, run:
```bash
.venv/bin/pip install rawpy Pillow   # macOS/Linux
.venv\Scripts\pip install rawpy Pillow  # Windows
```

**"Port 5050 is already in use"**
Run the launcher again — it kills the old process. Or kill it manually:
```bash
lsof -ti :5050 | xargs kill -9   # macOS/Linux
```
```powershell
Get-NetTCPConnection -LocalPort 5050 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }  # Windows PowerShell
```

**Files not showing up**
Check the folder path is correct and that it contains files with supported extensions. Subfolders are not scanned — only files directly inside the chosen folder.

**Python not found on Windows**
Reinstall Python from [python.org](https://www.python.org/downloads/) and make sure to check *"Add Python to PATH"* on the first installer screen.
