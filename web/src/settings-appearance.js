// ── Appearance Application ──

const DEFAULT_LANE_OPACITY = 81;
const DEFAULT_CARD_OPACITY = 100;
const DEFAULT_SURFACE_BLUR = 15;

function _resolveThemeId(themeId) {
  if (typeof window.resolveBoardThemeId === 'function') {
    return window.resolveBoardThemeId(themeId);
  }
  return (window.BOARD_THEMES && window.BOARD_THEMES[themeId]) ? themeId : 'default';
}

function _normalizeAppearanceSettings(data) {
  return Object.assign({
    theme: 'default',
    lane_opacity: DEFAULT_LANE_OPACITY,
    card_opacity: DEFAULT_CARD_OPACITY,
    surface_blur: DEFAULT_SURFACE_BLUR,
  }, data || {});
}

function _normalizeLaneOpacity(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_LANE_OPACITY;
  const rounded = Math.round(numeric);
  return Math.min(100, Math.max(0, rounded));
}

function _updateSettingsRangeFill(input) {
  if (!input) return;
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const value = Number(input.value || min);
  const percent = max === min ? 0 : ((value - min) / (max - min)) * 100;
  input.style.setProperty('--range-fill', percent.toFixed(2) + '%');
}

function _applyLaneOpacity(value) {
  const laneOpacity = _normalizeLaneOpacity(value);
  const listOpacity = Math.round(laneOpacity * 0.79);
  const rowOpacity = Math.round(laneOpacity * 0.43);
  const rowHoverOpacity = Math.round(laneOpacity * 0.86);
  const shellAlpha = laneOpacity <= 0 ? 0 : 0.09 * Math.sqrt(laneOpacity / 100);
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty('--board-pattern-lane-opacity', laneOpacity + '%');
  rootStyle.setProperty('--board-pattern-list-opacity', listOpacity + '%');
  rootStyle.setProperty('--board-pattern-row-opacity', rowOpacity + '%');
  rootStyle.setProperty('--board-pattern-row-hover-opacity', rowHoverOpacity + '%');
  rootStyle.setProperty('--board-pattern-shell-alpha', shellAlpha.toFixed(3));

  const input = document.querySelector('[data-setting="appearance.lane_opacity"]');
  if (input && input.value !== String(laneOpacity)) {
    input.value = String(laneOpacity);
  }
  _updateSettingsRangeFill(input);
  const valueEl = document.getElementById('settings-lane-opacity-value');
  if (valueEl) valueEl.textContent = laneOpacity + '%';
}

function _normalizeSurfaceBlur(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_SURFACE_BLUR;
  const rounded = Math.round(numeric);
  return Math.min(100, Math.max(0, rounded));
}

function _getSurfaceBlurScale(blur) {
  if (blur <= 50) return blur / 50;
  return 1 + ((blur - 50) / 50) * 0.5;
}

function _applySurfaceBlur(value) {
  const surfaceBlur = _normalizeSurfaceBlur(value);
  const blurScale = _getSurfaceBlurScale(surfaceBlur);
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty('--board-pattern-epic-blur', (12 * blurScale).toFixed(2) + 'px');
  rootStyle.setProperty('--board-pattern-column-blur', (2 * blurScale).toFixed(2) + 'px');
  rootStyle.setProperty('--board-pattern-list-blur', (24 * blurScale).toFixed(2) + 'px');
  rootStyle.setProperty('--board-pattern-list-header-blur', (38 * blurScale).toFixed(2) + 'px');
  rootStyle.setProperty('--board-pattern-epic-header-blur', (24 * blurScale).toFixed(2) + 'px');
  rootStyle.setProperty('--board-pattern-epic-child-blur', (18 * blurScale).toFixed(2) + 'px');

  const input = document.querySelector('[data-setting="appearance.surface_blur"]');
  if (input && input.value !== String(surfaceBlur)) {
    input.value = String(surfaceBlur);
  }
  _updateSettingsRangeFill(input);
  const valueEl = document.getElementById('settings-surface-blur-value');
  if (valueEl) valueEl.textContent = surfaceBlur + '%';
}

function _normalizeCardOpacity(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_CARD_OPACITY;
  const rounded = Math.round(numeric);
  return Math.min(100, Math.max(0, rounded));
}

function _applyCardOpacity(value) {
  const cardOpacity = _normalizeCardOpacity(value);
  const lightAlpha = Math.max(0.82, Math.min(0.96, 0.52 + (cardOpacity / 200)));
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty('--board-pattern-card-opacity', cardOpacity + '%');
  rootStyle.setProperty('--board-pattern-card-hover-opacity', Math.min(98, cardOpacity + 8) + '%');
  rootStyle.setProperty('--board-pattern-card-dark-opacity', Math.min(96, cardOpacity + 6) + '%');
  rootStyle.setProperty('--board-pattern-card-dark-hover-opacity', Math.min(98, cardOpacity + 8) + '%');
  rootStyle.setProperty('--board-pattern-card-light-alpha', lightAlpha.toFixed(3));
  rootStyle.setProperty('--board-pattern-card-light-hover-alpha', Math.min(0.98, lightAlpha + 0.04).toFixed(3));

  const input = document.querySelector('[data-setting="appearance.card_opacity"]');
  if (input && input.value !== String(cardOpacity)) {
    input.value = String(cardOpacity);
  }
  _updateSettingsRangeFill(input);
  const valueEl = document.getElementById('settings-card-opacity-value');
  if (valueEl) valueEl.textContent = cardOpacity + '%';
}

