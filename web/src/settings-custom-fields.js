const CUSTOM_FIELD_OPTION_COLORS = ['#579DFF', '#4ade80', '#fb8c00', '#f44336', '#9f8fef', '#6cc3e0', '#f5cd47', '#e040fb'];

function _bindCustomFieldInputs(root) {
  const scope = root || document;
  scope.querySelectorAll('.board-custom-field-name, .board-custom-field-option-label').forEach(el => {
    el.addEventListener('input', () => {
      const boardId = el.dataset.boardId;
      clearTimeout(window._boardSettingsDebounce['cf-' + boardId]);
      window._boardSettingsDebounce['cf-' + boardId] = setTimeout(() => {
        _saveBoardCustomFields(boardId, { silent: true });
      }, 600);
    });
  });

  scope.querySelectorAll('.settings-custom-field-type-dropdown').forEach(el => {
    if (el._customFieldTypeDropdown || !window.FnDropdown) return;
    const boardId = el.dataset.boardId;
    const fieldId = el.dataset.fieldId;
    const hidden = scope.querySelector(`.board-custom-field-type[data-board-id="${boardId}"][data-field-id="${fieldId}"]`);
    el._customFieldTypeDropdown = new window.FnDropdown(el, {
      compact: true,
      value: hidden ? hidden.value : 'text',
      options: [
        { value: 'text', label: 'Text' },
        { value: 'select', label: 'Choice' },
      ],
      onChange: (value) => {
        if (hidden) hidden.value = value;
        _saveBoardCustomFields(boardId, { silent: true, rerender: true });
      },
    });
  });

  scope.querySelectorAll('.board-custom-field-required').forEach(el => {
    el.addEventListener('change', () => {
      const boardId = el.dataset.boardId;
      _saveBoardCustomFields(boardId, { silent: true, rerender: true });
    });
  });

  scope.querySelectorAll('.settings-custom-field-option-add-btn').forEach(btn => {
    btn.addEventListener('click', () => _addCustomFieldOption(btn.dataset.boardId, btn.dataset.fieldId));
  });

  scope.querySelectorAll('.settings-custom-field-option-new').forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      _addCustomFieldOption(input.dataset.boardId, input.dataset.fieldId);
    });
  });

  scope.querySelectorAll('.settings-custom-field-option-remove-btn').forEach(btn => {
    btn.addEventListener('click', () => _removeCustomFieldOption(btn.dataset.boardId, btn.dataset.fieldId, btn.dataset.optionId));
  });

  scope.querySelectorAll('.settings-custom-field-option-color-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      _showCustomFieldOptionColorPicker(btn, btn.dataset.boardId, btn.dataset.fieldId, btn.dataset.optionId);
    });
  });

  scope.querySelectorAll('.settings-custom-field-add-btn').forEach(btn => {
    btn.addEventListener('click', () => _addCustomField(btn.dataset.boardId));
  });

  scope.querySelectorAll('.settings-custom-field-remove-btn').forEach(btn => {
    btn.addEventListener('click', () => _removeCustomField(btn.dataset.boardId, btn.dataset.fieldId));
  });
}

