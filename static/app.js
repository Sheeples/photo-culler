/* ── State ── */
let images = [];
let index = 0;
let decisions = []; // 'keep' | 'reject'
let isDragging = false;
let dragStartX = 0;
let dragCurrentX = 0;

/* ── Zoom state ── */
let zoomScale = 1;
let zoomTx = 0, zoomTy = 0;
let zoomPanning = false;
let zoomDidPan = false;
let zoomPanStartX = 0, zoomPanStartY = 0;
let zoomPanTxStart = 0, zoomPanTyStart = 0;
const ZOOM_MIN = 0.1, ZOOM_MAX = 12;

/* ── DOM ── */
const screenPicker  = document.getElementById('screen-picker');
const screenCull    = document.getElementById('screen-cull');
const screenResults = document.getElementById('screen-results');

const folderForm    = document.getElementById('folder-form');
const folderInput   = document.getElementById('folder-input');
const pickerError   = document.getElementById('picker-error');
const btnBrowse     = document.getElementById('btn-browse');

const progressBar   = document.getElementById('progress-bar');
const counterCurrent = document.getElementById('counter-current');
const counterTotal  = document.getElementById('counter-total');

const cardCurrent   = document.getElementById('card-current');
const cardNext      = document.getElementById('card-next');
const imgCurrent    = document.getElementById('img-current');
const imgNext       = document.getElementById('img-next');
const labelKeep     = cardCurrent.querySelector('.label-keep');
const labelReject   = cardCurrent.querySelector('.label-reject');
const filenameLabel = document.getElementById('filename-label');

const btnZoomCard    = document.getElementById('btn-zoom');
const zoomOverlay    = document.getElementById('zoom-overlay');
const zoomCanvas     = document.getElementById('zoom-canvas');
const zoomImg        = document.getElementById('zoom-img');
const zoomFilename   = document.getElementById('zoom-filename-label');
const zoomLevelLabel = document.getElementById('zoom-level-label');
const btnZoomFit     = document.getElementById('btn-zoom-fit');
const btnZoom100     = document.getElementById('btn-zoom-100');
const btnZoomClose   = document.getElementById('btn-zoom-close');
const btnFinishEarly = document.getElementById('btn-finish-early');
const btnReject     = document.getElementById('btn-reject');
const btnUndo       = document.getElementById('btn-undo');
const btnKeep       = document.getElementById('btn-keep');

const btnDeleteFiles  = document.getElementById('btn-delete-files');
const deleteResult    = document.getElementById('delete-result');
const confirmModal    = document.getElementById('confirm-modal');
const modalFileList   = document.getElementById('modal-file-list');
const modalBody       = document.getElementById('modal-body');
const modalConfirmLabel = document.getElementById('modal-confirm-label');
const modalCountdown  = document.getElementById('modal-countdown');
const btnModalCancel  = document.getElementById('btn-modal-cancel');
const btnModalConfirm = document.getElementById('btn-modal-confirm');
const tabPrimary      = document.getElementById('tab-primary');
const tabAlt          = document.getElementById('tab-alt');
let   cmdPrimary      = '';
let   cmdAlt          = '';
let   countdownTimer  = null;
const statKept      = document.getElementById('stat-kept');
const statRejected  = document.getElementById('stat-rejected');
const statTotal     = document.getElementById('stat-total');
const rejectedSection = document.getElementById('results-rejected-section');
const resultsEmpty  = document.getElementById('results-empty');
const rejectedList  = document.getElementById('rejected-list');
const deleteCommand = document.getElementById('delete-command');
const btnCopy       = document.getElementById('btn-copy');
const btnRestart    = document.getElementById('btn-restart');

/* ── Screen transitions ── */
function showScreen(screen) {
  [screenPicker, screenCull, screenResults].forEach(s => s.classList.remove('active'));
  screen.classList.add('active');
}

/* ── Load folder ── */
folderForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const folder = folderInput.value.trim();
  if (!folder) return;

  pickerError.classList.add('hidden');
  const btn = folderForm.querySelector('button[type="submit"]');
  btn.textContent = 'Loading…';
  btn.disabled = true;

  try {
    const res = await fetch('/api/load-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Unknown error');

    images = data.images;
    index = 0;
    decisions = [];
    startCulling();
  } catch (err) {
    pickerError.textContent = err.message;
    pickerError.classList.remove('hidden');
  } finally {
    btn.textContent = 'Load Photos';
    btn.disabled = false;
  }
});

