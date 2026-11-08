<script>
  import { onMount } from 'svelte';

  const DEFAULTS = {
    theme: 'default',
    dark_mode: true,
    accent_color: '#579DFF',
    card_animations: true,
    density: 'default',
    font_size: 'medium',
    show_card_ids: true,
    show_avatars: true,
    show_priority_icons: true,
    lane_opacity: 81,
    card_opacity: 100,
    surface_blur: 15,
  };

  let state = $state({ ...DEFAULTS });
  let themes = $state([]);

  function readCache() {
    const raw = (window._settingsCache && window._settingsCache.appearance) || {};
    return typeof window._normalizeAppearanceSettings === 'function'
      ? window._normalizeAppearanceSettings(raw)
      : { ...DEFAULTS, ...raw };
  }

  function resolveTheme(id) {
    if (typeof window.resolveBoardThemeId === 'function') return window.resolveBoardThemeId(id);
    return (window.BOARD_THEMES && window.BOARD_THEMES[id]) ? id : 'default';
  }

  function save(key, value) {
    state[key] = value;
    if (!window._settingsCache) window._settingsCache = {};
    if (!window._settingsCache.appearance) window._settingsCache.appearance = { ...state };
    window._settingsCache.appearance[key] = value;
    if (typeof window.applyAppearanceSettings === 'function') {
      window.applyAppearanceSettings({ [key]: value });
    }
    if (!window._settingsDebounce) window._settingsDebounce = {};
    clearTimeout(window._settingsDebounce.appearance);
    window._settingsDebounce.appearance = setTimeout(() => {
      window.API.putSettings('appearance', { [key]: value }).catch(() => {});
    }, 500);
  }

  function rangeFill(node) {
    const paint = () => {
      if (typeof window._updateSettingsRangeFill === 'function') window._updateSettingsRangeFill(node);
    };
    paint();
    return { update: paint };
  }

  onMount(() => {
    state = { ...state, ...readCache() };
    state.theme = resolveTheme(state.theme);
    themes = Object.values(window.BOARD_THEMES || {});
    if (typeof window.initSettingsDropdowns === 'function') window.initSettingsDropdowns();
  });
</script>

<div class="settings-section-title">Appearance</div>
<div class="settings-section-desc">Customize how LWTS looks and feels.</div>