function _renderCustomFieldsConfig(boardId, customFields) {
  const fields = Array.isArray(customFields) ? customFields : [];
  let html = `
    <div class="settings-group">
      <div class="settings-group-title">Custom fields</div>
      <div class="settings-custom-fields-list" data-board-id="${boardId}">`;
  if (fields.length === 0) {
    html += '<div class="settings-custom-field-empty">No custom fields configured</div>';
  }
  fields.forEach((field, idx) => {
    const type = field.type === 'select' ? 'select' : 'text';
    html += `
      <div class="settings-custom-field-row" data-field-index="${idx}" data-field-id="${window._escHtml(field.id)}">
        <div class="settings-custom-field-main">
          <input class="settings-input board-custom-field-name" data-board-id="${boardId}" data-field-id="${window._escHtml(field.id)}" value="${window._escHtml(field.name)}" placeholder="Field name" />
          <input type="hidden" class="board-custom-field-type" data-board-id="${boardId}" data-field-id="${window._escHtml(field.id)}" value="${type}" />
          <div class="settings-custom-field-type-dropdown" data-board-id="${boardId}" data-field-id="${window._escHtml(field.id)}"></div>
          <label class="settings-toggle settings-custom-field-required" title="Required">
            <input type="checkbox" class="board-custom-field-required" data-board-id="${boardId}" data-field-id="${window._escHtml(field.id)}" ${field.required ? 'checked' : ''}>
            <span class="toggle-track"></span>
          </label>
          <button class="settings-custom-field-remove-btn" data-board-id="${boardId}" data-field-id="${window._escHtml(field.id)}" title="Remove field">&times;</button>
        </div>
        ${_renderCustomFieldOptionsEditor(boardId, field, type)}
      </div>`;
  });
  html += `
      </div>
      <button class="btn settings-custom-field-add-btn" data-board-id="${boardId}" style="margin-top:10px;font-size:0.82rem;padding:4px 14px">+ Add field</button>
    </div>`;
  return html;
}

function _renderCustomFieldOptionsEditor(boardId, field, type) {
  const options = Array.isArray(field.options) ? field.options : [];
  let html = `<div class="settings-custom-field-options-editor ${type === 'select' ? '' : 'hidden'}" data-board-id="${boardId}" data-field-id="${window._escHtml(field.id)}">`;
  html += '<div class="settings-custom-field-options-list">';
  options.forEach((opt, optIdx) => {
    const optionId = opt.id || _slugifyCustomFieldId(opt.label || 'option');
    const color = opt.color || CUSTOM_FIELD_OPTION_COLORS[optIdx % CUSTOM_FIELD_OPTION_COLORS.length];
    html += `
      <div class="settings-custom-field-option-row" data-option-index="${optIdx}" data-option-id="${window._escHtml(optionId)}">
        <button type="button" class="settings-custom-field-option-color-btn" data-board-id="${boardId}" data-field-id="${window._escHtml(field.id)}" data-option-id="${window._escHtml(optionId)}" style="background:${window._escHtml(color)}" title="Change choice color"></button>
        <input class="settings-input board-custom-field-option-label" data-board-id="${boardId}" data-field-id="${window._escHtml(field.id)}" data-option-id="${window._escHtml(optionId)}" value="${window._escHtml(opt.label || optionId)}" placeholder="Choice label" />
        <button type="button" class="settings-custom-field-option-remove-btn" data-board-id="${boardId}" data-field-id="${window._escHtml(field.id)}" data-option-id="${window._escHtml(optionId)}" title="Remove choice">&times;</button>
      </div>`;
  });
  html += '</div>';
  html += `
    <div class="settings-custom-field-option-add">
      <input class="settings-input settings-custom-field-option-new" data-board-id="${boardId}" data-field-id="${window._escHtml(field.id)}" placeholder="New choice" />
      <button type="button" class="btn settings-custom-field-option-add-btn" data-board-id="${boardId}" data-field-id="${window._escHtml(field.id)}">+ Add choice</button>
    </div>
  </div>`;
  return html;
}

function _slugifyCustomFieldId(label) {
  let slug = (label || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!slug) slug = 'field';
  if (/^[0-9]/.test(slug)) slug = 'field-' + slug;
  return slug.slice(0, 64).replace(/-$/g, '');
}

function _uniqueCustomFieldId(slug, fields) {
  const ids = new Set((fields || []).map(f => f.id));
  if (!ids.has(slug)) return slug;
  let n = 2;
  while (ids.has(slug + '-' + n)) n++;
  return slug + '-' + n;
}

function _uniqueCustomFieldOptionId(label, options) {
  return _uniqueCustomFieldId(_slugifyCustomFieldId(label || 'option'), options || []);
}