btnBrowse.addEventListener('click', async () => {
  pickerError.classList.add('hidden');
  btnBrowse.textContent = 'Browsing…';
  btnBrowse.disabled = true;

  try {
    const res = await fetch('/api/browse-folder', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Unknown error');

    if (data.folder) {
      folderInput.value = data.folder;
      folderInput.focus();
    }
  } catch (err) {
    pickerError.textContent = err.message;
    pickerError.classList.remove('hidden');
  } finally {
    btnBrowse.textContent = 'Browse…';
    btnBrowse.disabled = false;
  }
});

/* ── Culling ── */
function imageUrl(path) {
  return `/api/image?path=${encodeURIComponent(path)}`;
}

function startCulling() {
  counterTotal.textContent = images.length;
  showScreen(screenCull);
  loadCard(0);
  preloadNext(1);
}

function loadCard(i) {
  if (i >= images.length) {
    showResults();
    return;
  }
  imgCurrent.src = imageUrl(images[i].path);
  filenameLabel.textContent = images[i].name;
  counterCurrent.textContent = i + 1;
  progressBar.style.width = `${(i / images.length) * 100}%`;
  labelKeep.style.opacity = 0;
  labelReject.style.opacity = 0;
  cardCurrent.style.transform = '';
  cardCurrent.classList.remove('fly-right', 'fly-left', 'dragging');
}

function preloadNext(i) {
  if (i < images.length) {
    imgNext.src = imageUrl(images[i].path);
  } else {
    imgNext.src = '';
  }
}

function decide(decision) {
  if (index >= images.length) return;

  const animClass = decision === 'keep' ? 'fly-right' : 'fly-left';
  cardCurrent.classList.add(animClass);
  decisions.push(decision);

  setTimeout(() => {
    index++;
    loadCard(index);
    preloadNext(index + 1);
  }, 320);
}

function undo() {
  if (index === 0 || decisions.length === 0) return;
  decisions.pop();
  index--;
  loadCard(index);
  preloadNext(index + 1);
}

btnKeep.addEventListener('click', () => decide('keep'));
btnReject.addEventListener('click', () => decide('reject'));
btnUndo.addEventListener('click', undo);
btnFinishEarly.addEventListener('click', showResults);

/* ── Keyboard shortcuts ── */
document.addEventListener('keydown', (e) => {
  if (!screenCull.classList.contains('active')) return;
  if (e.target.tagName === 'INPUT') return;

  switch (e.key) {
    case 'ArrowRight': case 'c': case 'C': decide('keep'); break;
    case 'ArrowLeft':  case 'x': case 'X': decide('reject'); break;
    case 'z': case 'Z': case 'ArrowDown': undo(); break;
  }
});

/* ── Drag / swipe ── */
function onDragStart(e) {
  if (index >= images.length) return;
  isDragging = true;
  dragStartX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
  dragCurrentX = dragStartX;
  cardCurrent.classList.add('dragging');
}

function onDragMove(e) {
  if (!isDragging) return;
  dragCurrentX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
  const dx = dragCurrentX - dragStartX;
  const rotation = dx * 0.07;
  cardCurrent.style.transform = `translateX(${dx}px) rotate(${rotation}deg)`;

  const threshold = 60;
  labelKeep.style.opacity   = dx > 0 ? Math.min(dx / threshold, 1) : 0;
  labelReject.style.opacity = dx < 0 ? Math.min(-dx / threshold, 1) : 0;
}

function onDragEnd() {
  if (!isDragging) return;
  isDragging = false;
  const dx = dragCurrentX - dragStartX;
  const threshold = 80;

  cardCurrent.classList.remove('dragging');

  if (dx > threshold) {
    decide('keep');
  } else if (dx < -threshold) {
    decide('reject');
  } else {
    // Snap back
    cardCurrent.style.transition = 'transform 0.3s ease';
    cardCurrent.style.transform = '';
    labelKeep.style.opacity = 0;
    labelReject.style.opacity = 0;
    setTimeout(() => {
      cardCurrent.style.transition = '';
    }, 300);
  }
}

cardCurrent.addEventListener('mousedown', onDragStart);
document.addEventListener('mousemove', onDragMove);
document.addEventListener('mouseup', onDragEnd);
cardCurrent.addEventListener('touchstart', onDragStart, { passive: true });
document.addEventListener('touchmove', onDragMove, { passive: true });
document.addEventListener('touchend', onDragEnd);

/* ── Results ── */
async function showResults() {
  // Unreviewed photos (early finish) default to keep
  const rejected = images
    .filter((_, i) => decisions[i] === 'reject')
    .map(img => img.path);
  const kept = images.length - rejected.length;

  statKept.textContent = kept;
  statRejected.textContent = rejected.length;
  statTotal.textContent = images.length;

  if (rejected.length === 0) {
    rejectedSection.classList.add('hidden');
    resultsEmpty.classList.remove('hidden');
  } else {
    rejectedSection.classList.remove('hidden');
    resultsEmpty.classList.add('hidden');

    rejectedList.innerHTML = '';
    rejected.forEach(p => {
      const li = document.createElement('li');
      li.textContent = p;
      rejectedList.appendChild(li);
    });

    try {
      const res = await fetch('/api/delete-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejected }),
      });
      const data = await res.json();
      cmdPrimary = data.command;
      cmdAlt     = data.alt_command || '';

      // Windows: show PowerShell tab + CMD tab; label primary "PowerShell"
      if (window.IS_WINDOWS) {
        tabPrimary.textContent = 'PowerShell';
        tabAlt.style.display   = '';
      }
      tabPrimary.classList.add('active');
      tabAlt.classList.remove('active');
      deleteCommand.textContent = cmdPrimary;
    } catch {
      deleteCommand.textContent = '# Error generating command';
    }
  }

  progressBar.style.width = '100%';
  showScreen(screenResults);
}

