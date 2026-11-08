// ── Board Enable/Disable ──

function toggleBoardEnabled(checkbox) {
  const card = checkbox.closest('.settings-board-card');
  if (!card) return;
  if (checkbox.checked) {
    card.classList.remove('disabled');
  } else {
    card.classList.add('disabled');
  }
}

// ── Boards Settings (dynamic from API) ──

let _boardSettingsDebounce = {};

async function loadBoardsSettings() {
  const container = document.getElementById('settings-boards-list');
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
    window.boardList = boards;
    if (typeof window.syncCurrentBoardTheme === 'function') {
      window.syncCurrentBoardTheme();
    }

    // Fetch card counts for each board in parallel
    const details = await Promise.all(boards.map(b => window.API.getBoard(b.id).catch(() => null)));

    boards.forEach((board, idx) => {
      const detail = details[idx];
      const cardCounts = detail ? detail.card_counts || {} : {};
      const totalCards = Object.values(cardCounts).reduce((s, n) => s + n, 0);
      const columns = JSON.parse(board.columns || '[]');
      const configId = 'board-config-' + board.id;
      const isDefault = idx === 0;
      const boardIcon = '<svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:var(--text-dimmed);fill:none;stroke-width:2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>';

      const card = document.createElement('div');
      card.className = 'settings-board-card';

      // Header
      const header = document.createElement('div');
      header.className = 'settings-board-header';
      header.onclick = () => window.toggleBoardConfig(configId);
      header.innerHTML = `
        <div class="settings-board-name">
          ${boardIcon}
          ${_escHtml(board.name)}
          ${isDefault ? '<span class="settings-board-badge">default</span>' : ''}
        </div>
        <div class="settings-board-meta">${totalCards} card${totalCards !== 1 ? 's' : ''} <svg class="settings-board-chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg></div>`;
      card.appendChild(header);

      // Config panel
      const config = document.createElement('div');
      config.className = 'settings-board-config hidden';
      config.id = configId;

      // Configuration group
      const settings = window.parseBoardSettings ? window.parseBoardSettings(board.settings) : JSON.parse(board.settings || '{}');
      let configHTML = `
        <div class="settings-group">
          <div class="settings-group-title">Configuration</div>
          <div class="settings-row">
            <div class="settings-row-label"><div class="settings-row-title">Project key</div><div class="settings-row-desc">Prefix for ticket IDs (e.g. ${_escHtml(board.project_key)}-101)</div></div>
            <div class="settings-row-control"><input class="settings-input board-project-key-input" data-board-id="${board.id}" value="${_escHtml(board.project_key)}" style="width:100px" /></div>
          </div>
        </div>`;

      // Columns group with editable labels, colors, drag reorder, add/remove
      const COL_PALETTE = ['#8c8c8c','#579DFF','#fb8c00','#4ade80','#f44336','#9f8fef','#6cc3e0','#f5cd47'];
      configHTML += `
        <div class="settings-group">
          <div class="settings-group-title">Columns</div>
          <div class="settings-columns-list" data-board-id="${board.id}">`;
      columns.forEach((col, ci) => {
        const count = cardCounts[col.id] || 0;
        const color = col.color || COL_PALETTE[ci % COL_PALETTE.length];
        const isFirst = ci === 0;
        const isLast = ci === columns.length - 1;
        const typeLabel = isFirst ? 'Start' : isLast ? 'Done' : '';
        configHTML += `
            <div class="settings-column-row" data-col-index="${ci}" data-col-id="${_escHtml(col.id)}">
              <span class="settings-column-drag" draggable="true" title="Drag to reorder">&#x2261;</span>
              <input class="settings-input board-column-label-input" data-board-id="${board.id}" data-col-index="${ci}" value="${_escHtml(col.label)}" style="width:140px;height:30px;font-size:0.88rem;font-weight:500" />
              <button class="settings-column-color-btn" data-col-index="${ci}" style="background:${color}" title="Change color"></button>
              <span class="settings-column-count">${count} card${count !== 1 ? 's' : ''}${typeLabel ? ' · ' + typeLabel : ''}</span>
              ${columns.length > 2 ? '<button class="settings-column-remove-btn" data-col-index="' + ci + '" data-col-id="' + _escHtml(col.id) + '" data-card-count="' + count + '" title="Remove column">&times;</button>' : ''}
            </div>`;
      });
      configHTML += `
          </div>
          <button class="btn settings-column-add-btn" data-board-id="${board.id}" style="margin-top:10px;font-size:0.82rem;padding:4px 14px">+ Add column</button>
        </div>`;

      configHTML += window._renderCustomFieldsConfig(board.id, settings.custom_fields || []);

      // Triggers group (browser notification + webhook per event)
      const triggers = window.Notifier
        ? window.Notifier.normalizeTriggers(settings)
        : { on_create: {notify:false,webhook:''}, on_transition: {notify:false,webhook:''}, on_done: {notify:false,webhook:''}, on_closed: {notify:false,webhook:''} };
      const triggerRow = (key, title, desc) => {
        const t = triggers[key] || { notify: false, webhook: '' };
        return `
          <div class="settings-row">
            <div class="settings-row-label">
              <div class="settings-row-title">${title}</div>
              <div class="settings-row-desc">${desc}</div>
            </div>
            <div class="settings-row-control" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:flex-end">
              <label class="settings-toggle" title="Browser notification">
                <input type="checkbox" class="board-trigger-notify" data-board-id="${board.id}" data-trigger="${key}" ${t.notify ? 'checked' : ''}>
                <span class="toggle-track"></span>
              </label>
              <input class="settings-input board-trigger-webhook" data-board-id="${board.id}" data-trigger="${key}" value="${_escHtml(t.webhook || '')}" placeholder="Webhook URL (optional)" style="min-width:220px" />
              <button class="btn board-trigger-test" data-board-id="${board.id}" data-trigger="${key}" style="font-size:0.78rem;flex-shrink:0" onclick="testBoardTrigger(this)">Test</button>
            </div>
          </div>`;
      };
      configHTML += `
        <div class="settings-group">
          <div class="settings-group-title">Triggers</div>
          <div class="settings-row-desc" style="padding:0 0 10px 0;color:var(--text-dimmed);font-size:0.8rem">
            For each event, enable a desktop notification and/or POST to a webhook.
            Desktop notifications require the global toggle in <em>Notifications</em>.
          </div>
          ${triggerRow('on_create', 'On create', 'A new card is created on this board')}
          ${triggerRow('on_transition', 'On transition', 'A card moves between columns')}
          ${triggerRow('on_done', 'On done', 'A card moves to a Done column')}
          ${triggerRow('on_closed', 'On closed', 'A card moves to Closed (cleared)')}
        </div>`;

      config.innerHTML = configHTML;
      card.appendChild(config);
      container.appendChild(card);
    });

    // Bind change handlers for all board inputs
    _bindBoardSettingsInputs();
  } catch (e) {
    container.innerHTML = '<div style="color:var(--text-dimmed);font-size:0.85rem;padding:8px 0">Failed to load boards</div>';
  }
}