function _nextCustomFieldOptionLabel(options) {
  const existing = new Set((options || []).map(opt => String(opt.label || '').toLowerCase()));
  let n = (options || []).length + 1;
  let label = 'Choice ' + n;
  while (existing.has(label.toLowerCase())) {
    n++;
    label = 'Choice ' + n;
  }
  return label;
}

function _customFieldsForBoard(board) {
  const settings = window.parseBoardSettings ? window.parseBoardSettings(board.settings) : JSON.parse(board.settings || '{}');
  return Array.isArray(settings.custom_fields) ? settings.custom_fields : [];
}

function _collectCustomFieldsFromDOM(boardId) {
  const board = window.boardList.find(b => b.id === boardId);
  if (!board) return [];
  const existing = _customFieldsForBoard(board);
  const rows = document.querySelectorAll(`.settings-custom-fields-list[data-board-id="${boardId}"] .settings-custom-field-row`);
  const fields = [];
  rows.forEach((row, idx) => {
    const id = row.dataset.fieldId;
    const prev = existing.find(f => f.id === id) || {};
    const nameEl = row.querySelector('.board-custom-field-name');
    const typeEl = row.querySelector('.board-custom-field-type');
    const reqEl = row.querySelector('.board-custom-field-required');
    const type = typeEl && typeEl.value === 'select' ? 'select' : 'text';
    const field = {
      id,
      name: (nameEl && nameEl.value.trim()) || prev.name || 'Custom field',
      type,
      required: !!(reqEl && reqEl.checked),
    };
    if (type === 'select') {
      const optionRows = Array.from(row.querySelectorAll('.settings-custom-field-option-row'));
      const seen = new Set();
      field.options = optionRows.map((optionRow, optIdx) => {
        const labelEl = optionRow.querySelector('.board-custom-field-option-label');
        const label = (labelEl && labelEl.value.trim()) || '';
        if (!label) return null;
        const rowOptionId = optionRow.dataset.optionId || '';
        const prevOpt = (prev.options || []).find(o => o.id === rowOptionId) ||
          (prev.options || [])[optIdx] ||
          (prev.options || []).find(o => String(o.label || '').toLowerCase() === label.toLowerCase()) ||
          {};
        let optId = prevOpt.id || rowOptionId || _slugifyCustomFieldId(label);
        while (seen.has(optId)) optId = optId + '-' + (seen.size + 1);
        seen.add(optId);
        return {
          id: optId,
          label,
          color: prevOpt.color || CUSTOM_FIELD_OPTION_COLORS[optIdx % CUSTOM_FIELD_OPTION_COLORS.length],
        };
      }).filter(Boolean);
      if (field.options.length === 0) {
        field.options = [{ id: 'option', label: 'Option', color: CUSTOM_FIELD_OPTION_COLORS[idx % CUSTOM_FIELD_OPTION_COLORS.length] }];
      }
    }
    fields.push(field);
  });
  return fields;
}

