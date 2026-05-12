/**
 * Perplexity Chat Queue – Popup Script
 * Manages queue, presets, drag-reorder, export/import
 */
(function () {
  'use strict';

  let activeTabId = null;
  let pendingLoadPreset = null;

  const els = {
    connection: document.getElementById('popup-connection'),
    connectionText: document.getElementById('connection-text'),
    statusIndicator: document.getElementById('status-indicator'),
    statusLabel: document.getElementById('status-label'),
    statusDetail: document.getElementById('status-detail'),
    statusProgress: document.getElementById('status-progress'),
    promptInput: document.getElementById('prompt-input'),
    singleCheck: document.getElementById('single-prompt-check'),
    addBtn: document.getElementById('add-btn'),
    queueList: document.getElementById('queue-list'),
    queueCount: document.getElementById('queue-count'),
    startBtn: document.getElementById('start-btn'),
    pauseBtn: document.getElementById('pause-btn'),
    resumeBtn: document.getElementById('resume-btn'),
    stopBtn: document.getElementById('stop-btn'),
    clearBtn: document.getElementById('clear-btn'),
    saveBtn: document.getElementById('save-btn'),
    delayInput: document.getElementById('delay-input'),
    presetsTree: document.getElementById('presets-tree'),
    presetSearch: document.getElementById('preset-search'),
    importBtn: document.getElementById('import-btn'),
    exportBtn: document.getElementById('export-btn'),
    addFolderBtn: document.getElementById('add-folder-btn'),
    importFile: document.getElementById('import-file'),
    // Save modal
    saveModal: document.getElementById('save-modal'),
    saveName: document.getElementById('save-name'),
    saveFolder: document.getElementById('save-folder'),
    newFolderGroup: document.getElementById('new-folder-group'),
    newFolderName: document.getElementById('new-folder-name'),
    saveConfirm: document.getElementById('save-confirm'),
    saveCancel: document.getElementById('save-cancel'),
    saveModalClose: document.getElementById('save-modal-close'),
    // Load modal
    loadModal: document.getElementById('load-modal'),
    loadReplace: document.getElementById('load-replace'),
    loadAppend: document.getElementById('load-append'),
    loadCancel: document.getElementById('load-cancel'),
    loadModalClose: document.getElementById('load-modal-close'),
  };

  // ── Checkbox placeholder toggle ──
  function updatePlaceholder() {
    els.promptInput.placeholder = els.singleCheck.checked
      ? 'Enter your entire prompt here...'
      : 'Each line = 1 separate prompt.\nBlank lines will be skipped.\nUse \\\\n for newline within a prompt.';
  }
  els.singleCheck.addEventListener('change', updatePlaceholder);

  // ── Tab Detection ──
  async function findPerplexityTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url && tab.url.includes('perplexity.ai')) {
        activeTabId = tab.id; setConnected(true); getState(); return;
      }
    } catch (e) { }
    try {
      const tabs = await chrome.tabs.query({ url: 'https://www.perplexity.ai/*' });
      if (tabs.length > 0) { activeTabId = tabs[0].id; setConnected(true); getState(); return; }
    } catch (e) { }
    setConnected(false);
  }

  function setConnected(c) {
    els.connection.className = 'connection-badge ' + (c ? 'connected' : 'disconnected');
    els.connectionText.textContent = c ? 'Connected' : 'Disconnected';
    if (!c) { els.statusDetail.textContent = 'Open Perplexity AI to start'; els.startBtn.disabled = true; }
  }

  // ── Communication ──
  function sendToContent(message) {
    return new Promise((resolve) => {
      if (!activeTabId) { resolve(null); return; }
      chrome.tabs.sendMessage(activeTabId, message, (r) => {
        if (chrome.runtime.lastError) { resolve(null); } else { resolve(r); }
      });
    });
  }

  async function getState() {
    const state = await sendToContent({ type: 'GET_STATE' });
    if (state) updateUI(state);
  }

  // ── UI Update ──
  function updateUI(state) {
    const { queue, currentIndex, isProcessing, isPaused } = state;
    if (isProcessing && !isPaused) {
      els.statusIndicator.className = 'status-indicator active';
      els.statusLabel.textContent = 'Processing';
      els.statusDetail.textContent = `Sending message ${currentIndex + 1}/${queue.length}`;
      els.statusProgress.textContent = `Progress: ${currentIndex}/${queue.length} completed`;
    } else if (isProcessing && isPaused) {
      els.statusIndicator.className = 'status-indicator paused';
      els.statusLabel.textContent = 'Paused';
      els.statusDetail.textContent = `Paused at message ${currentIndex + 1}/${queue.length}`;
      els.statusProgress.textContent = `Progress: ${currentIndex}/${queue.length} completed`;
    } else {
      els.statusIndicator.className = 'status-indicator';
      els.statusLabel.textContent = queue.length > 0 ? `${queue.length} messages queued` : 'Ready';
      els.statusDetail.textContent = queue.length > 0 ? 'Press "Start" to send' : 'Add messages to the queue';
      els.statusProgress.textContent = '';
    }
    els.startBtn.disabled = queue.length === 0 || isProcessing;
    els.startBtn.classList.toggle('hidden', isProcessing);
    els.pauseBtn.classList.toggle('hidden', !isProcessing || isPaused);
    els.resumeBtn.classList.toggle('hidden', !isProcessing || !isPaused);
    els.stopBtn.classList.toggle('hidden', !isProcessing);
    els.clearBtn.disabled = isProcessing;
    els.saveBtn.disabled = queue.length === 0;
    els.queueCount.textContent = queue.length;
    renderQueue(queue, currentIndex, isProcessing);
  }

  function renderQueue(queue, currentIndex, isProcessing) {
    if (queue.length === 0) {
      els.queueList.innerHTML = '<div class="empty-state"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.3"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span>No messages yet</span></div>';
      return;
    }
    els.queueList.innerHTML = queue.map((msg, i) => {
      let cls = '', label = (i + 1).toString();
      if (isProcessing) {
        if (i < currentIndex) { cls = 'done'; label = '✓'; }
        else if (i === currentIndex) { cls = 'current'; label = '►'; }
      }
      const preview = msg.length > 60 ? msg.substring(0, 60) + '…' : msg;
      const escaped = preview.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, ' ↵ ');
      return `<div class="queue-item ${cls}" draggable="${!isProcessing}" data-idx="${i}">
        ${!isProcessing ? '<div class="item-drag" title="Drag to reorder"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="2"/><circle cx="15" cy="5" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="9" cy="19" r="2"/><circle cx="15" cy="19" r="2"/></svg></div>' : ''}
        <div class="item-index">${label}</div>
        <div class="item-text" title="${msg.replace(/"/g, '&quot;').replace(/\n/g, '↵')}">${escaped}</div>
        ${!isProcessing ? `<div class="item-actions">
          <button class="item-btn item-dup" data-dup="${i}" title="Duplicate"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
          <button class="item-btn item-remove" data-rm="${i}" title="Remove"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>` : ''}
      </div>`;
    }).join('');

    // Bind remove & duplicate
    els.queueList.querySelectorAll('.item-remove').forEach(b => b.addEventListener('click', async () => {
      await sendToContent({ type: 'REMOVE_MESSAGE', index: parseInt(b.dataset.rm) }); getState();
    }));
    els.queueList.querySelectorAll('.item-dup').forEach(b => b.addEventListener('click', async () => {
      await sendToContent({ type: 'DUPLICATE_MESSAGE', index: parseInt(b.dataset.dup) }); getState();
    }));

    // Drag-reorder
    if (!isProcessing) bindDragReorder();
  }

  // ── Drag Reorder ──
  function bindDragReorder() {
    let dragIdx = null;
    els.queueList.querySelectorAll('.queue-item').forEach(item => {
      item.addEventListener('dragstart', (e) => {
        dragIdx = parseInt(item.dataset.idx);
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      item.addEventListener('dragend', () => { item.classList.remove('dragging'); dragIdx = null; removeAllDragOver(); });
      item.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; removeAllDragOver(); item.classList.add('drag-over'); });
      item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
      item.addEventListener('drop', async (e) => {
        e.preventDefault(); removeAllDragOver();
        const toIdx = parseInt(item.dataset.idx);
        if (dragIdx !== null && dragIdx !== toIdx) {
          await sendToContent({ type: 'REORDER', from: dragIdx, to: toIdx }); getState();
        }
      });
    });
  }
  function removeAllDragOver() { els.queueList.querySelectorAll('.drag-over').forEach(e => e.classList.remove('drag-over')); }

  // ── Add Messages ──
  function addMessages() {
    const text = els.promptInput.value;
    if (!text.trim() || !activeTabId) return;
    let messages;
    if (els.singleCheck.checked) {
      messages = [text.trim()];
    } else {
      messages = text.split('\n').filter(l => l.trim() !== '').map(l => l.replace(/\\n/g, '\n'));
    }
    sendToContent({ type: 'ADD_MESSAGES', messages }).then(() => { els.promptInput.value = ''; getState(); });
  }
  els.addBtn.addEventListener('click', addMessages);
  els.promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); addMessages(); }
  });

  // ── Controls ──
  els.startBtn.addEventListener('click', () => sendToContent({ type: 'START' }).then(() => getState()));
  els.pauseBtn.addEventListener('click', () => sendToContent({ type: 'PAUSE' }).then(() => getState()));
  els.resumeBtn.addEventListener('click', () => sendToContent({ type: 'RESUME' }).then(() => getState()));
  els.stopBtn.addEventListener('click', () => sendToContent({ type: 'STOP' }).then(() => getState()));
  els.clearBtn.addEventListener('click', () => sendToContent({ type: 'CLEAR' }).then(() => getState()));
  els.delayInput.addEventListener('change', () => {
    sendToContent({ type: 'SET_DELAY', delay: Math.max(1, parseInt(els.delayInput.value) || 3) });
  });

  // ══════════════ PRESETS ══════════════
  const DEFAULT_FOLDER = 'General';

  async function loadPresets() {
    const data = await chrome.storage.local.get('pcq_presets');
    return data.pcq_presets || { folders: {} };
  }

  async function savePresets(presets) {
    await chrome.storage.local.set({ pcq_presets: presets });
  }

  // ── Render Presets Tree ──
  async function renderPresets(filter = '') {
    const presets = await loadPresets();
    const folders = presets.folders;
    const keys = Object.keys(folders).sort();
    if (keys.length === 0) {
      els.presetsTree.innerHTML = '<div class="empty-state empty-state-sm"><span>No presets yet</span></div>';
      return;
    }
    const lf = filter.toLowerCase();
    let html = '';
    keys.forEach(folderName => {
      const folder = folders[folderName];
      const pKeys = Object.keys(folder.presets || {}).filter(k => !lf || k.toLowerCase().includes(lf) || folderName.toLowerCase().includes(lf)).sort();
      if (lf && pKeys.length === 0) return;
      html += `<div class="folder-item">
        <div class="folder-header" data-folder="${esc(folderName)}">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          <span class="folder-name">${esc(folderName)}</span>
          <span class="folder-count">${pKeys.length}</span>
          <div class="folder-actions">
            <button class="icon-btn-sm" data-rename-folder="${esc(folderName)}" title="Rename"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
            <button class="icon-btn-sm" data-del-folder="${esc(folderName)}" title="Delete folder"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          </div>
        </div>
        <div class="folder-children">`;
      pKeys.forEach(pKey => {
        const p = folder.presets[pKey];
        html += `<div class="preset-item" data-load-folder="${esc(folderName)}" data-load-key="${esc(pKey)}">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <span class="preset-name">${esc(p.name)}</span>
          <span class="preset-count">${p.messages.length}p</span>
          <div class="preset-actions">
            <button class="icon-btn-sm" data-del-preset-folder="${esc(folderName)}" data-del-preset-key="${esc(pKey)}" title="Delete"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          </div>
        </div>`;
      });
      html += '</div></div>';
    });
    els.presetsTree.innerHTML = html || '<div class="empty-state empty-state-sm"><span>No results found</span></div>';

    // Bind events
    els.presetsTree.querySelectorAll('.folder-header').forEach(h => {
      h.addEventListener('click', (e) => {
        if (e.target.closest('.folder-actions')) return;
        h.classList.toggle('collapsed');
        h.nextElementSibling.classList.toggle('collapsed');
      });
    });
    els.presetsTree.querySelectorAll('[data-del-folder]').forEach(b => b.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`Delete folder "${b.dataset.delFolder}" and all its presets?`)) return;
      const p = await loadPresets(); delete p.folders[b.dataset.delFolder]; await savePresets(p); renderPresets(els.presetSearch.value);
    }));
    els.presetsTree.querySelectorAll('[data-rename-folder]').forEach(b => b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const oldName = b.dataset.renameFolder;
      const newName = prompt('New folder name:', oldName);
      if (!newName || newName === oldName) return;
      const p = await loadPresets();
      p.folders[newName] = p.folders[oldName]; delete p.folders[oldName];
      await savePresets(p); renderPresets(els.presetSearch.value);
    }));
    els.presetsTree.querySelectorAll('[data-del-preset-key]').forEach(b => b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const p = await loadPresets();
      delete p.folders[b.dataset.delPresetFolder].presets[b.dataset.delPresetKey];
      await savePresets(p); renderPresets(els.presetSearch.value);
    }));
    els.presetsTree.querySelectorAll('.preset-item[data-load-key]').forEach(item => {
      item.addEventListener('click', async (e) => {
        if (e.target.closest('.preset-actions')) return;
        const p = await loadPresets();
        const preset = p.folders[item.dataset.loadFolder]?.presets[item.dataset.loadKey];
        if (!preset) return;
        pendingLoadPreset = preset.messages;
        els.loadModal.classList.remove('hidden');
      });
    });
  }

  function esc(s) { return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // ── Search ──
  els.presetSearch.addEventListener('input', () => renderPresets(els.presetSearch.value));

  // ── Save Modal ──
  els.saveBtn.addEventListener('click', async () => {
    const presets = await loadPresets();
    const folderSelect = els.saveFolder;
    folderSelect.innerHTML = '<option value="__new__">+ Create new folder...</option>';
    Object.keys(presets.folders).sort().forEach(f => {
      folderSelect.innerHTML += `<option value="${esc(f)}">${esc(f)}</option>`;
    });
    if (Object.keys(presets.folders).length > 0) folderSelect.value = Object.keys(presets.folders).sort()[0];
    els.saveName.value = '';
    els.newFolderName.value = '';
    els.newFolderGroup.classList.toggle('hidden', folderSelect.value !== '__new__');
    els.saveModal.classList.remove('hidden');
  });

  els.saveFolder.addEventListener('change', () => {
    els.newFolderGroup.classList.toggle('hidden', els.saveFolder.value !== '__new__');
  });

  els.saveConfirm.addEventListener('click', async () => {
    const name = els.saveName.value.trim();
    if (!name) { els.saveName.focus(); return; }
    let folder = els.saveFolder.value;
    if (folder === '__new__') {
      folder = els.newFolderName.value.trim();
      if (!folder) { els.newFolderName.focus(); return; }
    }
    const state = await sendToContent({ type: 'GET_STATE' });
    if (!state || state.queue.length === 0) return;
    const presets = await loadPresets();
    if (!presets.folders[folder]) presets.folders[folder] = { presets: {} };
    const key = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\u00C0-\u024F\u1E00-\u1EFF-]/gi, '');
    presets.folders[folder].presets[key || Date.now()] = { name, messages: [...state.queue], createdAt: Date.now() };
    await savePresets(presets);
    els.saveModal.classList.add('hidden');
    renderPresets(els.presetSearch.value);
  });

  [els.saveCancel, els.saveModalClose].forEach(b => b.addEventListener('click', () => els.saveModal.classList.add('hidden')));

  // ── Load Modal ──
  els.loadReplace.addEventListener('click', async () => {
    if (!pendingLoadPreset) return;
    await sendToContent({ type: 'CLEAR' });
    await sendToContent({ type: 'ADD_MESSAGES', messages: pendingLoadPreset });
    pendingLoadPreset = null; els.loadModal.classList.add('hidden'); getState();
  });
  els.loadAppend.addEventListener('click', async () => {
    if (!pendingLoadPreset) return;
    await sendToContent({ type: 'ADD_MESSAGES', messages: pendingLoadPreset });
    pendingLoadPreset = null; els.loadModal.classList.add('hidden'); getState();
  });
  [els.loadCancel, els.loadModalClose].forEach(b => b.addEventListener('click', () => { pendingLoadPreset = null; els.loadModal.classList.add('hidden'); }));

  // ── Add Folder ──
  els.addFolderBtn.addEventListener('click', async () => {
    const name = prompt('New folder name:');
    if (!name) return;
    const p = await loadPresets();
    if (!p.folders[name]) p.folders[name] = { presets: {} };
    await savePresets(p); renderPresets(els.presetSearch.value);
  });

  // ── Export / Import ──
  els.exportBtn.addEventListener('click', async () => {
    const presets = await loadPresets();
    const blob = new Blob([JSON.stringify(presets, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'chat-queue-presets.json'; a.click();
    URL.revokeObjectURL(url);
  });

  els.importBtn.addEventListener('click', () => els.importFile.click());
  els.importFile.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      if (!imported.folders) throw new Error('Invalid format');
      const existing = await loadPresets();
      // Merge folders
      Object.keys(imported.folders).forEach(f => {
        if (!existing.folders[f]) existing.folders[f] = { presets: {} };
        Object.assign(existing.folders[f].presets, imported.folders[f].presets);
      });
      await savePresets(existing);
      renderPresets(els.presetSearch.value);
      alert('Import successful!');
    } catch (err) { alert('Import error: ' + err.message); }
    els.importFile.value = '';
  });

  // ── Listeners ──
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'QUEUE_STATE_UPDATE') updateUI(msg);
  });

  // ── Init ──
  findPerplexityTab();
  renderPresets();
  setInterval(() => { if (activeTabId) getState(); }, 2000);
})();
