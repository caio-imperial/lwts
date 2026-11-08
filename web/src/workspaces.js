// LWTS — Workspace switcher (phase 3d)
//
// The active workspace lives in kanban.js state (`workspaceList`,
// `currentWorkspace`, `boardList`). This module owns the header picker, the
// switch flow and the "New workspace" modal, all built on the same header menu
// classes as the board picker.
//
// Loaded before kanban.js in main.js: the module only publishes functions on
// `window` at import time and touches shared state lazily, at call time, so
// the import order is safe in either direction.

const WORKSPACE_STORAGE_KEY = 'lwts-workspace';

function _workspaceLabelText() {
  const ws = window.currentWorkspace;
  return (ws && ws.name) || 'Workspace';
}

// ── Picker menu ──

function renderWorkspacePicker() {
  const menu = document.getElementById('workspace-menu');
  if (!menu) return;

  menu.innerHTML = '';
  const current = window.currentWorkspace;
  const list = Array.isArray(window.workspaceList) ? window.workspaceList : [];

  list.forEach((ws) => {
    const opt = document.createElement('div');
    opt.className = 'header-board-option' + (current && ws.id === current.id ? ' active' : '');
    opt.textContent = ws.name;
    opt.title = ws.name;
    opt.onclick = (e) => {
      e.stopPropagation();
      switchWorkspace(ws);
    };
    menu.appendChild(opt);
  });

  if (list.length > 0) {
    const sep = document.createElement('div');
    sep.className = 'header-board-sep';
    menu.appendChild(sep);
  }

  const newOpt = document.createElement('div');
  newOpt.className = 'header-board-option new';
  newOpt.textContent = '+ New workspace';
  newOpt.onclick = (e) => {
    e.stopPropagation();
    openCreateWorkspaceModal();
  };
  menu.appendChild(newOpt);

  const label = document.getElementById('workspace-picker-label');
  if (label) label.textContent = _workspaceLabelText();
}

function toggleWorkspacePicker(event) {
  if (event && event.target && event.target.closest && event.target.closest('#workspace-menu')) {
    return;
  }
  const menu = document.getElementById('workspace-menu');
  const picker = document.getElementById('workspace-picker');
  if (!menu || !picker) return;

  if (menu.classList.contains('hidden')) {
    // Only one header menu may be open at a time.
    if (typeof window.closeBoardPicker === 'function') window.closeBoardPicker();
    renderWorkspacePicker();
    menu.classList.remove('hidden');
    requestAnimationFrame(() => menu.classList.add('visible'));
    picker.classList.add('open');
    document.addEventListener('click', closeWorkspacePickerOnClick, true);
    document.addEventListener('keydown', closeWorkspacePickerOnKey);
  } else {
    closeWorkspacePicker();
  }
}

function closeWorkspacePicker() {
  const menu = document.getElementById('workspace-menu');
  if (!menu) return;
  menu.classList.remove('visible');
  const picker = document.getElementById('workspace-picker');
  if (picker) picker.classList.remove('open');
  setTimeout(() => menu.classList.add('hidden'), 200);
  document.removeEventListener('click', closeWorkspacePickerOnClick, true);
  document.removeEventListener('keydown', closeWorkspacePickerOnKey);
}

function closeWorkspacePickerOnClick(e) {
  if (!e.target || !e.target.closest || !e.target.closest('#workspace-picker')) {
    closeWorkspacePicker();
  }
}

function closeWorkspacePickerOnKey(e) {
  if (e.key === 'Escape') closeWorkspacePicker();
}

// ── Switching ──

// Updates the active workspace and its board list without touching the URL.
// Also used by the router when a popstate lands on another workspace.
async function setActiveWorkspace(ws) {
  if (!ws) return null;

  window.currentWorkspace = ws;
  try {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, ws.slug);
  } catch (e) { /* storage may be unavailable */ }

  const boards = await window.API.listWorkspaceBoards(ws.slug);
  window.boardList = Array.isArray(boards) ? boards : [];
  window.currentBoardId = 'all';

  renderWorkspacePicker();
  if (typeof window.renderBoardPicker === 'function') window.renderBoardPicker();
  return window.boardList;
}