async function _saveBoardCustomFields(boardId, opts) {
  const board = window.boardList.find(b => b.id === boardId);
  if (!board) return;
  const settings = window.parseBoardSettings ? window.parseBoardSettings(board.settings) : JSON.parse(board.settings || '{}');
  const fields = _collectCustomFieldsFromDOM(boardId);
  settings.custom_fields = fields;
  const payload = JSON.stringify(settings);
  const previous = opts && opts.previousSettings !== undefined ? opts.previousSettings : board.settings;
  board.settings = payload;

  const body = { settings: payload };
  if (opts && opts.force) body.force_custom_field_conflicts = true;

  try {
    const updated = await window.API.updateBoard(boardId, body);
    board.settings = updated.settings || payload;
    if (boardId === window.currentBoardId && typeof window.render === 'function') window.render();
    if (opts && opts.rerender) _rerenderCustomFieldList(boardId);
    if (!(opts && opts.silent) && window.Toast) window.Toast.success('Custom fields saved', { duration: 1200 });
  } catch (err) {
    board.settings = previous;
    const data = err && err.data;
    if (data && data.error === 'custom_field_value_conflict' && !(opts && opts.force)) {
      const count = data.count || 0;
      const ok = await window.fnConfirm(
        'This change would clear invalid custom field values from ' + count + ' existing card' + (count === 1 ? '' : 's') + '. Continue?',
        'Apply custom field change',
        'Apply change'
      );
      if (ok) {
        await _saveBoardCustomFields(boardId, Object.assign({}, opts || {}, {
          force: true,
          previousSettings: previous,
          silent: false,
        }));
        return;
      }
      window.Toast.info('Custom field change canceled');
    } else if (data && data.fields) {
      const first = Object.keys(data.fields)[0];
      window.Toast.error(data.fields[first]);
    } else {
      window.Toast.error((data && data.error) || 'Failed to save custom fields');
    }
    window.loadBoardsSettings();
  }
}

function _rerenderCustomFieldList(boardId) {
  const list = document.querySelector(`.settings-custom-fields-list[data-board-id="${boardId}"]`);
  const board = window.boardList.find(b => b.id === boardId);
  if (!list || !board) return;
  const fields = _customFieldsForBoard(board);
  const wrapper = document.createElement('div');
  wrapper.innerHTML = _renderCustomFieldsConfig(boardId, fields);
  const nextList = wrapper.querySelector('.settings-custom-fields-list');
  list.innerHTML = nextList ? nextList.innerHTML : '';
  _bindCustomFieldInputs(list.closest('.settings-group') || list);
}

function _addCustomField(boardId) {
  const board = window.boardList.find(b => b.id === boardId);
  if (!board) return;
  const settings = window.parseBoardSettings ? window.parseBoardSettings(board.settings) : JSON.parse(board.settings || '{}');
  const fields = Array.isArray(settings.custom_fields) ? settings.custom_fields.slice() : [];
  const id = _uniqueCustomFieldId('custom-field', fields);
  fields.push({ id, name: 'Custom field', type: 'text' });
  settings.custom_fields = fields;
  const previous = board.settings;
  board.settings = JSON.stringify(settings);
  _rerenderCustomFieldList(boardId);
  _saveBoardCustomFields(boardId, { silent: true, previousSettings: previous });
  setTimeout(() => {
    const input = document.querySelector(`.board-custom-field-name[data-board-id="${boardId}"][data-field-id="${id}"]`);
    if (input) { input.focus(); input.select(); }
  }, 50);
}

function _removeCustomField(boardId, fieldId) {
  const board = window.boardList.find(b => b.id === boardId);
  if (!board) return;
  const settings = window.parseBoardSettings ? window.parseBoardSettings(board.settings) : JSON.parse(board.settings || '{}');
  settings.custom_fields = (settings.custom_fields || []).filter(f => f.id !== fieldId);
  const previous = board.settings;
  board.settings = JSON.stringify(settings);
  _rerenderCustomFieldList(boardId);
  _saveBoardCustomFields(boardId, { silent: true, previousSettings: previous });
}

function _writeCustomFieldsToBoardSettings(board, fields) {
  const settings = window.parseBoardSettings ? window.parseBoardSettings(board.settings) : JSON.parse(board.settings || '{}');
  settings.custom_fields = fields;
  board.settings = JSON.stringify(settings);
}

