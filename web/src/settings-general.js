// ── Settings API Integration ──

let _settingsCache = {};
let _settingsDebounce = {};
let _settingsDropdowns = {};

async function loadSettings(category) {
  try {
    const raw = await window.API.getSettings(category);
    const data = category === 'appearance' ? window._normalizeAppearanceSettings(raw) : raw;
    _settingsCache[category] = data;
    populateSettingsForm(category, data);
    if (category === 'appearance') window.applyAppearanceSettings(data);
    if (category === 'general') applyGeneralSettings(data);
  } catch (e) {
    // Use defaults from HTML
  }
}

function applyGeneralSettings(data) {
  try { localStorage.setItem('lwts-general', JSON.stringify(data)); } catch(e) {}
  if (data.compact_cards) {
    document.getElementById('board').classList.add('compact-cards');
  } else {
    document.getElementById('board').classList.remove('compact-cards');
  }
  applyRegistrationSetting(!!data.allow_registration);
  refreshSemanticSearchStatus(data.search_mode === 'semantic');
}

let _embedStatusFetched = false;
async function refreshSemanticSearchStatus(currentlyEnabled) {
  const toggle = document.getElementById('semantic-search-toggle');
  const warn = document.getElementById('semantic-search-warn');
  const statusRow = document.getElementById('semantic-search-status-row');
  const countsEl = document.getElementById('semantic-search-counts');
  if (!toggle) return;

  let status = null;
  try {
    status = await window.API.getEmbedStatus();
  } catch (e) {
    // Endpoint missing or down — treat as unavailable.
  }
  _embedStatusFetched = true;

  const available = status && status.available;
  toggle.disabled = !available && !currentlyEnabled;
  if (warn) warn.style.display = available ? 'none' : 'block';

  if (currentlyEnabled && status) {
    if (statusRow) statusRow.style.display = '';
    if (countsEl) {
      let txt = `${status.cards_with_embed} / ${status.cards_total} cards indexed (model: ${status.model || 'unknown'})`;
      if (status.backfill && status.backfill.running) {
        txt += ` — backfill running (${status.backfill.embedded} embedded so far)`;
      } else if (status.backfill && status.backfill.last_error) {
        txt += ` — last backfill error: ${status.backfill.last_error}`;
      }
      countsEl.textContent = txt;
    }
  } else if (statusRow) {
    statusRow.style.display = 'none';
  }
}

function bindSemanticSearchControls() {
  const toggle = document.getElementById('semantic-search-toggle');
  if (toggle && !toggle.dataset.semBound) {
    toggle.dataset.semBound = '1';
    toggle.addEventListener('change', async () => {
      // The generic data-setting binding fires the actual PUT. We just need to
      // react to the success/failure to refresh the status row and revert on
      // server-side rejection (e.g. pgvector missing).
      const wantsSemantic = toggle.checked;
      // Wait a tick so the debounced PUT has time to fire and resolve.
      setTimeout(async () => {
        try {
          const data = await window.API.getSettings('general');
          const actuallySet = data.search_mode === 'semantic';
          if (actuallySet !== wantsSemantic) {
            // Server rejected: revert UI and warn.
            toggle.checked = actuallySet;
            if (window.Toast) window.Toast.error('Could not enable semantic search — check that EMBEDDING_API_URL is set and pgvector is installed.');
          }
          refreshSemanticSearchStatus(actuallySet);
        } catch (e) { /* network — ignore */ }
      }, 700);
    });
  }
  const btn = document.getElementById('semantic-search-backfill-btn');
  if (btn && !btn.dataset.semBound) {
    btn.dataset.semBound = '1';
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const original = btn.textContent;
      btn.textContent = 'Starting...';
      try {
        await window.API.backfillEmbeddings();
        if (window.Toast) window.Toast.success('Backfill started — check the indexed-cards count for progress');
        // Poll status every 3s until backfill stops running.
        const poll = async () => {
          const s = await window.API.getEmbedStatus();
          refreshSemanticSearchStatus(true);
          if (s && s.backfill && s.backfill.running) {
            setTimeout(poll, 3000);
          } else {
            btn.disabled = false;
            btn.textContent = original;
          }
        };
        poll();
      } catch (e) {
        if (window.Toast) window.Toast.error('Backfill failed: ' + (e.message || 'unknown error'));
        btn.disabled = false;
        btn.textContent = original;
      }
    });
  }
}

