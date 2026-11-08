function _saveBoardTriggers(boardId) {
  const board = window.boardList.find(b => b.id === boardId);
  if (!board) return;
  const settings = window.parseBoardSettings ? window.parseBoardSettings(board.settings) : JSON.parse(board.settings || '{}');
  const triggers = settings.triggers && typeof settings.triggers === 'object' ? settings.triggers : {};
  const keys = (window.Notifier && window.Notifier.EVENT_KEYS) || ['on_create', 'on_transition', 'on_done', 'on_closed'];
  keys.forEach(key => {
    const notifyEl = document.querySelector(`.board-trigger-notify[data-board-id="${boardId}"][data-trigger="${key}"]`);
    const webhookEl = document.querySelector(`.board-trigger-webhook[data-board-id="${boardId}"][data-trigger="${key}"]`);
    triggers[key] = {
      notify: notifyEl ? !!notifyEl.checked : !!(triggers[key] && triggers[key].notify),
      webhook: webhookEl ? webhookEl.value.trim() : ((triggers[key] && triggers[key].webhook) || ''),
    };
  });
  settings.triggers = triggers;
  const payload = JSON.stringify(settings);
  board.settings = payload;
  window.API.updateBoard(boardId, { settings: payload })
    .then(() => { if (window.Toast) window.Toast.success('Triggers saved', { duration: 1200 }); })
    .catch((e) => {
      console.error('updateBoard triggers failed', e);
      if (window.Toast) window.Toast.error('Failed to save triggers: ' + ((e && e.message) || 'unknown'));
    });
}

function testBoardTrigger(btn) {
  const boardId = btn.dataset.boardId;
  const key = btn.dataset.trigger;
  const control = btn.closest('.settings-row-control');
  const webhookEl = control ? control.querySelector('.board-trigger-webhook') : null;
  const url = webhookEl ? webhookEl.value.trim() : '';

  if (url) {
    // Webhook URL present — test the webhook.
    testWebhook(btn);
    return;
  }
  // No URL — test the browser notification path for this event.
  if (window.Notifier) window.Notifier.testTriggerEvent(boardId, key);
}

// ── Transition Rules ──

const TRANSITION_RULES = [
  {
    id: 'no_blocked_to_done',
    label: 'Blocked tickets cannot be closed',
    desc: 'Prevent moving a card to Done if it has blocking dependencies',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>',
  },
  {
    id: 'require_comment_done',
    label: 'Require a comment to close',
    desc: 'At least one comment must exist before moving to Done',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  },
  {
    id: 'require_assignee_prog',
    label: 'Require assignee to start',
    desc: 'A card must have an assignee before moving to In Progress',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  },
  {
    id: 'require_desc_done',
    label: 'Require description to close',
    desc: 'Card must have a description before moving to Done',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2"><line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/></svg>',
  },
  {
    id: 'no_done_backward',
    label: 'Prevent reopening closed tickets',
    desc: 'Cards in Done cannot be moved back to earlier columns',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2"><polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/></svg>',
  },
];

async function loadTransitionsSettings() {
  const container = document.getElementById('settings-transitions-content');
  if (!container) return;
  container.innerHTML = '';

  try {
    const boards = window.currentWorkspace
      ? await window.API.listWorkspaceBoards(window.currentWorkspace.slug)
      : await window.API.listBoards();
    if (!boards || boards.length === 0) {
      container.innerHTML = '<div style="color:var(--text-dimmed);font-size:0.85rem;padding:8px 0">No boards yet</div>';
      return;
    }

    // Board selector if multiple boards
    let selectedBoardId = window.currentBoardId || boards[0].id;
    const selectedBoard = boards.find(b => b.id === selectedBoardId) || boards[0];
    selectedBoardId = selectedBoard.id;

    if (boards.length > 1) {
      const selector = document.createElement('div');
      selector.className = 'settings-group';
      selector.innerHTML = `
        <div class="settings-row">
          <div class="settings-row-label"><div class="settings-row-title">Board</div></div>
          <div class="settings-row-control">
            <select class="settings-input" id="transitions-board-select" style="width:200px;height:34px">
              ${boards.map(b => `<option value="${b.id}" ${b.id === selectedBoardId ? 'selected' : ''}>${window._escHtml(b.name)}</option>`).join('')}
            </select>
          </div>
        </div>`;
      container.appendChild(selector);
      selector.querySelector('#transitions-board-select').addEventListener('change', function() {
        _renderTransitionRules(this.value, boards);
      });
    }

    const rulesContainer = document.createElement('div');
    rulesContainer.id = 'transitions-rules-list';
    container.appendChild(rulesContainer);

    _renderTransitionRules(selectedBoardId, boards);
  } catch (e) {
    container.innerHTML = '<div style="color:var(--text-dimmed);font-size:0.85rem;padding:8px 0">Failed to load boards</div>';
  }
}