async function switchWorkspace(ws) {
  if (!ws) return;
  closeWorkspacePicker();

  const isCurrent = window.currentWorkspace && ws.id === window.currentWorkspace.id;
  if (isCurrent) return;

  if (typeof window.closeBoardPicker === 'function') window.closeBoardPicker();
  const detailModal = document.getElementById('detail-modal');
  if (detailModal && detailModal.classList.contains('active') && typeof window.closeDetail === 'function') {
    window.closeDetail(true);
  }
  const settingsPage = document.getElementById('settings-page');
  if (settingsPage && settingsPage.classList.contains('active') && typeof window.closeSettings === 'function') {
    window.closeSettings(true);
  }

  try {
    await setActiveWorkspace(ws);
  } catch (e) {
    if (window.Toast) window.Toast.error('Failed to open workspace: ' + (e.message || 'unknown'));
    return;
  }

  window.Router.navigate({ name: 'workspace', workspaceRef: ws.slug });

  // Same behavior as "All Boards": drop the single-board stream, load every
  // board of the workspace and render.
  if (typeof window.selectBoard === 'function') {
    await window.selectBoard('all', 'All Boards', { fromRoute: true });
  } else {
    await window.loadAllBoardCards();
  }

  renderWorkspacePicker();
}

// ── New workspace modal ──

function _ensureCreateWorkspaceModal() {
  let modal = document.getElementById('workspace-modal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'workspace-modal';
  modal.className = 'lwts-modal-overlay';
  modal.innerHTML = `
    <div class="lwts-modal workspace-modal">
      <div class="lwts-modal-header">
        <h3>New workspace</h3>
        <button class="lwts-modal-close" type="button" onclick="closeCreateWorkspaceModal()">&times;</button>
      </div>
      <div class="lwts-modal-body">
        <div class="form-group">
          <label for="new-workspace-name">Workspace name</label>
          <input id="new-workspace-name" type="text" placeholder="Acme" autocomplete="off" maxlength="60">
        </div>
      </div>
      <div class="lwts-modal-footer">
        <div></div>
        <div class="modal-footer-right">
          <button class="lwts-modal-btn-cancel" type="button" onclick="closeCreateWorkspaceModal()">Cancel</button>
          <button class="lwts-modal-btn-primary" id="create-workspace-submit" type="button" disabled onclick="submitCreateWorkspace()">Create</button>
        </div>
      </div>
    </div>
  `;
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeCreateWorkspaceModal();
  });
  document.body.appendChild(modal);

  const input = document.getElementById('new-workspace-name');
  const submit = document.getElementById('create-workspace-submit');
  input.addEventListener('input', () => {
    submit.disabled = input.value.trim() === '';
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitCreateWorkspace();
    } else if (e.key === 'Escape') {
      closeCreateWorkspaceModal();
    }
  });

  return modal;
}

function openCreateWorkspaceModal() {
  closeWorkspacePicker();
  const modal = _ensureCreateWorkspaceModal();
  const input = document.getElementById('new-workspace-name');
  const submit = document.getElementById('create-workspace-submit');
  input.value = '';
  submit.disabled = true;

  modal.classList.remove('active');
  void modal.offsetWidth;
  requestAnimationFrame(() => {
    modal.classList.add('active');
    setTimeout(() => input.focus(), 100);
  });
}

function closeCreateWorkspaceModal() {
  const modal = document.getElementById('workspace-modal');
  if (modal) modal.classList.remove('active');
}

async function submitCreateWorkspace() {
  const input = document.getElementById('new-workspace-name');
  const submit = document.getElementById('create-workspace-submit');
  if (!input || !submit) return;

  const name = input.value.trim();
  if (!name) return;

  submit.disabled = true;
  try {
    const ws = await window.API.createWorkspace(name);
    window.workspaceList = (window.workspaceList || []).concat([ws]);
    closeCreateWorkspaceModal();
    if (window.Toast) window.Toast.success('Workspace "' + ws.name + '" created');
    await switchWorkspace(ws);
  } catch (e) {
    if (window.Toast) window.Toast.error('Failed to create workspace: ' + (e.message || 'unknown'));
    submit.disabled = false;
  }
}

window.renderWorkspacePicker = renderWorkspacePicker;
window.toggleWorkspacePicker = toggleWorkspacePicker;
window.closeWorkspacePicker = closeWorkspacePicker;
window.closeWorkspacePickerOnClick = closeWorkspacePickerOnClick;
window.closeWorkspacePickerOnKey = closeWorkspacePickerOnKey;
window.setActiveWorkspace = setActiveWorkspace;
window.switchWorkspace = switchWorkspace;
window.openCreateWorkspaceModal = openCreateWorkspaceModal;
window.closeCreateWorkspaceModal = closeCreateWorkspaceModal;
window.submitCreateWorkspace = submitCreateWorkspace;
