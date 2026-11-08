// ── Import ──

function importFromJira() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,.csv';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await window.API.importJira(data);
      window.Toast.success('Jira import complete');
    } catch (err) {
      window.Toast.error('Import failed: ' + err.message);
    }
  };
  input.click();
}

function importFromTrello() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await window.API.importTrello(data);
      window.Toast.success('Trello import complete');
    } catch (err) {
      window.Toast.error('Import failed: ' + err.message);
    }
  };
  input.click();
}

// ── Export ──

async function exportData() {
  try {
    const data = await window.API.exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'lwts-export.json'; a.click();
    URL.revokeObjectURL(url);
    window.Toast.success('Export downloaded');
  } catch (e) {
    window.Toast.error(e.message);
  }
}

// ── Danger Zone ──

function openResetModal() {
  const modal = document.getElementById('reset-modal');
  const hasDemo = document.getElementById('danger-reset-btn').textContent === 'Initialize';
  document.getElementById('reset-modal-title').textContent = hasDemo ? 'Initialize Workspace' : 'Reset Workspace';
  if (window.currentUser) {
    document.getElementById('reset-admin-info').textContent =
      window.currentUser.name + ' (' + window.currentUser.email + ') will be kept. All other users will be removed. Make sure you know this account\'s password.';
  }
  modal.classList.add('active');
}

function closeResetModal() {
  document.getElementById('reset-modal').classList.remove('active');
}

async function doReset(mode) {
  closeResetModal();
  try {
    await window.API.post('/api/v1/settings/reset', { mode: mode });
    window.Toast.success(mode === 'demo' ? 'Workspace reset with demo data' : 'Workspace reset to empty');
    localStorage.removeItem('lwts-board-id');
    localStorage.removeItem('lwts-kanban');
    window.currentBoardId = null;
    window.boardList = [];
    window.state = { backlog: [], todo: [], 'in-progress': [], done: [], cleared: [] };
    // Close settings without triggering loadFromAPI (closeSettings restores board view)
    window.closeSettings();
    // Wait a tick for settings to close, then reload fresh
    setTimeout(function() {
      window._renderAnimateCards = true;
      window.loadFromAPI();
    }, 200);
  } catch (e) {
    window.Toast.error(e.message);
  }
}

async function updateDangerZoneLabels() {
  try {
    const res = await fetch('/api/v1/workspace-status', {
      headers: { 'Authorization': 'Bearer ' + window.Auth.getAccessToken() }
    });
    const status = await res.json();
    const title = document.getElementById('danger-reset-title');
    const desc = document.getElementById('danger-reset-desc');
    const btn = document.getElementById('danger-reset-btn');
    if (status.has_demo) {
      title.textContent = 'Initialize Workspace';
      desc.textContent = 'Clear demo data and start fresh, or reset to demo state';
      btn.textContent = 'Initialize';
    } else {
      title.textContent = 'Reset Workspace';
      desc.textContent = 'Delete all boards, cards, and settings. Your admin account is preserved.';
      btn.textContent = 'Reset';
    }
  } catch (e) { /* ignore */ }
}

window.importFromJira = importFromJira;
window.importFromTrello = importFromTrello;
window.exportData = exportData;
window.openResetModal = openResetModal;
window.closeResetModal = closeResetModal;
window.doReset = doReset;
window.updateDangerZoneLabels = updateDangerZoneLabels;