function applyRegistrationSetting(allowed) {
  // Store in localStorage for login page to read
  try { localStorage.setItem('lwts-allow-registration', allowed ? '1' : '0'); } catch(e) {}
}

function populateSettingsForm(category, data) {
  document.querySelectorAll('[data-setting^="' + category + '."]').forEach(el => {
    const key = el.dataset.setting.split('.')[1];
    if (!(key in data)) return;
    if (el.type === 'checkbox') {
      // Enum-checkbox: data-checked-value="X" data-unchecked-value="Y" maps a
      // boolean toggle to a string-valued setting (e.g. search_mode).
      const checkedVal = el.dataset.checkedValue;
      if (checkedVal !== undefined) {
        el.checked = data[key] === checkedVal;
      } else {
        el.checked = !!data[key];
      }
    } else {
      el.value = data[key];
    }
  });
  // Workspace name is workspace-scoped and comes from the workspaces table,
  // not from the global general settings payload.
  if (category === 'general' && window.currentWorkspace) {
    const nameInput = document.querySelector('[data-setting="general.workspace_name"]');
    if (nameInput) nameInput.value = window.currentWorkspace.name;
  }
  // Update FnDropdown instances
  if (category === 'general') {
    if (data.session_length_days && _settingsDropdowns.session_length_days) {
      _settingsDropdowns.session_length_days.setValue(String(data.session_length_days), true);
    }
  }
  if (category === 'appearance') {
    window._renderAppearanceThemePicker(data.theme);
    if (data.density && _settingsDropdowns.density) {
      _settingsDropdowns.density.setValue(data.density, true);
    }
    if (data.font_size && _settingsDropdowns.font_size) {
      _settingsDropdowns.font_size.setValue(data.font_size, true);
    }
    window._applyLaneOpacity(data.lane_opacity);
    window._applyCardOpacity(data.card_opacity);
    window._applySurfaceBlur(data.surface_blur);
  }
}

function initSettingsDropdowns() {
  const densityEl = document.getElementById('settings-density-dropdown');
  if (densityEl && (!_settingsDropdowns.density || !densityEl.querySelector('.fn-dropdown-trigger'))) {
    _settingsDropdowns.density = null;
    _settingsDropdowns.density = new window.FnDropdown(densityEl, {
      options: [
        { value: 'comfortable', label: 'Comfortable' },
        { value: 'default', label: 'Default' },
        { value: 'compact', label: 'Compact' }
      ],
      value: 'default',
      compact: true,
      onChange: (val) => _onSettingsDropdownChange('appearance', 'density', val)
    });
  }
  const sessionEl = document.getElementById('settings-session-length-dropdown');
  if (sessionEl && (!_settingsDropdowns.session_length_days || !sessionEl.querySelector('.fn-dropdown-trigger'))) {
    _settingsDropdowns.session_length_days = null;
    _settingsDropdowns.session_length_days = new window.FnDropdown(sessionEl, {
      options: [
        { value: '1', label: '1 day' },
        { value: '7', label: '7 days' },
        { value: '30', label: '30 days' },
        { value: '365', label: '1 year' }
      ],
      value: '7',
      compact: true,
      onChange: (val) => _onSettingsDropdownChange('general', 'session_length_days', parseInt(val, 10))
    });
  }
  const fontEl = document.getElementById('settings-fontsize-dropdown');
  if (fontEl && (!_settingsDropdowns.font_size || !fontEl.querySelector('.fn-dropdown-trigger'))) {
    _settingsDropdowns.font_size = null;
    _settingsDropdowns.font_size = new window.FnDropdown(fontEl, {
      options: [
        { value: 'small', label: 'Small' },
        { value: 'medium', label: 'Medium' },
        { value: 'large', label: 'Large' }
      ],
      value: 'medium',
      compact: true,
      onChange: (val) => _onSettingsDropdownChange('appearance', 'font_size', val)
    });
  }
}

