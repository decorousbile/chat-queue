/**
 * Perplexity Chat Queue - Content Script
 * Manages queued messages and sends them sequentially on Perplexity AI
 */

(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────
  let queue = [];
  let isProcessing = false;
  let isPaused = false;
  let currentIndex = 0;
  let checkInterval = null;
  let delayBetweenMessages = 3000; // ms delay after response completes before next msg

  // ── DOM Helpers ────────────────────────────────────────────────────────
  function getEditor() {
    return document.querySelector('#ask-input, [data-lexical-editor="true"]');
  }

  function getSubmitButton() {
    return document.querySelector('button[aria-label="Submit"]');
  }

  function getStopButton() {
    return document.querySelector('button[aria-label="Stop response (Esc)"]');
  }

  function isResponseInProgress() {
    return !!getStopButton();
  }

  function isSubmitReady() {
    const btn = getSubmitButton();
    return btn && !btn.disabled;
  }

  // ── Lexical Editor Input ───────────────────────────────────────────────
  function typeIntoEditor(text) {
    const editor = getEditor();
    if (!editor) return false;

    editor.focus();

    // Clear existing content
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    selection.removeAllRanges();
    selection.addRange(range);

    // Use execCommand for Lexical compatibility
    document.execCommand('insertText', false, text);

    // Dispatch input event to trigger Lexical's internal state update
    editor.dispatchEvent(new Event('input', { bubbles: true }));

    return true;
  }

  function clickSubmit() {
    const btn = getSubmitButton();
    if (btn && !btn.disabled) {
      btn.click();
      return true;
    }
    return false;
  }

  // ── Queue Processing ──────────────────────────────────────────────────
  function startProcessing() {
    if (queue.length === 0) return;
    isProcessing = true;
    isPaused = false;
    // keep currentIndex if user set a start point, otherwise start from 0
    if (currentIndex >= queue.length) currentIndex = 0;
    updateFloatingUI();
    sendNext();
  }

  function stopProcessing() {
    isProcessing = false;
    isPaused = false;
    if (checkInterval) {
      clearInterval(checkInterval);
      checkInterval = null;
    }
    updateFloatingUI();
  }

  function pauseProcessing() {
    isPaused = true;
    if (checkInterval) {
      clearInterval(checkInterval);
      checkInterval = null;
    }
    updateFloatingUI();
  }

  function resumeProcessing() {
    if (!isProcessing) return;
    isPaused = false;
    updateFloatingUI();
    sendNext();
  }

  function sendNext() {
    if (!isProcessing || isPaused) return;
    if (currentIndex >= queue.length) {
      // All done
      const total = queue.length;
      isProcessing = false;
      isPaused = false;
      queue = [];
      currentIndex = 0;
      updateFloatingUI();
      notifyPopup();
      // Desktop notification
      try {
        chrome.runtime.sendMessage({ type: 'NOTIFY_DONE', count: total });
      } catch(e) {}
      return;
    }

    const message = queue[currentIndex];
    updateFloatingUI();

    // Wait until no response is in progress and editor is available
    waitForReady(() => {
      if (!isProcessing || isPaused) return;

      const typed = typeIntoEditor(message);
      if (!typed) {
        console.error('[ChatQueue] Failed to type into editor');
        stopProcessing();
        return;
      }

      // Small delay to let Lexical process, then submit
      setTimeout(() => {
        if (!isProcessing || isPaused) return;

        // Wait for submit button to be ready
        waitForSubmitReady(() => {
          if (!isProcessing || isPaused) return;

          const submitted = clickSubmit();
          if (!submitted) {
            console.error('[ChatQueue] Failed to click submit');
            stopProcessing();
            return;
          }

          // Wait for response to start, then wait for it to finish
          setTimeout(() => {
            waitForResponseComplete(() => {
              if (!isProcessing || isPaused) return;
              currentIndex++;
              updateFloatingUI();
              notifyPopup();

              // Delay before next message
              setTimeout(() => {
                sendNext();
              }, delayBetweenMessages);
            });
          }, 1000); // wait 1s for response to start
        });
      }, 500);
    });
  }

  function waitForReady(callback) {
    if (!isResponseInProgress() && getEditor()) {
      callback();
      return;
    }
    checkInterval = setInterval(() => {
      if (!isResponseInProgress() && getEditor()) {
        clearInterval(checkInterval);
        checkInterval = null;
        callback();
      }
    }, 1000);
  }

  function waitForSubmitReady(callback) {
    let attempts = 0;
    const iv = setInterval(() => {
      attempts++;
      if (isSubmitReady()) {
        clearInterval(iv);
        callback();
      } else if (attempts > 20) {
        clearInterval(iv);
        console.error('[ChatQueue] Submit button not ready after 20s');
        stopProcessing();
      }
    }, 1000);
  }

  function waitForResponseComplete(callback) {
    // First, make sure we detect the response starting
    const iv = setInterval(() => {
      if (!isResponseInProgress()) {
        clearInterval(iv);
        // Extra delay to ensure DOM is stable
        setTimeout(callback, 1000);
      }
    }, 1500);
  }

  // ── Floating UI ────────────────────────────────────────────────────────
  let floatingPanel = null;

  function createFloatingUI() {
    if (floatingPanel) return;

    floatingPanel = document.createElement('div');
    floatingPanel.id = 'pcq-floating-panel';
    floatingPanel.innerHTML = `
      <div class="pcq-header">
        <div class="pcq-logo">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
          </svg>
          <span>Chat Queue</span>
        </div>
        <div class="pcq-header-actions">
          <button id="pcq-toggle-panel" class="pcq-icon-btn" title="Collapse">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="pcq-body">
        <div class="pcq-status-bar">
          <div class="pcq-status-indicator" id="pcq-status-dot"></div>
          <span id="pcq-status-text">Ready</span>
          <span id="pcq-progress" class="pcq-progress-text"></span>
        </div>
        <div class="pcq-queue-list" id="pcq-queue-list">
          <div class="pcq-empty-state">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <span>No messages in queue</span>
          </div>
        </div>
        <div class="pcq-input-area">
          <textarea id="pcq-input" placeholder="Each line = 1 separate prompt.&#10;Blank lines will be skipped.&#10;Use \\n for newline within a prompt." rows="4"></textarea>
          <div class="pcq-input-footer">
            <label class="pcq-checkbox-label" id="pcq-single-label">
              <input type="checkbox" id="pcq-single-check">
              <span class="pcq-checkmark"></span>
              <span>Single prompt</span>
            </label>
            <button id="pcq-add-btn" class="pcq-btn pcq-btn-primary pcq-btn-sm">Add</button>
          </div>
        </div>
        <div class="pcq-actions">
          <button id="pcq-start" class="pcq-btn pcq-btn-primary" disabled>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            Start
          </button>
          <button id="pcq-pause" class="pcq-btn pcq-btn-warning pcq-hidden">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
            </svg>
            Pause
          </button>
          <button id="pcq-resume" class="pcq-btn pcq-btn-success pcq-hidden">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            Resume
          </button>
          <button id="pcq-stop" class="pcq-btn pcq-btn-danger pcq-hidden">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            </svg>
            Stop
          </button>
          <button id="pcq-clear" class="pcq-btn pcq-btn-ghost">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            Clear All
          </button>
          <button id="pcq-save" class="pcq-btn pcq-btn-ghost">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
            </svg>
            Save
          </button>
        </div>
        <div class="pcq-delay-setting">
          <label>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            Delay:
          </label>
          <input type="number" id="pcq-delay" value="3" min="1" max="60" step="1">
          <span>sec</span>
        </div>
        <div class="pcq-presets-section">
          <div class="pcq-presets-header">
            <button id="pcq-presets-toggle" class="pcq-presets-toggle-btn">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              Saved Presets
            </button>
            <div class="pcq-presets-actions">
              <button class="pcq-icon-btn-sm" id="pcq-import-btn" title="Import JSON"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>
              <button class="pcq-icon-btn-sm" id="pcq-export-btn" title="Export JSON"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></button>
              <button class="pcq-icon-btn-sm" id="pcq-add-folder-btn" title="Add folder"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
            </div>
          </div>
          <div id="pcq-presets-body" class="pcq-presets-body pcq-hidden">
            <div class="pcq-presets-search">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input type="text" id="pcq-preset-search" placeholder="Search presets...">
            </div>
            <div class="pcq-presets-tree" id="pcq-presets-tree">
              <div class="pcq-empty-state pcq-empty-sm"><span>No presets yet</span></div>
            </div>
          </div>
        </div>
        <div class="pcq-footer-links">
          <a href="https://www.paypal.com/paypalme/lanmtp" target="_blank" class="pcq-footer-link pcq-donate-link" title="Support from $1">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            Donate from $1
          </a>
          <a href="https://github.com/decorousbile/chat-queue" target="_blank" class="pcq-footer-link pcq-github-link" title="GitHub">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
            GitHub
          </a>
        </div>
      </div>
      <div id="pcq-save-modal" class="pcq-modal-overlay pcq-hidden">
        <div class="pcq-modal">
          <div class="pcq-modal-header"><span>Save Queue</span><button id="pcq-save-modal-close" class="pcq-modal-close">&times;</button></div>
          <div class="pcq-modal-body">
            <div class="pcq-form-group"><label>Preset name</label><input type="text" id="pcq-save-name" placeholder="e.g. Keyword Research"></div>
            <div class="pcq-form-group"><label>Folder</label><select id="pcq-save-folder"><option value="__new__">+ New folder...</option></select></div>
            <div class="pcq-form-group pcq-hidden" id="pcq-new-folder-group"><label>Folder name</label><input type="text" id="pcq-new-folder-name" placeholder="e.g. SEO"></div>
          </div>
          <div class="pcq-modal-footer"><button class="pcq-btn pcq-btn-ghost pcq-btn-sm" id="pcq-save-cancel">Cancel</button><button class="pcq-btn pcq-btn-primary pcq-btn-sm" id="pcq-save-confirm">Save</button></div>
        </div>
      </div>
      <div id="pcq-load-modal" class="pcq-modal-overlay pcq-hidden">
        <div class="pcq-modal">
          <div class="pcq-modal-header"><span>Load Preset</span><button id="pcq-load-modal-close" class="pcq-modal-close">&times;</button></div>
          <div class="pcq-modal-body"><p>What to do with the current queue?</p></div>
          <div class="pcq-modal-footer"><button class="pcq-btn pcq-btn-ghost pcq-btn-sm" id="pcq-load-cancel">Cancel</button><button class="pcq-btn pcq-btn-warning pcq-btn-sm" id="pcq-load-replace">Replace</button><button class="pcq-btn pcq-btn-primary pcq-btn-sm" id="pcq-load-append">Append</button></div>
        </div>
      </div>
      <input type="file" id="pcq-import-file" accept=".json" style="display:none">
    `;

    document.body.appendChild(floatingPanel);

    // Make panel draggable
    makeDraggable(floatingPanel, floatingPanel.querySelector('.pcq-header'));

    // Bind events
    bindFloatingEvents();
  }

  function bindFloatingEvents() {
    // Toggle collapse
    document.getElementById('pcq-toggle-panel').addEventListener('click', () => {
      floatingPanel.classList.toggle('pcq-collapsed');
      const icon = document.querySelector('#pcq-toggle-panel svg');
      if (floatingPanel.classList.contains('pcq-collapsed')) {
        icon.innerHTML = '<polyline points="18 15 12 9 6 15"/>';
      } else {
        icon.innerHTML = '<polyline points="6 9 12 15 18 9"/>';
      }
    });

    // Unified input with checkbox
    const input = document.getElementById('pcq-input');
    const addBtn = document.getElementById('pcq-add-btn');
    const singleCheck = document.getElementById('pcq-single-check');

    singleCheck.addEventListener('change', () => {
      input.placeholder = singleCheck.checked
        ? 'Enter your entire prompt here...'
        : 'Each line = 1 separate prompt.\nBlank lines will be skipped.\nUse \\n for newline within a prompt.';
    });

    function addMessages() {
      const text = input.value;
      if (!text.trim()) return;
      let messages;
      if (singleCheck.checked) {
        messages = [text.trim()];
      } else {
        messages = text.split('\n').filter(l => l.trim() !== '').map(l => l.replace(/\\n/g, '\n'));
      }
      messages.forEach(m => queue.push(m));
      input.value = '';
      updateFloatingUI();
      notifyPopup();
    }

    addBtn.addEventListener('click', addMessages);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); addMessages(); }
    });

    // Start
    document.getElementById('pcq-start').addEventListener('click', () => startProcessing());
    document.getElementById('pcq-pause').addEventListener('click', () => pauseProcessing());
    document.getElementById('pcq-resume').addEventListener('click', () => resumeProcessing());
    document.getElementById('pcq-stop').addEventListener('click', () => stopProcessing());
    document.getElementById('pcq-clear').addEventListener('click', () => {
      if (isProcessing) return;
      queue = []; currentIndex = 0; updateFloatingUI(); notifyPopup();
    });

    // Delay setting
    document.getElementById('pcq-delay').addEventListener('change', (e) => {
      delayBetweenMessages = Math.max(1, parseInt(e.target.value) || 3) * 1000;
    });

    // ── Presets ──
    let pendingLoadMessages = null;
    const esc = s => s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    async function loadPresets() { const d = await chrome.storage.local.get('pcq_presets'); return d.pcq_presets || { folders: {} }; }
    async function savePresetsData(p) { await chrome.storage.local.set({ pcq_presets: p }); }

    // Toggle presets section
    document.getElementById('pcq-presets-toggle').addEventListener('click', () => {
      const body = document.getElementById('pcq-presets-body');
      body.classList.toggle('pcq-hidden');
      const chevron = document.querySelector('#pcq-presets-toggle svg:first-child');
      if (body.classList.contains('pcq-hidden')) {
        chevron.innerHTML = '<polyline points="6 9 12 15 18 9"/>';
      } else {
        chevron.innerHTML = '<polyline points="18 15 12 9 6 15"/>';
        renderPresetsTree();
      }
    });

    // Search
    document.getElementById('pcq-preset-search').addEventListener('input', (e) => renderPresetsTree(e.target.value));

    // Render tree
    async function renderPresetsTree(filter = '') {
      const tree = document.getElementById('pcq-presets-tree');
      const presets = await loadPresets();
      const keys = Object.keys(presets.folders).sort();
      if (keys.length === 0) { tree.innerHTML = '<div class="pcq-empty-state pcq-empty-sm"><span>No presets yet</span></div>'; return; }
      const lf = filter.toLowerCase();
      let html = '';
      keys.forEach(fn => {
        const folder = presets.folders[fn];
        const pks = Object.keys(folder.presets || {}).filter(k => !lf || k.toLowerCase().includes(lf) || fn.toLowerCase().includes(lf)).sort();
        if (lf && pks.length === 0) return;
        html += `<div class="pcq-folder-item"><div class="pcq-folder-hdr" data-f="${esc(fn)}"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg><span>${esc(fn)}</span><span class="pcq-folder-cnt">${pks.length}</span><div class="pcq-folder-acts"><button class="pcq-icon-btn-sm" data-rf="${esc(fn)}" title="Rename"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button><button class="pcq-icon-btn-sm" data-df="${esc(fn)}" title="Delete"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div></div><div class="pcq-folder-children">`;
        pks.forEach(pk => {
          const p = folder.presets[pk];
          html += `<div class="pcq-preset-row" data-lf="${esc(fn)}" data-lk="${esc(pk)}"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><span class="pcq-preset-nm">${esc(p.name)}</span><span class="pcq-preset-cnt">${p.messages.length}</span><button class="pcq-icon-btn-sm pcq-del-preset" data-dpf="${esc(fn)}" data-dpk="${esc(pk)}" title="Delete"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>`;
        });
        html += '</div></div>';
      });
      tree.innerHTML = html || '<div class="pcq-empty-state pcq-empty-sm"><span>No results</span></div>';
      // Bind
      tree.querySelectorAll('.pcq-folder-hdr').forEach(h => h.addEventListener('click', e => { if (e.target.closest('.pcq-folder-acts')) return; h.classList.toggle('pcq-collapsed'); h.nextElementSibling.classList.toggle('pcq-hidden'); }));
      tree.querySelectorAll('[data-df]').forEach(b => b.addEventListener('click', async e => { e.stopPropagation(); if (!confirm(`Delete folder "${b.dataset.df}"?`)) return; const p = await loadPresets(); delete p.folders[b.dataset.df]; await savePresetsData(p); renderPresetsTree(document.getElementById('pcq-preset-search').value); }));
      tree.querySelectorAll('[data-rf]').forEach(b => b.addEventListener('click', async e => { e.stopPropagation(); const nn = prompt('New name:', b.dataset.rf); if (!nn || nn === b.dataset.rf) return; const p = await loadPresets(); p.folders[nn] = p.folders[b.dataset.rf]; delete p.folders[b.dataset.rf]; await savePresetsData(p); renderPresetsTree(document.getElementById('pcq-preset-search').value); }));
      tree.querySelectorAll('.pcq-del-preset').forEach(b => b.addEventListener('click', async e => { e.stopPropagation(); const p = await loadPresets(); delete p.folders[b.dataset.dpf].presets[b.dataset.dpk]; await savePresetsData(p); renderPresetsTree(document.getElementById('pcq-preset-search').value); }));
      tree.querySelectorAll('.pcq-preset-row').forEach(row => row.addEventListener('click', async e => {
        if (e.target.closest('.pcq-del-preset')) return;
        const p = await loadPresets(); const preset = p.folders[row.dataset.lf]?.presets[row.dataset.lk];
        if (!preset) return;
        pendingLoadMessages = preset.messages;
        document.getElementById('pcq-load-modal').classList.remove('pcq-hidden');
      }));
    }

    // Save modal
    document.getElementById('pcq-save').addEventListener('click', async () => {
      if (queue.length === 0) return;
      const p = await loadPresets();
      const sel = document.getElementById('pcq-save-folder');
      sel.innerHTML = '<option value="__new__">+ New folder...</option>';
      Object.keys(p.folders).sort().forEach(f => { sel.innerHTML += `<option value="${esc(f)}">${esc(f)}</option>`; });
      if (Object.keys(p.folders).length > 0) sel.value = Object.keys(p.folders).sort()[0];
      document.getElementById('pcq-save-name').value = '';
      document.getElementById('pcq-new-folder-name').value = '';
      document.getElementById('pcq-new-folder-group').classList.toggle('pcq-hidden', sel.value !== '__new__');
      document.getElementById('pcq-save-modal').classList.remove('pcq-hidden');
    });
    document.getElementById('pcq-save-folder').addEventListener('change', e => {
      document.getElementById('pcq-new-folder-group').classList.toggle('pcq-hidden', e.target.value !== '__new__');
    });
    document.getElementById('pcq-save-confirm').addEventListener('click', async () => {
      const name = document.getElementById('pcq-save-name').value.trim();
      if (!name) return;
      let folder = document.getElementById('pcq-save-folder').value;
      if (folder === '__new__') { folder = document.getElementById('pcq-new-folder-name').value.trim(); if (!folder) return; }
      const p = await loadPresets();
      if (!p.folders[folder]) p.folders[folder] = { presets: {} };
      const key = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\u00C0-\u024F\u1E00-\u1EFF-]/gi, '') || Date.now();
      p.folders[folder].presets[key] = { name, messages: [...queue], createdAt: Date.now() };
      await savePresetsData(p);
      document.getElementById('pcq-save-modal').classList.add('pcq-hidden');
      if (!document.getElementById('pcq-presets-body').classList.contains('pcq-hidden')) renderPresetsTree(document.getElementById('pcq-preset-search').value);
    });
    ['pcq-save-cancel', 'pcq-save-modal-close'].forEach(id => document.getElementById(id).addEventListener('click', () => document.getElementById('pcq-save-modal').classList.add('pcq-hidden')));

    // Load modal
    document.getElementById('pcq-load-replace').addEventListener('click', () => {
      if (!pendingLoadMessages) return;
      queue = [...pendingLoadMessages]; currentIndex = 0; pendingLoadMessages = null;
      document.getElementById('pcq-load-modal').classList.add('pcq-hidden');
      updateFloatingUI(); notifyPopup();
    });
    document.getElementById('pcq-load-append').addEventListener('click', () => {
      if (!pendingLoadMessages) return;
      pendingLoadMessages.forEach(m => queue.push(m)); pendingLoadMessages = null;
      document.getElementById('pcq-load-modal').classList.add('pcq-hidden');
      updateFloatingUI(); notifyPopup();
    });
    ['pcq-load-cancel', 'pcq-load-modal-close'].forEach(id => document.getElementById(id).addEventListener('click', () => { pendingLoadMessages = null; document.getElementById('pcq-load-modal').classList.add('pcq-hidden'); }));

    // Add folder
    document.getElementById('pcq-add-folder-btn').addEventListener('click', async () => {
      const name = prompt('New folder name:');
      if (!name) return;
      const p = await loadPresets(); if (!p.folders[name]) p.folders[name] = { presets: {} };
      await savePresetsData(p);
      document.getElementById('pcq-presets-body').classList.remove('pcq-hidden');
      renderPresetsTree();
    });

    // Export
    document.getElementById('pcq-export-btn').addEventListener('click', async () => {
      const p = await loadPresets();
      const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'chat-queue-presets.json'; a.click();
      URL.revokeObjectURL(url);
    });

    // Import
    document.getElementById('pcq-import-btn').addEventListener('click', () => document.getElementById('pcq-import-file').click());
    document.getElementById('pcq-import-file').addEventListener('change', async e => {
      const file = e.target.files[0]; if (!file) return;
      try {
        const imported = JSON.parse(await file.text());
        if (!imported.folders) throw new Error('Invalid');
        const existing = await loadPresets();
        Object.keys(imported.folders).forEach(f => {
          if (!existing.folders[f]) existing.folders[f] = { presets: {} };
          Object.assign(existing.folders[f].presets, imported.folders[f].presets);
        });
        await savePresetsData(existing);
        document.getElementById('pcq-presets-body').classList.remove('pcq-hidden');
        renderPresetsTree();
        alert('Import successful!');
      } catch (err) { alert('Import error: ' + err.message); }
      e.target.value = '';
    });
  }

  function updateFloatingUI() {
    if (!floatingPanel) return;

    const listEl = document.getElementById('pcq-queue-list');
    const statusDot = document.getElementById('pcq-status-dot');
    const statusText = document.getElementById('pcq-status-text');
    const progressText = document.getElementById('pcq-progress');
    const startBtn = document.getElementById('pcq-start');
    const pauseBtn = document.getElementById('pcq-pause');
    const resumeBtn = document.getElementById('pcq-resume');
    const stopBtn = document.getElementById('pcq-stop');
    const clearBtn = document.getElementById('pcq-clear');

    // Update status
    if (isProcessing && !isPaused) {
      statusDot.className = 'pcq-status-indicator pcq-status-active';
      statusText.textContent = 'Processing';
      progressText.textContent = `${currentIndex + 1}/${queue.length}`;
    } else if (isProcessing && isPaused) {
      statusDot.className = 'pcq-status-indicator pcq-status-paused';
      statusText.textContent = 'Paused';
      progressText.textContent = `${currentIndex + 1}/${queue.length}`;
    } else {
      statusDot.className = 'pcq-status-indicator pcq-status-idle';
      if (queue.length > 0) {
        statusText.textContent = `${queue.length} messages queued`;
        progressText.textContent = currentIndex > 0 ? `Start from #${currentIndex + 1}` : '';
      } else {
        statusText.textContent = 'Ready';
        progressText.textContent = '';
      }
    }

    // Update buttons
    startBtn.disabled = queue.length === 0 || isProcessing;
    startBtn.classList.toggle('pcq-hidden', isProcessing);
    pauseBtn.classList.toggle('pcq-hidden', !isProcessing || isPaused);
    resumeBtn.classList.toggle('pcq-hidden', !isProcessing || !isPaused);
    stopBtn.classList.toggle('pcq-hidden', !isProcessing);
    clearBtn.disabled = isProcessing;

    // Render queue list
    if (queue.length === 0) {
      listEl.innerHTML = `
        <div class="pcq-empty-state">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span>No messages in queue</span>
        </div>
      `;
      return;
    }

    listEl.innerHTML = queue.map((msg, i) => {
      let stateClass = '', stateLabel = '';
      if (isProcessing) {
        if (i < currentIndex) { stateClass = 'pcq-item-done'; stateLabel = '✓'; }
        else if (i === currentIndex) { stateClass = 'pcq-item-current'; stateLabel = '►'; }
        else { stateClass = 'pcq-item-pending'; stateLabel = (i + 1).toString(); }
      } else {
        stateLabel = (i + 1).toString();
        if (i === currentIndex && currentIndex > 0) stateClass = 'pcq-item-startpoint';
      }
      const preview = msg.length > 80 ? msg.substring(0, 80) + '…' : msg;
      const escapedPreview = preview.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, ' ↵ ');
      return `<div class="pcq-queue-item ${stateClass}" draggable="${!isProcessing}" data-index="${i}">
        ${!isProcessing ? '<div class="pcq-item-drag" title="Drag to reorder"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="2"/><circle cx="15" cy="5" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="9" cy="19" r="2"/><circle cx="15" cy="19" r="2"/></svg></div>' : ''}
        <div class="pcq-item-index">${stateLabel}</div>
        <div class="pcq-item-text" title="${msg.replace(/"/g, '&quot;').replace(/\n/g, '↵')}">${escapedPreview}</div>
        ${!isProcessing ? `<div class="pcq-item-actions">
          <button class="pcq-item-btn pcq-item-setstart ${i === currentIndex ? 'pcq-active-start' : ''}" data-setstart="${i}" title="${i === currentIndex ? 'Start point' : 'Start from here'}"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg></button>
          <button class="pcq-item-btn pcq-item-dup" data-dup="${i}" title="Duplicate"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
          <button class="pcq-item-btn pcq-item-remove" data-remove="${i}" title="Remove"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>` : ''}
      </div>`;
    }).join('');

    // Bind remove, duplicate & set-start
    listEl.querySelectorAll('.pcq-item-remove').forEach(btn => {
      btn.addEventListener('click', () => { queue.splice(parseInt(btn.dataset.remove), 1); if (currentIndex >= queue.length) currentIndex = 0; updateFloatingUI(); notifyPopup(); });
    });
    listEl.querySelectorAll('.pcq-item-dup').forEach(btn => {
      btn.addEventListener('click', () => { const i = parseInt(btn.dataset.dup); queue.splice(i + 1, 0, queue[i]); updateFloatingUI(); notifyPopup(); });
    });
    listEl.querySelectorAll('.pcq-item-setstart').forEach(btn => {
      btn.addEventListener('click', () => { currentIndex = parseInt(btn.dataset.setstart); startProcessing(); });
    });

    // Drag reorder
    if (!isProcessing) {
      let dragIdx = null;
      listEl.querySelectorAll('.pcq-queue-item').forEach(item => {
        item.addEventListener('dragstart', (e) => { dragIdx = parseInt(item.dataset.index); item.classList.add('pcq-dragging'); e.dataTransfer.effectAllowed = 'move'; });
        item.addEventListener('dragend', () => { item.classList.remove('pcq-dragging'); dragIdx = null; listEl.querySelectorAll('.pcq-drag-over').forEach(e => e.classList.remove('pcq-drag-over')); });
        item.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; listEl.querySelectorAll('.pcq-drag-over').forEach(e => e.classList.remove('pcq-drag-over')); item.classList.add('pcq-drag-over'); });
        item.addEventListener('dragleave', () => item.classList.remove('pcq-drag-over'));
        item.addEventListener('drop', (e) => {
          e.preventDefault(); item.classList.remove('pcq-drag-over');
          const toIdx = parseInt(item.dataset.index);
          if (dragIdx !== null && dragIdx !== toIdx) {
            const [moved] = queue.splice(dragIdx, 1); queue.splice(toIdx, 0, moved);
            updateFloatingUI(); notifyPopup();
          }
        });
      });
    }

    // Scroll to current item
    if (isProcessing) {
      const currentItem = listEl.querySelector('.pcq-item-current');
      if (currentItem) {
        currentItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }

  // ── Draggable ──────────────────────────────────────────────────────────
  function makeDraggable(element, handle) {
    let isDragging = false;
    let startX, startY, initialX, initialY;

    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = element.getBoundingClientRect();
      initialX = rect.left;
      initialY = rect.top;
      element.style.transition = 'none';
      document.addEventListener('mousemove', onDrag);
      document.addEventListener('mouseup', onDragEnd);
      e.preventDefault();
    });

    function onDrag(e) {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      let newX = initialX + dx;
      let newY = initialY + dy;

      // Clamp to viewport
      const w = element.offsetWidth;
      const h = element.offsetHeight;
      newX = Math.max(0, Math.min(window.innerWidth - w, newX));
      newY = Math.max(0, Math.min(window.innerHeight - h, newY));

      element.style.right = 'auto';
      element.style.bottom = 'auto';
      element.style.left = newX + 'px';
      element.style.top = newY + 'px';
    }

    function onDragEnd() {
      isDragging = false;
      element.style.transition = '';
      document.removeEventListener('mousemove', onDrag);
      document.removeEventListener('mouseup', onDragEnd);
    }
  }

  // ── Communication with popup ───────────────────────────────────────────
  function notifyPopup() {
    chrome.runtime.sendMessage({
      type: 'QUEUE_STATE_UPDATE',
      queue: queue,
      currentIndex: currentIndex,
      isProcessing: isProcessing,
      isPaused: isPaused
    }).catch(() => { /* popup may not be open */ });
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'GET_STATE') {
      sendResponse({
        queue: queue,
        currentIndex: currentIndex,
        isProcessing: isProcessing,
        isPaused: isPaused
      });
      return true;
    }

    if (msg.type === 'ADD_MESSAGES') {
      msg.messages.forEach(m => queue.push(m));
      updateFloatingUI();
      sendResponse({ ok: true });
      return true;
    }

    if (msg.type === 'START') {
      startProcessing();
      sendResponse({ ok: true });
      return true;
    }

    if (msg.type === 'PAUSE') {
      pauseProcessing();
      sendResponse({ ok: true });
      return true;
    }

    if (msg.type === 'RESUME') {
      resumeProcessing();
      sendResponse({ ok: true });
      return true;
    }

    if (msg.type === 'STOP') {
      stopProcessing();
      sendResponse({ ok: true });
      return true;
    }

    if (msg.type === 'CLEAR') {
      if (!isProcessing) {
        queue = [];
        currentIndex = 0;
        updateFloatingUI();
      }
      sendResponse({ ok: true });
      return true;
    }

    if (msg.type === 'REMOVE_MESSAGE') {
      if (!isProcessing && msg.index >= 0 && msg.index < queue.length) {
        queue.splice(msg.index, 1);
        updateFloatingUI();
      }
      sendResponse({ ok: true });
      return true;
    }

    if (msg.type === 'DUPLICATE_MESSAGE') {
      if (!isProcessing && msg.index >= 0 && msg.index < queue.length) {
        queue.splice(msg.index + 1, 0, queue[msg.index]);
        updateFloatingUI();
      }
      sendResponse({ ok: true });
      return true;
    }

    if (msg.type === 'REORDER') {
      if (!isProcessing && msg.from >= 0 && msg.from < queue.length && msg.to >= 0 && msg.to < queue.length) {
        const [moved] = queue.splice(msg.from, 1);
        queue.splice(msg.to, 0, moved);
        updateFloatingUI();
      }
      sendResponse({ ok: true });
      return true;
    }

    if (msg.type === 'SET_DELAY') {
      delayBetweenMessages = msg.delay * 1000;
      const delayInput = document.getElementById('pcq-delay');
      if (delayInput) delayInput.value = msg.delay;
      sendResponse({ ok: true });
      return true;
    }
  });

  // ── Init ───────────────────────────────────────────────────────────────
  function init() {
    createFloatingUI();
    updateFloatingUI();
    console.log('[ChatQueue] Perplexity Chat Queue initialized');
  }

  // Wait for page to be ready
  if (document.readyState === 'complete') {
    init();
  } else {
    window.addEventListener('load', init);
  }
})();