<div class="settings-group">
  <div class="settings-group-title">Theme</div>
  <div class="settings-row">
    <div class="settings-row-label"><div class="settings-row-title">Dark mode</div><div class="settings-row-desc">Use dark color scheme</div></div>
    <div class="settings-row-control">
      <label class="settings-toggle">
        <input type="checkbox" data-setting="appearance.dark_mode" checked={state.dark_mode} onchange={(e) => save('dark_mode', e.currentTarget.checked)} />
        <span class="toggle-track"></span>
      </label>
    </div>
  </div>
  <div class="settings-row">
    <div class="settings-row-label"><div class="settings-row-title">Accent color</div><div class="settings-row-desc">Primary accent for interactive elements</div></div>
    <div class="settings-row-control">
      <input class="settings-input" data-setting="appearance.accent_color" value={state.accent_color} style="width:100px" oninput={(e) => save('accent_color', e.currentTarget.value)} />
    </div>
  </div>
  <div class="settings-row">
    <div class="settings-row-label"><div class="settings-row-title">Card animations</div><div class="settings-row-desc">Spring animations on cards and transitions</div></div>
    <div class="settings-row-control">
      <label class="settings-toggle">
        <input type="checkbox" data-setting="appearance.card_animations" checked={state.card_animations} onchange={(e) => save('card_animations', e.currentTarget.checked)} />
        <span class="toggle-track"></span>
      </label>
    </div>
  </div>
  <div class="board-theme-intro">
    <div class="settings-row-title">Workspace theme</div>
    <div class="settings-row-desc">Applies across all boards and list views.</div>
  </div>
  <div class="board-theme-grid" id="settings-theme-grid">
    {#each themes as theme (theme.id)}
      <button
        type="button"
        class="board-theme-option appearance-theme-option"
        class:selected={theme.id === state.theme}
        data-theme-id={theme.id}
        aria-pressed={theme.id === state.theme ? 'true' : 'false'}
        onclick={() => save('theme', theme.id)}
      >
        <span class="board-theme-preview" data-theme-id={theme.id}>
          <span class="board-theme-preview-card card-a"></span>
          <span class="board-theme-preview-card card-b"></span>
          <span class="board-theme-preview-card card-c"></span>
        </span>
        <span class="board-theme-copy">
          <span class="board-theme-label">{theme.label}</span>
          <span class="board-theme-desc">{theme.description}</span>
        </span>
      </button>
    {/each}
  </div>
</div>

<div class="settings-group">
  <div class="settings-group-title">Density</div>
  <div class="settings-row">
    <div class="settings-row-label"><div class="settings-row-title">Interface density</div><div class="settings-row-desc">How tightly packed the UI elements are</div></div>
    <div class="settings-row-control"><div id="settings-density-dropdown" style="width:160px"></div></div>
  </div>
  <div class="settings-row">
    <div class="settings-row-label"><div class="settings-row-title">Font size</div><div class="settings-row-desc">Base font size for the interface</div></div>
    <div class="settings-row-control"><div id="settings-fontsize-dropdown" style="width:140px"></div></div>
  </div>
</div>

<div class="settings-group">
  <div class="settings-group-title">Board</div>
  <div class="settings-row">
    <div class="settings-row-label"><div class="settings-row-title">Show card IDs</div><div class="settings-row-desc">Display ticket keys on board cards</div></div>
    <div class="settings-row-control">
      <label class="settings-toggle">
        <input type="checkbox" data-setting="appearance.show_card_ids" checked={state.show_card_ids} onchange={(e) => save('show_card_ids', e.currentTarget.checked)} />
        <span class="toggle-track"></span>
      </label>
    </div>
  </div>
  <div class="settings-row">
    <div class="settings-row-label"><div class="settings-row-title">Show avatars</div><div class="settings-row-desc">Display assignee avatars on cards</div></div>
    <div class="settings-row-control">
      <label class="settings-toggle">
        <input type="checkbox" data-setting="appearance.show_avatars" checked={state.show_avatars} onchange={(e) => save('show_avatars', e.currentTarget.checked)} />
        <span class="toggle-track"></span>
      </label>
    </div>
  </div>
  <div class="settings-row">
    <div class="settings-row-label"><div class="settings-row-title">Show priority icons</div><div class="settings-row-desc">Display priority arrows on cards</div></div>
    <div class="settings-row-control">
      <label class="settings-toggle">
        <input type="checkbox" data-setting="appearance.show_priority_icons" checked={state.show_priority_icons} onchange={(e) => save('show_priority_icons', e.currentTarget.checked)} />
        <span class="toggle-track"></span>
      </label>
    </div>
  </div>
  <details class="settings-advanced">
    <summary class="settings-advanced-summary">
      <div class="settings-advanced-copy">
        <div class="settings-advanced-title">Advanced surface controls</div>
        <div class="settings-advanced-desc">Fine-tune lane transparency, card transparency, and blur for themed boards and list view.</div>
      </div>
      <svg class="settings-advanced-chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
    </summary>
    <div class="settings-advanced-content">
      <div class="settings-row">
        <div class="settings-row-label"><div class="settings-row-title">Lane transparency</div><div class="settings-row-desc">Adjust how much of the background shows through lanes and list surfaces</div></div>
        <div class="settings-row-control">
          <div class="settings-range-group">
            <input class="settings-range" type="range" min="0" max="100" step="1" value={state.lane_opacity} data-setting="appearance.lane_opacity" use:rangeFill oninput={(e) => save('lane_opacity', Number(e.currentTarget.value))} />
            <span class="settings-range-value" id="settings-lane-opacity-value">{state.lane_opacity}%</span>
          </div>
        </div>
      </div>
      <div class="settings-row">
        <div class="settings-row-label"><div class="settings-row-title">Card transparency</div><div class="settings-row-desc">Adjust how much of the background shows through board cards</div></div>
        <div class="settings-row-control">
          <div class="settings-range-group">
            <input class="settings-range" type="range" min="0" max="100" step="1" value={state.card_opacity} data-setting="appearance.card_opacity" use:rangeFill oninput={(e) => save('card_opacity', Number(e.currentTarget.value))} />
            <span class="settings-range-value" id="settings-card-opacity-value">{state.card_opacity}%</span>
          </div>
        </div>
      </div>
      <div class="settings-row">
        <div class="settings-row-label"><div class="settings-row-title">Blur</div><div class="settings-row-desc">Adjust the glass blur on lanes and list surfaces</div></div>
        <div class="settings-row-control">
          <div class="settings-range-group">
            <input class="settings-range" type="range" min="0" max="100" step="1" value={state.surface_blur} data-setting="appearance.surface_blur" use:rangeFill oninput={(e) => save('surface_blur', Number(e.currentTarget.value))} />
            <span class="settings-range-value" id="settings-surface-blur-value">{state.surface_blur}%</span>
          </div>
        </div>
      </div>
    </div>
  </details>
</div>