async function _addCustomFieldOption(boardId, fieldId) {
  const board = window.boardList.find(b => b.id === boardId);
  if (!board) return;
  const previous = board.settings;
  const fields = _collectCustomFieldsFromDOM(boardId);
  const field = fields.find(f => f.id === fieldId);
  if (!field || field.type !== 'select') return;
  const input = document.querySelector(`.settings-custom-field-option-new[data-board-id="${boardId}"][data-field-id="${fieldId}"]`);
  const label = (input && input.value.trim()) || _nextCustomFieldOptionLabel(field.options || []);
  const existingLabels = new Set((field.options || []).map(opt => String(opt.label || '').toLowerCase()));
  if (existingLabels.has(label.toLowerCase())) {
    if (window.Toast) window.Toast.info('Choice already exists');
    if (input) { input.focus(); input.select(); }
    return;
  }
  field.options = field.options || [];
  field.options.push({
    id: _uniqueCustomFieldOptionId(label, field.options),
    label,
    color: CUSTOM_FIELD_OPTION_COLORS[field.options.length % CUSTOM_FIELD_OPTION_COLORS.length],
  });
  _writeCustomFieldsToBoardSettings(board, fields);
  _rerenderCustomFieldList(boardId);
  await _saveBoardCustomFields(boardId, { silent: true, previousSettings: previous });
  setTimeout(() => {
    const added = document.querySelector(`.board-custom-field-option-label[data-board-id="${boardId}"][data-field-id="${fieldId}"][data-option-id="${field.options[field.options.length - 1].id}"]`);
    if (added) { added.focus(); added.select(); }
  }, 50);
}

async function _removeCustomFieldOption(boardId, fieldId, optionId) {
  const board = window.boardList.find(b => b.id === boardId);
  if (!board) return;
  const previous = board.settings;
  const fields = _collectCustomFieldsFromDOM(boardId);
  const field = fields.find(f => f.id === fieldId);
  if (!field || field.type !== 'select') return;
  if ((field.options || []).length <= 1) {
    if (window.Toast) window.Toast.error('Choice fields need at least one choice');
    return;
  }
  field.options = (field.options || []).filter(opt => opt.id !== optionId);
  _writeCustomFieldsToBoardSettings(board, fields);
  _rerenderCustomFieldList(boardId);
  await _saveBoardCustomFields(boardId, { silent: true, previousSettings: previous });
}

function _showCustomFieldOptionColorPicker(btn, boardId, fieldId, optionId) {
  document.querySelectorAll('.settings-color-picker').forEach(p => p.remove());

  const picker = document.createElement('div');
  picker.className = 'settings-color-picker settings-custom-field-option-color-picker';
  picker.style.cssText = 'position:absolute;display:flex;gap:6px;padding:8px;background:var(--surface-dropdown,#222);border:1px solid var(--border-light);border-radius:8px;box-shadow:var(--shadow-md);z-index:200';

  CUSTOM_FIELD_OPTION_COLORS.forEach(color => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.style.cssText = 'width:22px;height:22px;border-radius:50%;border:2px solid transparent;cursor:pointer;background:' + color;
    swatch.addEventListener('click', async () => {
      picker.remove();
      const board = window.boardList.find(b => b.id === boardId);
      if (!board) return;
      const previous = board.settings;
      const fields = _collectCustomFieldsFromDOM(boardId);
      const field = fields.find(f => f.id === fieldId);
      const option = field && (field.options || []).find(opt => opt.id === optionId);
      if (!option) return;
      option.color = color;
      _writeCustomFieldsToBoardSettings(board, fields);
      _rerenderCustomFieldList(boardId);
      await _saveBoardCustomFields(boardId, { silent: true, previousSettings: previous });
    });
    picker.appendChild(swatch);
  });

  btn.style.position = 'relative';
  btn.parentElement.style.position = 'relative';
  btn.parentElement.appendChild(picker);
  picker.style.top = btn.offsetTop + btn.offsetHeight + 4 + 'px';
  picker.style.left = btn.offsetLeft + 'px';

  const close = (e) => { if (!picker.contains(e.target) && e.target !== btn) { picker.remove(); document.removeEventListener('click', close); } };
  setTimeout(() => document.addEventListener('click', close), 0);
}

window._bindCustomFieldInputs = _bindCustomFieldInputs;
window._renderCustomFieldsConfig = _renderCustomFieldsConfig;