function _onSettingsDropdownChange(category, key, value) {
  if (!_settingsCache[category]) _settingsCache[category] = {};
  _settingsCache[category][key] = value;
  if (category === 'appearance') {
    window.applyAppearanceSettings({ [key]: value });
  }
  clearTimeout(_settingsDebounce[category]);
  _settingsDebounce[category] = setTimeout(() => {
    window.API.putSettings(category, { [key]: value }).catch(() => {});
  }, 500);
}

function initSettingsBindings() {
  document.querySelectorAll('[data-setting]').forEach(el => {
    const [category, key] = el.dataset.setting.split('.');
    const event = el.type === 'checkbox' ? 'change' : 'input';
    if (el.type === 'range') window._updateSettingsRangeFill(el);
    el.addEventListener(event, () => {
      let value;
      if (el.type === 'checkbox') {
        const checkedVal = el.dataset.checkedValue;
        const uncheckedVal = el.dataset.uncheckedValue;
        if (checkedVal !== undefined && uncheckedVal !== undefined) {
          value = el.checked ? checkedVal : uncheckedVal;
        } else {
          value = el.checked;
        }
      } else {
        value = el.value;
      }
      if (el.type === 'range') window._updateSettingsRangeFill(el);
      // Update local cache immediately
      if (!_settingsCache[category]) _settingsCache[category] = {};
      _settingsCache[category][key] = value;
      // Apply appearance changes immediately
      if (category === 'appearance') {
        window.applyAppearanceSettings({ [key]: value });
      }
      // Rename the current workspace through the workspace API (the name is
      // workspace-scoped, not a global setting).
      if (category === 'general' && key === 'workspace_name') {
        clearTimeout(_settingsDebounce.workspace_rename);
        _settingsDebounce.workspace_rename = setTimeout(async () => {
          const name = el.value.trim();
          if (!name || !window.currentWorkspace) return;
          try {
            const updated = await window.API.updateWorkspace(window.currentWorkspace.slug, { name });
            if (typeof window.applyWorkspaceRename === 'function') window.applyWorkspaceRename(updated);
            if (window.Toast) window.Toast.success('Workspace renamed');
          } catch (e) {
            if (window.Toast) window.Toast.error('Failed to rename workspace');
          }
        }, 600);
        return;
      }
      // Toggle compact cards on board
      if (category === 'general' && key === 'compact_cards') {
        document.getElementById('board').classList.toggle('compact-cards', el.checked);
      }
      clearTimeout(_settingsDebounce[category]);
      _settingsDebounce[category] = setTimeout(() => {
        window.API.putSettings(category, { [key]: value }).catch(() => {});
      }, 500);
    });
  });
  window._renderAppearanceThemePicker((_settingsCache.appearance || {}).theme || (typeof window.getCachedBoardThemeId === 'function' ? window.getCachedBoardThemeId() : 'default'));
  window.initBrowserNotificationBindings();
}

window._settingsCache = _settingsCache;
window.loadSettings = loadSettings;
window.applyGeneralSettings = applyGeneralSettings;
window.applyRegistrationSetting = applyRegistrationSetting;
window.populateSettingsForm = populateSettingsForm;
window.initSettingsDropdowns = initSettingsDropdowns;
window.initSettingsBindings = initSettingsBindings;
window._settingsDebounce = _settingsDebounce;
window.bindSemanticSearchControls = bindSemanticSearchControls;
