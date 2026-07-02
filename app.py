import io
import os
import re
import sys
import json
import shutil
import uuid
import threading
import webbrowser
from datetime import datetime
from flask import Flask, render_template, jsonify, request, send_file, abort

app = Flask(__name__)

JPEG_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tif', '.heic', '.heif', '.avif'}
RAW_EXTENSIONS  = {'.cr2', '.cr3', '.nef', '.arw', '.dng', '.orf', '.rw2', '.raf',
                   '.rwl', '.mrw', '.pef', '.srw', '.x3f', '.3fr', '.mef', '.mos',
                   '.nrw', '.raw', '.ptx', '.r3d', '.erf', '.kdc', '.dcr'}
SUPPORTED_EXTENSIONS = JPEG_EXTENSIONS | RAW_EXTENSIONS
TRASH_DIR = os.path.expanduser('~/.photo-culler-trash')
IS_WINDOWS = sys.platform == 'win32'


@app.route('/')
def index():
    return render_template('index.html', is_windows=IS_WINDOWS)


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

    session_id = datetime.now().strftime('%Y%m%d_%H%M%S_') + uuid.uuid4().hex[:8]
    session_dir = os.path.join(TRASH_DIR, session_id)
    os.makedirs(session_dir, exist_ok=True)

    moved = []
    errors = []
    manifest = []

    for path in rejected:
        path = os.path.expanduser(path)
        filename = os.path.basename(path)
        dest = os.path.join(session_dir, filename)
        if os.path.exists(dest):
            base, ext = os.path.splitext(filename)
            dest = os.path.join(session_dir, f'{base}_{uuid.uuid4().hex[:4]}{ext}')
        try:
            shutil.move(path, dest)
            manifest.append({'original': path, 'held': dest})
            moved.append(path)
        except FileNotFoundError:
            errors.append(f'{path}: not found')
        except PermissionError:
            errors.append(f'{path}: permission denied')
        except Exception as e:
            errors.append(f'{path}: {e}')

    with open(os.path.join(session_dir, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=2)

    return jsonify({'session_id': session_id, 'moved': moved, 'errors': errors})


@app.route('/api/undo-delete', methods=['POST'])
def undo_delete():
    session_id = request.json.get('session_id', '')
    # Only allow safe session IDs (alphanumeric + underscores, no path separators)
    if not session_id or not re.match(r'^[\w]+$', session_id):
        return jsonify({'error': 'Invalid session'}), 400

    session_dir = os.path.join(TRASH_DIR, session_id)
    manifest_path = os.path.join(session_dir, 'manifest.json')

    if not os.path.exists(manifest_path):
        return jsonify({'error': 'Session not found or already cleaned up'}), 404

    with open(manifest_path) as f:
        manifest = json.load(f)

    restored = []
    errors = []

    for entry in manifest:
        held = entry.get('held', '')
        original = entry.get('original', '')
        if not os.path.exists(held):
            errors.append(f'{original}: file missing from holding area')
            continue
        try:
            shutil.move(held, original)
            restored.append(original)
        except Exception as e:
            errors.append(f'{original}: {e}')

    if not errors:
        shutil.rmtree(session_dir, ignore_errors=True)

    return jsonify({'restored': restored, 'errors': errors})


def _open_browser():
    import time
    time.sleep(1.2)
    webbrowser.open('http://localhost:5050')


if __name__ == '__main__':
    print('\n  Photo Culler')
    print('  Opening http://localhost:5050 in your browser...\n')
    threading.Thread(target=_open_browser, daemon=True).start()
    app.run(host='127.0.0.1', port=5050, debug=False)