function _renderTransitionRules(boardId, boards) {
  const container = document.getElementById('transitions-rules-list');
  if (!container) return;

  const board = boards.find(b => b.id === boardId);
  if (!board) return;

  const settings = JSON.parse(board.settings || '{}');
  const rules = settings.transition_rules || {};

  let html = '<div class="settings-group"><div class="settings-group-title">Rules</div>';

  TRANSITION_RULES.forEach(rule => {
    const enabled = !!rules[rule.id];
    html += `
      <div class="settings-row transition-rule-row">
        <div class="settings-row-label" style="display:flex;align-items:flex-start;gap:12px">
          <span class="transition-rule-icon">${rule.icon}</span>
          <div>
            <div class="settings-row-title">${rule.label}</div>
            <div class="settings-row-desc">${rule.desc}</div>
          </div>
        </div>
        <div class="settings-row-control">
          <label class="settings-toggle">
            <input type="checkbox" class="transition-rule-toggle" data-board-id="${boardId}" data-rule-id="${rule.id}" ${enabled ? 'checked' : ''} />
            <span class="toggle-track"></span>
          </label>
        </div>
      </div>`;
  });

  html += '</div>';
  container.innerHTML = html;

  // Bind toggles
  container.querySelectorAll('.transition-rule-toggle').forEach(toggle => {
    toggle.addEventListener('change', () => {
      _saveTransitionRule(toggle.dataset.boardId, toggle.dataset.ruleId, toggle.checked, boards);
    });
  });
}

function _saveTransitionRule(boardId, ruleId, enabled, boards) {
  const board = boards.find(b => b.id === boardId);
  if (!board) return;

  const settings = JSON.parse(board.settings || '{}');
  if (!settings.transition_rules) settings.transition_rules = {};
  settings.transition_rules[ruleId] = enabled;

  // Clean up false values
  if (!enabled) delete settings.transition_rules[ruleId];
  if (Object.keys(settings.transition_rules).length === 0) delete settings.transition_rules;

  board.settings = JSON.stringify(settings);
  window.API.updateBoard(boardId, { settings: JSON.stringify(settings) })
    .then(() => window.Toast.success('Transition rule updated'))
    .catch(() => window.Toast.error('Failed to update rule'));
}

// ── Webhook Test ──

async function testWebhook(btn) {
  const control = btn.closest('.settings-row-control');
  const input = control ? control.querySelector('.settings-input') : null;
  const url = input ? input.value.trim() : '';
  if (!url) {
    window.Toast.error('Enter a webhook URL first');
    return;
  }
  btn.disabled = true;
  btn.textContent = '...';
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'test', timestamp: new Date().toISOString() }),
    });
    if (resp.ok) {
      window.Toast.success('Webhook responded ' + resp.status);
    } else {
      window.Toast.error('Webhook returned ' + resp.status);
    }
  } catch (e) {
    window.Toast.error('Webhook failed: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Test';
  }
}

window.testBoardTrigger = testBoardTrigger;
window.loadTransitionsSettings = loadTransitionsSettings;
window.testWebhook = testWebhook;
window._saveBoardTriggers = _saveBoardTriggers;
