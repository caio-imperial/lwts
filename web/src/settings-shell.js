// fn2 Kanban — Settings Page

const SETTINGS_SECTIONS = [
  { id: 'general',     label: 'General',      icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>', group: 'workspace' },
  { id: 'appearance',  label: 'Appearance',    icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>', group: 'workspace' },
  { id: 'boards',      label: 'Boards',        icon: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>', group: 'workspace' },
  { id: 'transitions', label: 'Transitions',   icon: '<svg viewBox="0 0 24 24"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>', group: 'workspace' },
  { id: 'team',        label: 'Team',          icon: '<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>', group: 'people' },
  { id: 'notifications', label: 'Notifications', icon: '<svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>', group: 'people' },
  { id: 'integrations', label: 'Integrations', icon: '<svg viewBox="0 0 24 24"><path d="M16 18l2-2-4-4 4-4-2-2-6 6z"/><path d="M8 6L6 8l4 4-4 4 2 2 6-6z"/></svg>', group: 'people' },
  { id: 'api',         label: 'API Keys',      icon: '<svg viewBox="0 0 24 24"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>', group: 'advanced' },
  { id: 'import',      label: 'Import / Export', icon: '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>', group: 'advanced' },
  { id: 'danger',      label: 'Danger Zone',   icon: '<svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>', group: 'advanced' },
];

const SETTINGS_GROUPS = {
  workspace: 'Workspace',
  people: 'People',
  advanced: 'Advanced',
};

let activeSettingsSection = 'general';
function toggleBoardConfig(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const card = el.closest('.settings-board-card');
  const isOpen = !el.classList.contains('hidden');

  // Close ALL board configs first
  document.querySelectorAll('.settings-board-config').forEach(cfg => {
    cfg.classList.add('hidden');
    const parentCard = cfg.closest('.settings-board-card');
    if (parentCard) parentCard.classList.remove('open');
  });

  // If it was closed, open it
  if (!isOpen) {
    el.classList.remove('hidden');
    if (card) card.classList.add('open');
  }
}

function renderSettingsNav() {
  const nav = document.getElementById('settings-nav');
  if (!nav) return;
  nav.innerHTML = '';

  // Explicit way back to the board; the navbar workspace chip no longer
  // doubles as the settings close control.
  const back = document.createElement('button');
  back.type = 'button';
  back.id = 'settings-back';
  back.className = 'settings-back';
  back.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg><span>Back to board</span>';
  back.onclick = () => closeSettings();
  nav.appendChild(back);

  let lastGroup = null;
  SETTINGS_SECTIONS.forEach(sec => {
    if (sec.group !== lastGroup) {
      lastGroup = sec.group;
      const header = document.createElement('div');
      header.className = 'settings-nav-section';
      header.textContent = SETTINGS_GROUPS[sec.group] || sec.group;
      nav.appendChild(header);
    }
    const item = document.createElement('div');
    item.className = 'settings-nav-item' + (sec.id === window.activeSettingsSection ? ' active' : '');
    item.innerHTML = sec.icon + '<span>' + sec.label + '</span>';
    item.onclick = () => showSettingsSection(sec.id);
    nav.appendChild(item);
  });
}

function _isAdmin() {
  const role = window.currentUser && window.currentUser.role;
  return role === 'admin' || role === 'owner';
}

function _addRestrictionNotice(sectionEl, message) {
  if (sectionEl.querySelector('.settings-restricted-notice')) return;
  const notice = document.createElement('div');
  notice.className = 'settings-restricted-notice';
  notice.textContent = message;
  const desc = sectionEl.querySelector('.settings-section-desc');
  if (desc) {
    desc.after(notice);
  } else {
    sectionEl.prepend(notice);
  }
}

function _applyRoleRestrictions() {
  if (_isAdmin()) return;

  // General — disable all inputs
  const general = document.getElementById('settings-general');
  if (general) {
    general.classList.add('settings-restricted');
    _addRestrictionNotice(general, 'Only admins can change workspace settings.');
  }

  // Boards — read-only config
  const boards = document.getElementById('settings-boards');
  if (boards) {
    boards.classList.add('settings-restricted');
    _addRestrictionNotice(boards, 'Only admins can modify board configuration.');
  }

  // Transitions — disable toggles
  const transitions = document.getElementById('settings-transitions');
  if (transitions) {
    transitions.classList.add('settings-restricted');
    _addRestrictionNotice(transitions, 'Only admins can change transition rules.');
  }

  // Integrations — restrict
  const integrations = document.getElementById('settings-integrations');
  if (integrations) {
    integrations.classList.add('settings-restricted');
    _addRestrictionNotice(integrations, 'Only admins can manage integrations.');
  }

  // Team — hide add member button
  const team = document.getElementById('settings-team');
  if (team) {
    const addBtn = team.querySelector('.settings-section-action');
    if (addBtn) addBtn.style.display = 'none';
  }

  // Danger Zone — fully hidden
  const danger = document.getElementById('settings-danger');
  if (danger) {
    danger.style.display = 'none';
  }

  // Also hide danger from nav
  const navItems = document.querySelectorAll('.settings-nav-item');
  navItems.forEach((el, i) => {
    if (SETTINGS_SECTIONS[i] && SETTINGS_SECTIONS[i].id === 'danger') {
      el.style.display = 'none';
    }
  });
}

function showSettingsSection(id, _fromRoute) {
  window.activeSettingsSection = id;
  document.querySelectorAll('.settings-nav-item').forEach((el, i) => {
    el.classList.toggle('active', SETTINGS_SECTIONS[i].id === id);
  });
  document.querySelectorAll('.settings-section').forEach(el => {
    el.classList.toggle('active', el.id === 'settings-' + id);
  });

  // Svelte island spike: Appearance and Boards are rendered by Svelte components.
  if (id === 'appearance') {
    if (typeof window.mountAppearanceIsland === 'function') window.mountAppearanceIsland();
  } else if (typeof window.unmountAppearanceIsland === 'function') {
    window.unmountAppearanceIsland();
  }
  if (id === 'boards') {
    if (typeof window.mountBoardsIsland === 'function') window.mountBoardsIsland();
  } else if (typeof window.unmountBoardsIsland === 'function') {
    window.unmountBoardsIsland();
  }

  // Section switches replace the current history entry (no new back-step).
  if (!_fromRoute) {
    window.Router.navigate({ name: 'settings', section: id }, { replace: true });
  }

}

let _settingsTransitionGen = 0;

async function openSettings(_fromRoute, section) {
  const transitionGen = ++_settingsTransitionGen;
  if (section) window.activeSettingsSection = section;
  if (transitionGen !== _settingsTransitionGen) return;

  // Update danger zone labels based on workspace state
  window.updateDangerZoneLabels();

  // Opening settings pushes one history entry (unless the route drove it).
  if (!_fromRoute) {
    window.Router.navigate({ name: 'settings', section: window.activeSettingsSection || 'general' });
  }

  const board = document.getElementById('board');
  const settings = document.getElementById('settings-page');
  const headerLeft = document.querySelector('.header-left');
  const headerActions = document.querySelector('.header-actions');

  // Fade out board/list view
  board.classList.add('fade-out');
  const listView = document.getElementById('list-view');
  if (listView) listView.style.display = 'none';
  setTimeout(() => {
    if (transitionGen !== _settingsTransitionGen) return;
    board.style.display = 'none';
    board.classList.remove('fade-out');

    // Show settings with fade in
    settings.classList.add('active');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => settings.classList.add('visible'));
    });

    // Hide board picker + board-only actions + filter bar, keep search + user menu
    const boardPicker = document.getElementById('board-picker');
    if (boardPicker) boardPicker.style.display = 'none';
    headerActions.querySelectorAll('.board-only-action').forEach(el => el.style.display = 'none');
    const filterBar = document.getElementById('filter-bar');
    if (filterBar) filterBar.style.display = 'none';

    // Add settings picker (dropdown to navigate back to boards)
    let crumb = document.getElementById('settings-breadcrumb');
    if (!crumb) {
      crumb = document.createElement('div');
      crumb.id = 'settings-breadcrumb';
      crumb.className = 'header-board-picker';
      crumb.onclick = _toggleSettingsPicker;
      crumb.innerHTML = '<span id="settings-picker-label">Settings</span>' +
        '<svg class="header-board-chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>' +
        '<div class="header-board-menu hidden" id="settings-picker-menu"></div>';
      headerLeft.appendChild(crumb);
    }
    crumb.style.display = 'flex';
    _buildSettingsPickerMenu();

    renderSettingsNav();
    showSettingsSection(window.activeSettingsSection);
    window.initSettingsDropdowns();
    window.initSettingsBindings();
    window.bindSemanticSearchControls();
    window.loadSettings('general');
    window.loadSettings('appearance');
    window.loadBoardsSettings();
    window.loadTransitionsSettings();
    window.loadTeamMembers();
    window.loadAPIKeys();
    window.loadDiscordConfig();
  }, 100);
}

