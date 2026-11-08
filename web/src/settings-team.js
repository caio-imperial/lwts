// ── Team Section ──

const _userColors = ['#82B1FF', '#fbc02d', '#4ade80', '#fb8c00', '#e040fb', '#00bcd4'];

function _initials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

async function loadTeamMembers() {
  try {
    const users = await window.API.listUsers();
    const me = window.Auth.getUser && window.Auth.getUser();
    const list = document.getElementById('settings-team-list');
    if (!list) return;
    list.innerHTML = '';

    // Separate humans and bots
    const humans = users.filter(u => !u.email || !u.email.endsWith('@bots.local'));
    const bots = users.filter(u => u.email && u.email.endsWith('@bots.local'));

    humans.forEach((u, i) => {
      const color = _userColors[i % _userColors.length];
      const isMe = me && me.id === u.id;
      const div = document.createElement('div');
      div.className = 'settings-user clickable';
      div.addEventListener('click', () => window.openEditUserModal(u));
      const roleLabel = u.role.charAt(0).toUpperCase() + u.role.slice(1);
      const roleBadge = '<span class="settings-user-role-badge ' + u.role + '">' + roleLabel + '</span>';
      const avatarInner = u.avatar_url
        ? `<img src="${u.avatar_url}" alt="${_initials(u.name)}">`
        : _initials(u.name);
      div.innerHTML = `
        <div class="settings-user-avatar-wrap">
          <div class="settings-user-avatar" style="background:${u.avatar_url ? 'transparent' : color + '30'};color:${color};border-color:${color}40">${avatarInner}</div>
        </div>
        <div class="settings-user-info"><div class="settings-user-name">${u.name}${isMe ? ' (you)' : ''}</div><div class="settings-user-role">${u.email}</div></div>
        <div class="settings-user-actions">${roleBadge}</div>`;
      list.appendChild(div);
    });

    // Bots subsection
    _renderBotsSection(bots, list);
  } catch (e) {
    // silently fail
  }
}

function _renderBotsSection(bots, container) {
  // Group header with right-aligned button
  const header = document.createElement('div');
  header.className = 'settings-group-title';
  header.style.cssText = 'margin-top:24px;display:flex;align-items:center;justify-content:space-between';
  header.innerHTML = '<span>Bots</span>' +
    (window._isAdmin() ? '<button class="btn settings-action-btn" onclick="openCreateBotModal()">+ Create bot</button>' : '');
  container.appendChild(header);

  if (bots.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'color:var(--text-dimmed);font-size:0.85rem;padding:8px 0';
    empty.textContent = 'No bots yet';
    container.appendChild(empty);
  } else {
    bots.forEach((bot, i) => {
      const color = '#9ca3af';
      const div = document.createElement('div');
      div.className = 'settings-user clickable';
      div.addEventListener('click', () => window.openEditBotModal(bot));
      const roleLabel = bot.role.charAt(0).toUpperCase() + bot.role.slice(1);
      const roleBadge = '<span class="settings-user-role-badge ' + bot.role + '">' + roleLabel + '</span>';
      div.innerHTML = `
        <div class="settings-user-avatar-wrap">
          <div class="settings-user-avatar" style="background:${color}30;color:${color};border-color:${color}40">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><line x1="12" y1="7" x2="12" y2="11"/><circle cx="8" cy="16" r="1"/><circle cx="16" cy="16" r="1"/></svg>
          </div>
        </div>
        <div class="settings-user-info">
          <div class="settings-user-name">${window._escHtml(bot.name)}<span class="settings-user-bot-badge">BOT</span></div>
          <div class="settings-user-bot-note">Set an API key in API Keys settings</div>
        </div>
        <div class="settings-user-actions">${roleBadge}</div>`;
      container.appendChild(div);
    });
  }

}

async function updateUserRole(userId, role) {
  try {
    await window.API.updateUserRole(userId, role.toLowerCase());
    window.Toast.success('Role updated');
  } catch (e) {
    window.Toast.error(e.message);
    loadTeamMembers();
  }
}

async function removeTeamMember(userId, name) {
  const ok = await window.fnConfirm('Remove ' + name + ' from the team?', 'Remove member', 'Remove');
  if (!ok) return;
  try {
    await window.API.deleteUser(userId);
    window.Toast.success(name + ' removed');
    loadTeamMembers();
  } catch (e) {
    window.Toast.error(e.message);
  }
}

