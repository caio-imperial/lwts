function _saveBoardColumns(boardId, opts) {
  const board = window.boardList.find(b => b.id === boardId);
  if (!board) return;
  let columns = JSON.parse(board.columns || '[]');

  // Sync labels from DOM inputs if they exist (skip after reorder since indices are stale)
  if (!(opts && opts.skipLabelSync)) {
    const inputs = document.querySelectorAll(`.board-column-label-input[data-board-id="${boardId}"]`);
    inputs.forEach(input => {
      const idx = parseInt(input.dataset.colIndex);
      if (columns[idx]) {
        columns[idx].label = input.value.trim() || columns[idx].label;
      }
    });
  }

  // Ensure types are assigned: first = start, last = done, rest = active
  columns.forEach((col, i) => {
    if (i === 0) col.type = 'start';
    else if (i === columns.length - 1) col.type = 'done';
    else col.type = 'active';
  });

  const columnsJSON = JSON.stringify(columns);
  board.columns = columnsJSON;
  const payload = { columns: columnsJSON };
  if (opts && opts.migrate_to) payload.migrate_to = opts.migrate_to;
  const silent = opts && opts.silent;

  window.API.updateBoard(boardId, payload).then(() => {
    if (boardId === window.currentBoardId && typeof window.COLUMNS !== 'undefined') {
      window.COLUMNS.length = 0;
      columns.forEach(c => window.COLUMNS.push(c));
      if (typeof window.render === 'function') window.render();
    }
    if (!silent) window.Toast.success('Columns updated');
  }).catch((err) => {
    const data = err && err.data;
    if (data && data.column_id) {
      window.Toast.error('Column "' + data.column_id + '" still has ' + data.card_count + ' cards');
    } else {
      window.Toast.error(data && data.error ? data.error : 'Failed to update columns');
    }
  });
}

// Re-render just the column rows inside an already-open config panel
function _rerenderColumnList(boardId) {
  const list = document.querySelector(`.settings-columns-list[data-board-id="${boardId}"]`);
  if (!list) return;
  const board = window.boardList.find(b => b.id === boardId);
  if (!board) return;
  const columns = JSON.parse(board.columns || '[]');

  // Fetch card counts from the existing rendered counts (avoid extra API call)
  const cardCounts = {};
  list.querySelectorAll('.settings-column-row').forEach(row => {
    const colId = row.dataset.colId;
    const countEl = row.querySelector('.settings-column-count');
    if (countEl && colId) {
      const m = countEl.textContent.match(/^(\d+)/);
      if (m) cardCounts[colId] = parseInt(m[1]);
    }
  });

  const COL_PALETTE = ['#8c8c8c','#579DFF','#fb8c00','#4ade80','#f44336','#9f8fef','#6cc3e0','#f5cd47'];
  let html = '';
  columns.forEach((col, ci) => {
    const count = cardCounts[col.id] || 0;
    const color = col.color || COL_PALETTE[ci % COL_PALETTE.length];
    const isFirst = ci === 0;
    const isLast = ci === columns.length - 1;
    const typeLabel = isFirst ? 'Start' : isLast ? 'Done' : '';
    html += `
      <div class="settings-column-row" data-col-index="${ci}" data-col-id="${window._escHtml(col.id)}">
        <span class="settings-column-drag" draggable="true" title="Drag to reorder">&#x2261;</span>
        <input class="settings-input board-column-label-input" data-board-id="${boardId}" data-col-index="${ci}" value="${window._escHtml(col.label)}" style="width:140px;height:30px;font-size:0.88rem;font-weight:500" />
        <button class="settings-column-color-btn" data-col-index="${ci}" style="background:${color}" title="Change color"></button>
        <span class="settings-column-count">${count} card${count !== 1 ? 's' : ''}${typeLabel ? ' · ' + typeLabel : ''}</span>
        ${columns.length > 2 ? '<button class="settings-column-remove-btn" data-col-index="' + ci + '" data-col-id="' + window._escHtml(col.id) + '" data-card-count="' + count + '" title="Remove column">&times;</button>' : ''}
      </div>`;
  });
  list.innerHTML = html;

  // Re-bind events for the new elements inside this list
  list.querySelectorAll('.board-column-label-input').forEach(el => {
    el.addEventListener('input', () => {
      clearTimeout(window._boardSettingsDebounce['col-' + boardId]);
      window._boardSettingsDebounce['col-' + boardId] = setTimeout(() => {
        _saveBoardColumns(boardId, { silent: true });
      }, 600);
    });
  });
  list.querySelectorAll('.settings-column-color-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const row = btn.closest('.settings-column-row');
      _showColumnColorPicker(btn, boardId, parseInt(row.dataset.colIndex));
    });
  });
  list.querySelectorAll('.settings-column-remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _removeColumn(boardId, btn.dataset.colId, parseInt(btn.dataset.cardCount));
    });
  });
  _bindColumnDragReorder(list);
}

function _slugifyColumnId(label) {
  let slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!slug) slug = 'column';
  return slug;
}

function _uniqueColumnId(slug, columns) {
  const ids = new Set(columns.map(c => c.id));
  if (!ids.has(slug)) return slug;
  let n = 2;
  while (ids.has(slug + '-' + n)) n++;
  return slug + '-' + n;
}