function _toggleSettingsPicker(e) {
  if (e && e.target.closest('#settings-picker-menu')) return;
  const menu = document.getElementById('settings-picker-menu');
  const crumb = document.getElementById('settings-breadcrumb');
  if (!menu) return;
  const isOpen = menu.classList.contains('visible');
  if (isOpen) {
    menu.classList.remove('visible');
    if (crumb) crumb.classList.remove('open');
    setTimeout(() => menu.classList.add('hidden'), 200);
  } else {
    menu.classList.remove('hidden');
    if (crumb) crumb.classList.add('open');
    requestAnimationFrame(() => menu.classList.add('visible'));
  }
}

function _buildSettingsPickerMenu() {
  const menu = document.getElementById('settings-picker-menu');
  if (!menu) return;

  function closeMenu() {
    menu.classList.remove('visible');
    setTimeout(() => menu.classList.add('hidden'), 200);
    document.getElementById('settings-breadcrumb')?.classList.remove('open');
  }

  if (typeof window._buildPickerMenu === 'function') {
    window._buildPickerMenu(menu, {
      activeId: 'settings',
      inSettings: true,
      closeMenu: closeMenu,
    });
  }
}

function closeSettings(_fromRoute) {
  const transitionGen = ++_settingsTransitionGen;

  // If settings isn't open, nothing is mounted
  const _sp = document.getElementById('settings-page');
  if (_sp && !_sp.classList.contains('active')) return;

  if (typeof window.unmountAppearanceIsland === 'function') window.unmountAppearanceIsland();
  if (typeof window.unmountBoardsIsland === 'function') window.unmountBoardsIsland();

  // Return to the last concrete board (replace, so back doesn't reopen settings).
  if (!_fromRoute && window.currentWorkspace) {
    const last = window.lastConcreteBoardId || window.currentBoardId;
    const board = last && last !== 'all'
      ? window.boardList.find(b => b.id === last)
      : null;
    window.Router.navigate(board
      ? { name: 'board', workspaceRef: window.currentWorkspace.slug, boardRef: board.slug }
      : { name: 'workspace', workspaceRef: window.currentWorkspace.slug }, { replace: true });
  }

  const board = document.getElementById('board');
  const settings = document.getElementById('settings-page');
  const headerLeft = document.querySelector('.header-left');
  const headerActions = document.querySelector('.header-actions');

  // Fade out settings
  settings.classList.remove('visible');
  setTimeout(() => {
    if (transitionGen !== _settingsTransitionGen) return;
    settings.classList.remove('active');

    // Show board or list view depending on current view
    const listView = document.getElementById('list-view');
    if (typeof window.currentView !== 'undefined' && window.currentView === 'list') {
      board.style.display = 'none';
      if (listView) {
        listView.style.display = '';
        if (typeof window.renderListView === 'function') window.renderListView();
      }
    } else {
      board.style.display = '';
      if (listView) listView.style.display = 'none';
      board.classList.add('fade-in');
      board.addEventListener('animationend', () => board.classList.remove('fade-in'), { once: true });
    }

    // Restore board picker + board-only actions + filter bar, hide settings breadcrumb
    const boardPicker = document.getElementById('board-picker');
    if (boardPicker) boardPicker.style.display = '';
    headerActions.querySelectorAll('.board-only-action').forEach(el => el.style.display = '');
    const filterBar = document.getElementById('filter-bar');
    if (filterBar) filterBar.style.display = '';
    const crumb = document.getElementById('settings-breadcrumb');
    if (crumb) crumb.style.display = 'none';

    // Re-hide board menu via CSS class (not inline style)
    const menu = document.getElementById('board-menu');
    if (menu) { menu.classList.add('hidden'); menu.classList.remove('visible'); }
  }, 120);
}

window.SETTINGS_SECTIONS = SETTINGS_SECTIONS;
window.SETTINGS_GROUPS = SETTINGS_GROUPS;
window.activeSettingsSection = activeSettingsSection;
window.toggleBoardConfig = toggleBoardConfig;
window.renderSettingsNav = renderSettingsNav;
window.showSettingsSection = showSettingsSection;
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window._isAdmin = _isAdmin;
window._applyRoleRestrictions = _applyRoleRestrictions;
window._addRestrictionNotice = _addRestrictionNotice;
