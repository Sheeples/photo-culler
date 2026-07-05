import io
import os
import shutil
import subprocess
import sys
import threading
import webbrowser
from flask import Flask, render_template, jsonify, request, send_file, abort

app = Flask(__name__)

JPEG_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tif', '.heic', '.heif', '.avif'}
RAW_EXTENSIONS  = {'.cr2', '.cr3', '.nef', '.arw', '.dng', '.orf', '.rw2', '.raf',
                   '.rwl', '.mrw', '.pef', '.srw', '.x3f', '.3fr', '.mef', '.mos',
                   '.nrw', '.raw', '.ptx', '.r3d', '.erf', '.kdc', '.dcr'}
SUPPORTED_EXTENSIONS = JPEG_EXTENSIONS | RAW_EXTENSIONS
IS_WINDOWS = sys.platform == 'win32'


@app.route('/')
def index():
    return render_template('index.html', is_windows=IS_WINDOWS)


BROWSE_TIMEOUT_SECONDS = 300  # generous — this is how long a user has to pick a folder


def _browse_folder_macos():
    script = 'POSIX path of (choose folder with prompt "Select folder to cull")'
    result = subprocess.run(
        ['osascript', '-e', script],
        capture_output=True, text=True, timeout=BROWSE_TIMEOUT_SECONDS,
    )
    if result.returncode != 0:
        # User canceled the dialog
        return ''
    return result.stdout.strip()


def _browse_folder_windows():
    # A plain TopMost owner isn't enough: Windows' foreground-lock timeout
    # stops background-spawned processes from stealing focus, so the dialog
    # can still land behind the active window. Minimizing then immediately
    # restoring our own window is the standard workaround — Windows grants
    # an exception for that specific sequence and lets it come to the front.
    script = (
        "Add-Type -AssemblyName System.Windows.Forms;"
        "Add-Type -AssemblyName System.Drawing;"
        "$owner = New-Object System.Windows.Forms.Form;"
        "$owner.ShowInTaskbar = $false;"
        "$owner.StartPosition = 'Manual';"
        "$owner.Location = New-Object System.Drawing.Point(-2000, -2000);"
        "$owner.Size = New-Object System.Drawing.Size(1, 1);"
        "$owner.Show();"
        "$owner.WindowState = 'Minimized';"
        "$owner.WindowState = 'Normal';"
        "$owner.TopMost = $true;"
        "$owner.Activate();"
        "$d = New-Object System.Windows.Forms.FolderBrowserDialog;"
        "$d.Description = 'Select folder to cull';"
        "$result = $d.ShowDialog($owner);"
        "$owner.Close();"
        "if ($result -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $d.SelectedPath }"
    )
    result = subprocess.run(
        ['powershell', '-NoProfile', '-Command', script],
        capture_output=True, text=True, timeout=BROWSE_TIMEOUT_SECONDS,
    )
    return result.stdout.strip()


def _browse_folder_linux():
    if shutil.which('zenity'):
        result = subprocess.run(
            ['zenity', '--file-selection', '--directory', '--title=Select folder to cull'],
            capture_output=True, text=True, timeout=BROWSE_TIMEOUT_SECONDS,
        )
        return result.stdout.strip()
    if shutil.which('kdialog'):
        result = subprocess.run(
            ['kdialog', '--getexistingdirectory', os.path.expanduser('~'), 'Select folder to cull'],
            capture_output=True, text=True, timeout=BROWSE_TIMEOUT_SECONDS,
        )
        return result.stdout.strip()
    return None


@app.route('/api/browse-folder', methods=['POST'])
def browse_folder():
    try:
        if sys.platform == 'darwin':
            folder = _browse_folder_macos()
        elif IS_WINDOWS:
            folder = _browse_folder_windows()
        else:
            folder = _browse_folder_linux()
            if folder is None:
                return jsonify({
                    'error': 'No folder browser found. Install zenity or kdialog, or type the path manually.'
                }), 501
    except FileNotFoundError:
        return jsonify({'error': 'Native folder browser is not available on this system'}), 501
    except subprocess.TimeoutExpired:
        return jsonify({'error': 'Folder browser timed out. Try again or type the path manually.'}), 504

    return jsonify({'folder': folder})