function _addColumn(boardId) {
  const board = window.boardList.find(b => b.id === boardId);
  if (!board) return;
  const columns = JSON.parse(board.columns || '[]');
  const COL_PALETTE = ['#8c8c8c','#579DFF','#fb8c00','#4ade80','#f44336','#9f8fef','#6cc3e0','#f5cd47'];
  const label = 'New Column';
  const id = _uniqueColumnId(_slugifyColumnId(label), columns);
  columns.push({ id, label, color: COL_PALETTE[columns.length % COL_PALETTE.length], type: 'active' });
  board.columns = JSON.stringify(columns);
  _saveBoardColumns(boardId, { silent: true });
  _rerenderColumnList(boardId);
  // Focus the new column's label input
  setTimeout(() => {
    const inputs = document.querySelectorAll(`.board-column-label-input[data-board-id="${boardId}"]`);
    const last = inputs[inputs.length - 1];
    if (last) { last.focus(); last.select(); }
  }, 50);
}

function _removeColumn(boardId, colId, cardCount) {
  const board = window.boardList.find(b => b.id === boardId);
  if (!board) return;
  const columns = JSON.parse(board.columns || '[]');
  if (columns.length <= 2) {
    window.Toast.error('Board must have at least 2 columns');
    return;
  }

  const doRemove = (migrateTo) => {
    const newCols = columns.filter(c => c.id !== colId);
    board.columns = JSON.stringify(newCols);
    const opts = { silent: true };
    if (migrateTo) opts.migrate_to = migrateTo;
    _saveBoardColumns(boardId, opts);
    _rerenderColumnList(boardId);
  };

  if (cardCount > 0) {
    // Show a simple confirmation with migration target
    const otherCols = columns.filter(c => c.id !== colId);
    const target = otherCols[0]; // migrate to first available column
    if (confirm('Column has ' + cardCount + ' card(s). Move them to "' + target.label + '" and remove?')) {
      doRemove(target.id);
    }
  } else {
    doRemove(null);
  }
}

function _showColumnColorPicker(btn, boardId, colIndex) {
  // Remove any existing picker
  document.querySelectorAll('.settings-color-picker').forEach(p => p.remove());

  const COL_PALETTE = ['#8c8c8c','#579DFF','#fb8c00','#4ade80','#f44336','#9f8fef','#6cc3e0','#f5cd47'];
  const picker = document.createElement('div');
  picker.className = 'settings-color-picker';
  picker.style.cssText = 'position:absolute;display:flex;gap:6px;padding:8px;background:var(--surface-dropdown,#222);border:1px solid var(--border-light);border-radius:8px;box-shadow:var(--shadow-md);z-index:200';

  COL_PALETTE.forEach(color => {
    const swatch = document.createElement('button');
    swatch.style.cssText = 'width:22px;height:22px;border-radius:50%;border:2px solid transparent;cursor:pointer;background:' + color;
    swatch.addEventListener('click', () => {
      btn.style.background = color;
      picker.remove();
      const board = window.boardList.find(b => b.id === boardId);
      if (!board) return;
      const columns = JSON.parse(board.columns || '[]');
      if (columns[colIndex]) {
        columns[colIndex].color = color;
        board.columns = JSON.stringify(columns);
        _saveBoardColumns(boardId);
      }
    });
    picker.appendChild(swatch);
  });

  btn.style.position = 'relative';
  btn.parentElement.style.position = 'relative';
  btn.parentElement.appendChild(picker);
  picker.style.top = btn.offsetTop + btn.offsetHeight + 4 + 'px';
  picker.style.left = btn.offsetLeft + 'px';

  // Close on outside click
  const close = (e) => { if (!picker.contains(e.target) && e.target !== btn) { picker.remove(); document.removeEventListener('click', close); } };
  setTimeout(() => document.addEventListener('click', close), 0);
}

function _bindColumnDragReorder(list) {
  let dragIdx = null;
  let dragRow = null;

  // Drag starts from the handle, but we track the parent row
  list.querySelectorAll('.settings-column-drag').forEach(handle => {
    handle.addEventListener('dragstart', (e) => {
      dragRow = handle.closest('.settings-column-row');
      dragIdx = parseInt(dragRow.dataset.colIndex);
      dragRow.style.opacity = '0.4';
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setDragImage(dragRow, 0, 0);
    });
    handle.addEventListener('dragend', () => {
      if (dragRow) dragRow.style.opacity = '';
      dragRow = null;
      dragIdx = null;
    });
  });

  // Drop targets are the rows
  list.querySelectorAll('.settings-column-row').forEach(row => {
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      row.style.boxShadow = 'inset 0 2px 0 0 rgba(100,100,100,0.6)';
    });
    row.addEventListener('dragleave', () => { row.style.boxShadow = ''; });
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      row.style.boxShadow = '';
      const dropIdx = parseInt(row.dataset.colIndex);
      if (dragIdx === null || dragIdx === dropIdx) return;
      const boardId = list.dataset.boardId;
      const board = window.boardList.find(b => b.id === boardId);
      if (!board) return;
      const columns = JSON.parse(board.columns || '[]');
      const [moved] = columns.splice(dragIdx, 1);
      columns.splice(dropIdx, 0, moved);
      board.columns = JSON.stringify(columns);
      _rerenderColumnList(boardId);
      _saveBoardColumns(boardId, { silent: true, skipLabelSync: true });
    });
  });
}

window._saveBoardColumns = _saveBoardColumns;
window._showColumnColorPicker = _showColumnColorPicker;
window._removeColumn = _removeColumn;
window._addColumn = _addColumn;
window._bindColumnDragReorder = _bindColumnDragReorder;