function _renderThemeOptions(selectedThemeId) {
  const resolvedThemeId = _resolveThemeId(selectedThemeId);
  const themes = Object.values(window.BOARD_THEMES || {});
  return themes.map(theme => `
    <button
      type="button"
      class="board-theme-option appearance-theme-option${theme.id === resolvedThemeId ? ' selected' : ''}"
      data-theme-id="${theme.id}"
      aria-pressed="${theme.id === resolvedThemeId ? 'true' : 'false'}"
    >
      <span class="board-theme-preview" data-theme-id="${theme.id}">
        <span class="board-theme-preview-card card-a"></span>
        <span class="board-theme-preview-card card-b"></span>
        <span class="board-theme-preview-card card-c"></span>
      </span>
      <span class="board-theme-copy">
        <span class="board-theme-label">${window._escHtml(theme.label)}</span>
        <span class="board-theme-desc">${window._escHtml(theme.description)}</span>
      </span>
    </button>
  `).join('');
}

function _setSelectedAppearanceTheme(themeId) {
  if (window.isAppearanceIslandActive && window.isAppearanceIslandActive()) return;
  const resolvedThemeId = _resolveThemeId(themeId);
  document.querySelectorAll('.appearance-theme-option').forEach(el => {
    const isSelected = el.dataset.themeId === resolvedThemeId;
    el.classList.toggle('selected', isSelected);
    el.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
  });
}

function _renderAppearanceThemePicker(selectedThemeId) {
  if (window.isAppearanceIslandActive && window.isAppearanceIslandActive()) return;
  const container = document.getElementById('settings-theme-grid');
  if (!container) return;
  container.innerHTML = _renderThemeOptions(selectedThemeId);
  document.querySelectorAll('.appearance-theme-option').forEach(el => {
    el.onclick = () => _saveAppearanceTheme(el.dataset.themeId);
  });
}

function _saveAppearanceTheme(themeId) {
  const resolvedThemeId = _resolveThemeId(themeId);
  if (!window._settingsCache.appearance) window._settingsCache.appearance = _normalizeAppearanceSettings();
  window._settingsCache.appearance.theme = resolvedThemeId;
  applyAppearanceSettings({ theme: resolvedThemeId });
  clearTimeout(window._settingsDebounce.appearance);
  window._settingsDebounce.appearance = setTimeout(() => {
    window.API.putSettings('appearance', { theme: resolvedThemeId }).catch(() => {});
  }, 500);
}

function applyAppearanceSettings(data) {
  const body = document.body;

  // Cache to localStorage for anti-FOUC on next load
  try {
    var cached = JSON.parse(localStorage.getItem('lwts-appearance') || '{}');
    Object.assign(cached, data);
    localStorage.setItem('lwts-appearance', JSON.stringify(cached));
  } catch(e) {}

  // Dark mode (default is dark; toggling OFF = light theme)
  if ('dark_mode' in data) {
    body.classList.toggle('light-theme', !data.dark_mode);
  }

  // Accent color
  if (data.accent_color) {
    document.documentElement.style.setProperty('--accent-blue', data.accent_color);
    // Derive translucent variants
    const hex = data.accent_color;
    document.documentElement.style.setProperty('--accent-blue-bg', hex + '1a');
    document.documentElement.style.setProperty('--accent-blue-border', hex + '33');
  }

  // Card animations
  if ('card_animations' in data) {
    body.classList.toggle('no-animations', !data.card_animations);
  }

  if ('theme' in data) {
    const themeId = _resolveThemeId(data.theme);
    if (typeof window.applyBoardTheme === 'function') {
      window.applyBoardTheme(themeId);
    } else {
      body.dataset.boardTheme = themeId;
    }
    _setSelectedAppearanceTheme(themeId);
  }

  // Density
  if (data.density) {
    body.classList.remove('density-compact', 'density-comfortable');
    if (data.density !== 'default') {
      body.classList.add('density-' + data.density);
    }
  }

  // Font size
  if (data.font_size) {
    body.classList.remove('font-small', 'font-large');
    if (data.font_size !== 'medium') {
      body.classList.add('font-' + data.font_size);
    }
  }

  // Show/hide card elements
  if ('show_card_ids' in data) {
    body.classList.toggle('hide-card-ids', !data.show_card_ids);
  }
  if ('show_avatars' in data) {
    body.classList.toggle('hide-avatars', !data.show_avatars);
  }
  if ('show_priority_icons' in data) {
    body.classList.toggle('hide-priority', !data.show_priority_icons);
  }
  if ('lane_opacity' in data) {
    _applyLaneOpacity(data.lane_opacity);
  }
  if ('card_opacity' in data) {
    _applyCardOpacity(data.card_opacity);
  }
  if ('surface_blur' in data) {
    _applySurfaceBlur(data.surface_blur);
  }
}

// Load and apply appearance on page load
async function initAppearance() {
  try {
    const data = _normalizeAppearanceSettings(await window.API.getSettings('appearance'));
    window._settingsCache['appearance'] = data;
    applyAppearanceSettings(data);
  } catch (e) {
    // defaults are fine
  }
}

window.applyAppearanceSettings = applyAppearanceSettings;
window.initAppearance = initAppearance;
window._normalizeAppearanceSettings = _normalizeAppearanceSettings;
window._updateSettingsRangeFill = _updateSettingsRangeFill;
window._applyLaneOpacity = _applyLaneOpacity;
window._applyCardOpacity = _applyCardOpacity;
window._applySurfaceBlur = _applySurfaceBlur;
window._renderAppearanceThemePicker = _renderAppearanceThemePicker;