/* ── Delete modal ── */
function openConfirmModal() {
  const paths = [...rejectedList.querySelectorAll('li')].map(li => li.textContent);
  if (!paths.length) return;

  const n = paths.length;
  modalBody.textContent = `You are about to permanently delete ${n} photo${n !== 1 ? 's' : ''}.`;
  modalConfirmLabel.textContent = `Delete ${n} Photo${n !== 1 ? 's' : ''}`;

  modalFileList.innerHTML = '';
  paths.forEach(p => {
    const li = document.createElement('li');
    li.textContent = p;
    modalFileList.appendChild(li);
  });

  // Countdown: confirm button unlocks after 2 seconds
  btnModalConfirm.disabled = true;
  let remaining = 2;
  modalCountdown.textContent = `(${remaining}s)`;

  clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(countdownTimer);
      btnModalConfirm.disabled = false;
      modalCountdown.textContent = '';
    } else {
      modalCountdown.textContent = `(${remaining}s)`;
    }
  }, 1000);

  confirmModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeConfirmModal() {
  clearInterval(countdownTimer);
  confirmModal.classList.add('hidden');
  document.body.style.overflow = '';
}

btnDeleteFiles.addEventListener('click', openConfirmModal);
btnModalCancel.addEventListener('click', closeConfirmModal);
confirmModal.addEventListener('click', (e) => { if (e.target === confirmModal) closeConfirmModal(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !confirmModal.classList.contains('hidden')) closeConfirmModal();
});

btnModalConfirm.addEventListener('click', async () => {
  const paths = [...rejectedList.querySelectorAll('li')].map(li => li.textContent);
  closeConfirmModal();

  btnDeleteFiles.disabled = true;
  btnDeleteFiles.textContent = 'Deleting…';
  deleteResult.className = 'delete-result hidden';

  try {
    const res = await fetch('/api/delete-files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rejected: paths }),
    });
    const data = await res.json();

    deleteResult.classList.remove('hidden');
    if (!data.errors || data.errors.length === 0) {
      const n = data.deleted.length;
      deleteResult.textContent = `✓ ${n} file${n !== 1 ? 's' : ''} permanently deleted.`;
      deleteResult.classList.add('success');
      btnDeleteFiles.classList.add('hidden');
    } else {
      deleteResult.textContent = `Deleted ${data.deleted.length}, failed: ${data.errors.join('; ')}`;
      deleteResult.classList.add('failure');
      btnDeleteFiles.textContent = 'Retry';
      btnDeleteFiles.disabled = false;
    }
  } catch (err) {
    deleteResult.textContent = `Error: ${err.message}`;
    deleteResult.classList.remove('hidden');
    deleteResult.classList.add('failure');
    btnDeleteFiles.textContent = 'Delete Files Now';
    btnDeleteFiles.disabled = false;
  }
});