@app.route('/api/load-folder', methods=['POST'])
def load_folder():
    folder = request.json.get('folder', '').strip()
    if not folder:
        return jsonify({'error': 'No folder path provided'}), 400

    folder = os.path.expanduser(folder)

    if not os.path.isdir(folder):
        return jsonify({'error': f'Directory not found: {folder}'}), 400

    images = []
    try:
        entries = sorted(os.listdir(folder), key=lambda x: x.lower())
        for filename in entries:
            if os.path.splitext(filename)[1].lower() in SUPPORTED_EXTENSIONS:
                abs_path = os.path.join(folder, filename)
                if os.path.isfile(abs_path):
                    images.append({
                        'path': abs_path,
                        'name': filename,
                        'size': os.path.getsize(abs_path),
                    })
    except PermissionError:
        return jsonify({'error': 'Permission denied reading folder'}), 403

    if not images:
        return jsonify({'error': 'No supported images found in that folder'}), 400

    return jsonify({'images': images, 'folder': folder})


@app.route('/api/image')
def serve_image():
    path = request.args.get('path', '')
    path = os.path.expanduser(path)

    if not os.path.isfile(path):
        abort(404)

    ext = os.path.splitext(path)[1].lower()

    if ext in RAW_EXTENSIONS:
        return _serve_raw(path)

    mime_map = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.png': 'image/png', '.gif': 'image/gif',
        '.bmp': 'image/bmp', '.webp': 'image/webp',
        '.tiff': 'image/tiff', '.tif': 'image/tiff',
        '.heic': 'image/heic', '.heif': 'image/heif',
        '.avif': 'image/avif',
    }
    mime = mime_map.get(ext, 'application/octet-stream')
    return send_file(path, mimetype=mime)


def _serve_raw(path):
    try:
        import rawpy
        from PIL import Image as PILImage
    except ImportError:
        abort(501)

    try:
        with rawpy.imread(path) as raw:
            # Try embedded JPEG thumbnail first (fast, usually full-res on modern cameras)
            try:
                thumb = raw.extract_thumb()
                if thumb.format == rawpy.ThumbFormat.JPEG:
                    buf = io.BytesIO(thumb.data)
                    buf.seek(0)
                    return send_file(buf, mimetype='image/jpeg')
                if thumb.format == rawpy.ThumbFormat.BITMAP:
                    img = PILImage.fromarray(thumb.data)
                    buf = io.BytesIO()
                    img.save(buf, format='JPEG', quality=92)
                    buf.seek(0)
                    return send_file(buf, mimetype='image/jpeg')
            except rawpy.LibRawNoThumbnailError:
                pass

            # Full decode fallback
            rgb = raw.postprocess(use_camera_wb=True, no_auto_bright=False)
            img = PILImage.fromarray(rgb)
            buf = io.BytesIO()
            img.save(buf, format='JPEG', quality=92)
            buf.seek(0)
            return send_file(buf, mimetype='image/jpeg')
    except Exception as e:
        app.logger.error('RAW decode error for %s: %s', path, e)
        abort(500)


@app.route('/api/delete-command', methods=['POST'])
def delete_command():
    rejected = request.json.get('rejected', [])
    if not rejected:
        return jsonify({'command': '', 'alt_command': '', 'count': 0})

    if IS_WINDOWS:
        # Primary: PowerShell
        ps_paths = ', '.join(f'"{p}"' for p in rejected)
        command = f'Remove-Item {ps_paths} -Force'
        # Alternate: Command Prompt
        alt_command = ' & '.join(f'del /f "{p}"' for p in rejected)
    else:
        command = 'rm ' + ' '.join(f'"{p}"' for p in rejected)
        alt_command = None

    return jsonify({'command': command, 'alt_command': alt_command, 'count': len(rejected)})


@app.route('/api/delete-files', methods=['POST'])
def delete_files():
    rejected = request.json.get('rejected', [])
    deleted = []
    errors = []

    for path in rejected:
        path = os.path.expanduser(path)
        try:
            os.remove(path)
            deleted.append(path)
        except FileNotFoundError:
            errors.append(f'{os.path.basename(path)}: not found')
        except PermissionError:
            errors.append(f'{os.path.basename(path)}: permission denied')
        except Exception as e:
            errors.append(f'{os.path.basename(path)}: {e}')

    return jsonify({'deleted': deleted, 'errors': errors})


def _open_browser():
    import time
    time.sleep(1.2)
    webbrowser.open('http://localhost:5050')


if __name__ == '__main__':
    print('\n  Photo Culler')
    print('  Opening http://localhost:5050 in your browser...\n')
    threading.Thread(target=_open_browser, daemon=True).start()
    app.run(host='127.0.0.1', port=5050, debug=False)