function _escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

function _bindBoardSettingsInputs() {
  // Project key inputs
  document.querySelectorAll('.board-project-key-input').forEach(el => {
    el.addEventListener('input', () => {
      const boardId = el.dataset.boardId;
      clearTimeout(_boardSettingsDebounce['pk-' + boardId]);
      _boardSettingsDebounce['pk-' + boardId] = setTimeout(() => {
        window.API.updateBoard(boardId, { project_key: el.value.trim() }).catch(() => window.Toast.error('Failed to update project key'));
      }, 600);
    });
  });

  // Column label inputs
  document.querySelectorAll('.board-column-label-input').forEach(el => {
    el.addEventListener('input', () => {
      const boardId = el.dataset.boardId;
      clearTimeout(_boardSettingsDebounce['col-' + boardId]);
      _boardSettingsDebounce['col-' + boardId] = setTimeout(() => {
        window._saveBoardColumns(boardId, { silent: true });
      }, 600);
    });
  });

  // Column color buttons
  document.querySelectorAll('.settings-column-color-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const row = btn.closest('.settings-column-row');
      const list = btn.closest('.settings-columns-list');
      const boardId = list.dataset.boardId;
      window._showColumnColorPicker(btn, boardId, parseInt(row.dataset.colIndex));
    });
  });

  // Column remove buttons
  document.querySelectorAll('.settings-column-remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const list = btn.closest('.settings-columns-list');
      const boardId = list.dataset.boardId;
      const colId = btn.dataset.colId;
      const cardCount = parseInt(btn.dataset.cardCount);
      window._removeColumn(boardId, colId, cardCount);
    });
  });

  // Column add buttons
  document.querySelectorAll('.settings-column-add-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      window._addColumn(btn.dataset.boardId);
    });
  });

  // Column drag reorder
  document.querySelectorAll('.settings-columns-list').forEach(list => {
    window._bindColumnDragReorder(list);
  });

  // Trigger webhook inputs (debounced)
  document.querySelectorAll('.board-trigger-webhook').forEach(el => {
    el.addEventListener('input', () => {
      const boardId = el.dataset.boardId;
      clearTimeout(_boardSettingsDebounce['tr-' + boardId]);
      _boardSettingsDebounce['tr-' + boardId] = setTimeout(() => {
        window._saveBoardTriggers(boardId);
      }, 600);
    });
  });

  // Trigger notify toggles (save immediately)
  document.querySelectorAll('.board-trigger-notify').forEach(el => {
    el.addEventListener('change', () => {
      window._saveBoardTriggers(el.dataset.boardId);
    });
  });

  window._bindCustomFieldInputs(document);
}

window.toggleBoardEnabled = toggleBoardEnabled;
window.loadBoardsSettings = loadBoardsSettings;
window._escHtml = _escHtml;
window._boardSettingsDebounce = _boardSettingsDebounce;