async function sendInvite() {
  const input = document.getElementById('invite-email-input');
  const email = input.value.trim();
  if (!email) { window.Toast.error('Email is required'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { window.Toast.error('Enter a valid email address'); return; }
  try {
    const result = await window.API.createInvite(email, 'member');
    input.value = '';
    window.Toast.success('Invite sent — ' + result.invite_url);
  } catch (e) {
    window.Toast.error(e.message);
  }
}

// ── API Keys Section ──

async function loadAPIKeys() {
  try {
    const keys = await window.API.listKeys();
    const list = document.getElementById('settings-api-keys-list');
    if (!list) return;
    list.innerHTML = '';
    if (keys.length === 0) {
      list.innerHTML = '<div style="color:var(--text-dimmed);font-size:0.85rem;padding:8px 0">No API keys yet</div>';
      return;
    }
    keys.forEach(k => {
      const card = document.createElement('div');
      card.className = 'settings-board-card';
      const keyId = k.id;
      card.innerHTML = `
        <div class="settings-board-header">
          <div style="display:flex;align-items:center;gap:8px;min-width:0;flex:1">
            <code style="font-family:'SF Mono',Monaco,Consolas,monospace;font-size:0.82rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${k.key_masked}</code>
            <button class="lwts-modal-btn-cancel settings-api-key-action-btn" onclick="copyAPIKeyToClipboard('${keyId}')" title="Copy key">Copy</button>
          </div>
          <div class="settings-board-meta" style="display:flex;align-items:center;gap:8px;flex-shrink:0">
            ${k.name}
            <button class="settings-btn-danger" style="font-size:0.75rem;height:26px;padding:0 10px" onclick="revokeAPIKey('${keyId}')">Revoke</button>
          </div>
        </div>`;
      list.appendChild(card);
    });
  } catch (e) {
    // silently fail
  }
}

async function copyAPIKeyToClipboard(keyId) {
  try {
    const result = await window.API.revealKey(keyId);
    await navigator.clipboard.writeText(result.key);
    window.Toast.success('Key copied to clipboard');
  } catch (e) {
    window.Toast.error('Failed to copy key');
  }
}

async function openCreateKeyModal() {
  document.getElementById('create-key-name').value = '';
  document.getElementById('created-key-result').style.display = 'none';
  document.getElementById('create-key-name').closest('.form-group').style.display = '';
  document.getElementById('key-modal-submit').style.display = '';
  document.getElementById('key-modal-title').textContent = 'Create API key';

  // User selector for admins
  const selectorGroup = document.getElementById('key-user-selector-group');
  const selector = document.getElementById('create-key-user-id');
  if (window._isAdmin() && selectorGroup && selector) {
    selectorGroup.style.display = '';
    selector.innerHTML = '<option value="">Myself</option>';
    try {
      const users = await window.API.listUsers();
      users.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.id;
        const isBot = u.email && u.email.endsWith('@bots.local');
        opt.textContent = u.name + (isBot ? ' (bot)' : '');
        selector.appendChild(opt);
      });
    } catch (e) { /* ignore */ }
  } else if (selectorGroup) {
    selectorGroup.style.display = 'none';
  }

  document.getElementById('create-key-modal').classList.add('active');
  setTimeout(() => document.getElementById('create-key-name').focus(), 100);
}

function closeCreateKeyModal() {
  document.getElementById('create-key-modal').classList.remove('active');
}

let _createdKeyValue = '';

async function submitCreateKeyModal() {
  const input = document.getElementById('create-key-name');
  const name = input.value.trim();
  if (!name) { window.Toast.error('Key name required'); return; }
  try {
    const userSelect = document.getElementById('create-key-user-id');
    const userId = (window._isAdmin() && userSelect && userSelect.value) ? userSelect.value : undefined;
    const result = await window.API.createKey(name, userId);
    _createdKeyValue = result.key || '';
    // Show the created key for copying
    input.closest('.form-group').style.display = 'none';
    document.getElementById('created-key-value').textContent = _createdKeyValue;
    document.getElementById('created-key-result').style.display = '';
    document.getElementById('key-modal-submit').style.display = 'none';
    document.getElementById('key-modal-title').textContent = 'API key created';
    window.Toast.success('API key created');
    loadAPIKeys();
  } catch (e) {
    window.Toast.error(e.message);
  }
}

function copyCreatedKey() {
  if (!_createdKeyValue) return;
  navigator.clipboard.writeText(_createdKeyValue).then(() => {
    window.Toast.success('Key copied to clipboard');
  }).catch(() => {
    window.Toast.error('Failed to copy');
  });
}

async function revokeAPIKey(id) {
  const ok = await window.fnConfirm('Revoke this API key? This cannot be undone.', 'Revoke key', 'Revoke');
  if (!ok) return;
  try {
    await window.API.deleteKey(id);
    window.Toast.success('Key revoked');
    loadAPIKeys();
  } catch (e) {
    window.Toast.error(e.message);
  }
}

window.loadTeamMembers = loadTeamMembers;
window.updateUserRole = updateUserRole;
window.removeTeamMember = removeTeamMember;
window.sendInvite = sendInvite;
window.loadAPIKeys = loadAPIKeys;
window.copyAPIKeyToClipboard = copyAPIKeyToClipboard;
window.openCreateKeyModal = openCreateKeyModal;
window.closeCreateKeyModal = closeCreateKeyModal;
window.submitCreateKeyModal = submitCreateKeyModal;
window.copyCreatedKey = copyCreatedKey;
window.revokeAPIKey = revokeAPIKey;
window._userColors = _userColors;