/* ── Zoom ── */
function applyZoom() {
  zoomImg.style.transform = `translate(${zoomTx}px, ${zoomTy}px) scale(${zoomScale})`;
  zoomLevelLabel.textContent = Math.round(zoomScale * 100) + '%';
  zoomCanvas.classList.toggle('zoomed', zoomScale > 1.01);
}

function openZoom() {
  if (index >= images.length) return;
  const img = images[index];
  zoomImg.src = imageUrl(img.path);
  zoomFilename.textContent = img.name;
  zoomScale = 1; zoomTx = 0; zoomTy = 0;
  applyZoom();
  zoomOverlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeZoom() {
  zoomOverlay.classList.add('hidden');
  document.body.style.overflow = '';
}

function zoomFit() {
  zoomScale = 1; zoomTx = 0; zoomTy = 0;
  applyZoom();
}

function zoom100() {
  const rect = zoomCanvas.getBoundingClientRect();
  // Natural size — if image not loaded yet, default to 1:1 at center
  const nw = zoomImg.naturalWidth  || zoomImg.width  || rect.width;
  const nh = zoomImg.naturalHeight || zoomImg.height || rect.height;
  // Scale so image is at 1px = 1px relative to the canvas
  const canvasScale = Math.min(rect.width / nw, rect.height / nh);
  zoomScale = 1 / canvasScale;
  zoomTx = 0; zoomTy = 0;
  applyZoom();
}

btnZoomCard.addEventListener('mousedown', (e) => { e.stopPropagation(); });
btnZoomCard.addEventListener('click',     (e) => { e.stopPropagation(); openZoom(); });
btnZoomClose.addEventListener('click', closeZoom);
btnZoomFit.addEventListener('click',   zoomFit);
btnZoom100.addEventListener('click',   zoom100);

// Click outside image (on dark area) closes.
// zoomImg has pointer-events:none, so e.target is always zoomCanvas even
// when the click visually lands on the photo — check real image bounds instead.
zoomCanvas.addEventListener('click', (e) => {
  if (zoomDidPan) { zoomDidPan = false; return; }
  const imgRect = zoomImg.getBoundingClientRect();
  const insideImg = e.clientX >= imgRect.left && e.clientX <= imgRect.right &&
                     e.clientY >= imgRect.top && e.clientY <= imgRect.bottom;
  if (!insideImg) closeZoom();
});

// Double-click toggles between fit and 1:1
zoomCanvas.addEventListener('dblclick', () => {
  if (Math.abs(zoomScale - 1) < 0.05 && Math.abs(zoomTx) < 2 && Math.abs(zoomTy) < 2) {
    zoom100();
  } else {
    zoomFit();
  }
});

// Wheel zoom toward cursor
zoomCanvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const rect = zoomCanvas.getBoundingClientRect();
  // Cursor relative to canvas center (which is where transform-origin is)
  const cx = e.clientX - rect.left - rect.width  / 2;
  const cy = e.clientY - rect.top  - rect.height / 2;

  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
  const newScale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoomScale * factor));

  // Keep point under cursor fixed
  zoomTx = cx - (cx - zoomTx) * (newScale / zoomScale);
  zoomTy = cy - (cy - zoomTy) * (newScale / zoomScale);
  zoomScale = newScale;
  applyZoom();
}, { passive: false });

// Drag pan
zoomCanvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  zoomPanning = true;
  zoomDidPan = false;
  zoomPanStartX = e.clientX;
  zoomPanStartY = e.clientY;
  zoomPanTxStart = zoomTx;
  zoomPanTyStart = zoomTy;
  zoomCanvas.classList.add('panning');
});
window.addEventListener('mousemove', (e) => {
  if (!zoomPanning) return;
  const dx = e.clientX - zoomPanStartX;
  const dy = e.clientY - zoomPanStartY;
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) zoomDidPan = true;
  zoomTx = zoomPanTxStart + dx;
  zoomTy = zoomPanTyStart + dy;
  applyZoom();
});
window.addEventListener('mouseup', () => {
  if (!zoomPanning) return;
  zoomPanning = false;
  zoomCanvas.classList.remove('panning');
});

// Touch pinch-zoom + drag
let zoomTouches = [];
let zoomPinchStartDist = 0, zoomPinchStartScale = 1;
let zoomTouchTxStart = 0, zoomTouchTyStart = 0;
let zoomTouchMidStart = { x: 0, y: 0 };

zoomCanvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  zoomTouches = [...e.touches];
  if (zoomTouches.length === 2) {
    const dx = zoomTouches[1].clientX - zoomTouches[0].clientX;
    const dy = zoomTouches[1].clientY - zoomTouches[0].clientY;
    zoomPinchStartDist  = Math.hypot(dx, dy);
    zoomPinchStartScale = zoomScale;
    const rect = zoomCanvas.getBoundingClientRect();
    zoomTouchMidStart = {
      x: (zoomTouches[0].clientX + zoomTouches[1].clientX) / 2 - rect.left - rect.width  / 2,
      y: (zoomTouches[0].clientY + zoomTouches[1].clientY) / 2 - rect.top  - rect.height / 2,
    };
    zoomTouchTxStart = zoomTx;
    zoomTouchTyStart = zoomTy;
  } else if (zoomTouches.length === 1) {
    zoomPanStartX = zoomTouches[0].clientX;
    zoomPanStartY = zoomTouches[0].clientY;
    zoomPanTxStart = zoomTx;
    zoomPanTyStart = zoomTy;
  }
}, { passive: false });

zoomCanvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const touches = [...e.touches];
  if (touches.length === 2 && zoomTouches.length === 2) {
    const dx = touches[1].clientX - touches[0].clientX;
    const dy = touches[1].clientY - touches[0].clientY;
    const dist = Math.hypot(dx, dy);
    const newScale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoomPinchStartScale * (dist / zoomPinchStartDist)));
    const rect = zoomCanvas.getBoundingClientRect();
    const mid = {
      x: (touches[0].clientX + touches[1].clientX) / 2 - rect.left - rect.width  / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2 - rect.top  - rect.height / 2,
    };
    zoomTx = mid.x - (zoomTouchMidStart.x - zoomTouchTxStart) * (newScale / zoomPinchStartScale);
    zoomTy = mid.y - (zoomTouchMidStart.y - zoomTouchTyStart) * (newScale / zoomPinchStartScale);
    zoomScale = newScale;
    applyZoom();
  } else if (touches.length === 1) {
    zoomTx = zoomPanTxStart + (touches[0].clientX - zoomPanStartX);
    zoomTy = zoomPanTyStart + (touches[0].clientY - zoomPanStartY);
    applyZoom();
  }
}, { passive: false });

// Open zoom with Space key while culling
document.addEventListener('keydown', (e) => {
  if (!screenCull.classList.contains('active') && !zoomOverlay.classList.contains('hidden')) {
    if (e.key === 'Escape') { closeZoom(); return; }
  }
  if (e.key === 'Escape' && !zoomOverlay.classList.contains('hidden')) { closeZoom(); return; }
  if (!screenCull.classList.contains('active')) return;
  if (e.target.tagName === 'INPUT') return;
  if (e.key === ' ') {
    e.preventDefault();
    if (zoomOverlay.classList.contains('hidden')) openZoom();
    else closeZoom();
  }
});

/* ── Command tabs (Windows: PowerShell / CMD) ── */
[tabPrimary, tabAlt].forEach(tab => {
  tab.addEventListener('click', () => {
    [tabPrimary, tabAlt].forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    deleteCommand.textContent = tab.dataset.tab === 'primary' ? cmdPrimary : cmdAlt;
  });
});

/* ── Copy command ── */
btnCopy.addEventListener('click', () => {
  const text = deleteCommand.textContent;
  // Try modern clipboard API first, fall back to execCommand
  const finish = (ok) => {
    btnCopy.textContent = ok ? 'Copied!' : 'Failed';
    btnCopy.classList.toggle('copied', ok);
    setTimeout(() => {
      btnCopy.textContent = 'Copy';
      btnCopy.classList.remove('copied');
    }, 2000);
  };

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => finish(true)).catch(() => fallback());
  } else {
    fallback();
  }

  function fallback() {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try { finish(document.execCommand('copy')); } catch { finish(false); }
    document.body.removeChild(ta);
  }
});

/* ── Restart ── */
btnRestart.addEventListener('click', () => {
  folderInput.value = '';
  pickerError.classList.add('hidden');
  images = [];
  index = 0;
  decisions = [];
  // Reset delete/command state
  cmdPrimary = ''; cmdAlt = '';
  tabPrimary.classList.add('active');
  tabAlt.classList.remove('active');
  tabAlt.style.display = 'none';
  deleteResult.className = 'delete-result hidden';
  btnDeleteFiles.classList.remove('hidden');
  btnDeleteFiles.disabled = false;
  btnDeleteFiles.textContent = 'Delete Files Now';
  showScreen(screenPicker);
});
