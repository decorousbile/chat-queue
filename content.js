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
    currentIndex = 0;
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
        </div>
        <div class="pcq-delay-setting">
          <label>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            Delay between messages:
          </label>
          <input type="number" id="pcq-delay" value="3" min="1" max="60" step="1">
          <span>seconds</span>
        </div>
      </div>
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
      statusText.textContent = queue.length > 0 ? `${queue.length} messages queued` : 'Ready';
      progressText.textContent = '';
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
      } else { stateLabel = (i + 1).toString(); }
      const preview = msg.length > 80 ? msg.substring(0, 80) + '…' : msg;
      const escapedPreview = preview.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, ' ↵ ');
      return `<div class="pcq-queue-item ${stateClass}" draggable="${!isProcessing}" data-index="${i}">
        ${!isProcessing ? '<div class="pcq-item-drag" title="Drag to reorder"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="2"/><circle cx="15" cy="5" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="9" cy="19" r="2"/><circle cx="15" cy="19" r="2"/></svg></div>' : ''}
        <div class="pcq-item-index">${stateLabel}</div>
        <div class="pcq-item-text" title="${msg.replace(/"/g, '&quot;').replace(/\n/g, '↵')}">${escapedPreview}</div>
        ${!isProcessing ? `<div class="pcq-item-actions">
          <button class="pcq-item-btn pcq-item-dup" data-dup="${i}" title="Duplicate"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
          <button class="pcq-item-btn pcq-item-remove" data-remove="${i}" title="Remove"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>` : ''}
      </div>`;
    }).join('');

    // Bind remove & duplicate
    listEl.querySelectorAll('.pcq-item-remove').forEach(btn => {
      btn.addEventListener('click', () => { queue.splice(parseInt(btn.dataset.remove), 1); updateFloatingUI(); notifyPopup(); });
    });
    listEl.querySelectorAll('.pcq-item-dup').forEach(btn => {
      btn.addEventListener('click', () => { const i = parseInt(btn.dataset.dup); queue.splice(i + 1, 0, queue[i]); updateFloatingUI(); notifyPopup(); });
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
