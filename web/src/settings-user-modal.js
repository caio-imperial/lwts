// ── User Modal (shared for create + edit) ──

let _userModalRoleDropdown = null;
let _userModalEditId = null; // null = create mode, string = edit mode

function _initUserRoleDropdown(value) {
  const roleEl = document.getElementById('create-user-role');
  if (!_userModalRoleDropdown) {
    _userModalRoleDropdown = new window.FnDropdown(roleEl, {
      options: [
        { value: 'member', label: 'Member' },
        { value: 'admin', label: 'Admin' },
        { value: 'viewer', label: 'Viewer' }
      ],
      value: value || 'member',
      compact: true
    });
  } else {
    _userModalRoleDropdown.setValue(value || 'member', true);
  }
}

const AVATAR_OPTIONS = [
  'flower', 'leaf', 'wave', 'mountain', 'sun',
  'star', 'cloud', 'lightning', 'drop', 'flame',
];

function _initAvatarPicker(currentUrl) {
  const picker = document.getElementById('avatar-picker');
  const hidden = document.getElementById('create-user-avatar');
  if (!picker) return;
  hidden.value = currentUrl || '';
  picker.innerHTML = '';

  AVATAR_OPTIONS.forEach((name, i) => {
    const color = window._userColors[i % window._userColors.length];
    const url = '/avatars/options/' + name + '.png';
    const opt = document.createElement('div');
    opt.className = 'avatar-picker-option' + (currentUrl === url ? ' selected' : '');
    opt.style.borderColor = color + '40';
    opt.innerHTML = '<img src="' + url + '" alt="' + name + '">' +
      '<svg class="avatar-check" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>';
    opt.addEventListener('click', () => {
      picker.querySelectorAll('.avatar-picker-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      hidden.value = url;
    });
    picker.appendChild(opt);
  });
}

// Avatar upload handler
document.addEventListener('DOMContentLoaded', () => {
  const uploadInput = document.getElementById('avatar-upload-input');
  if (uploadInput) {
    uploadInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        document.getElementById('create-user-avatar').value = reader.result;
        // Deselect any picked avatar
        document.querySelectorAll('#avatar-picker .avatar-picker-option').forEach(o => o.classList.remove('selected'));
      };
      reader.readAsDataURL(file);
      uploadInput.value = '';
    });
  }
});

let _userModalBotMode = false;

function openCreateUserModal() {
  _userModalEditId = null;
  _userModalBotMode = false;
  document.getElementById('user-modal-title').textContent = 'Add team member';
  document.getElementById('create-user-name').value = '';
  document.getElementById('create-user-email').value = '';
  document.getElementById('create-user-email').disabled = false;
  document.getElementById('create-user-email').style.opacity = '';
  document.getElementById('create-user-password').value = '';
  document.getElementById('create-user-password').disabled = false;
  document.getElementById('create-user-password').style.opacity = '';
  document.getElementById('create-user-password').placeholder = 'Initial password';
  document.getElementById('user-modal-submit').textContent = 'Create';
  document.getElementById('user-modal-delete').classList.add('hidden');
  const botNotice = document.getElementById('user-modal-bot-notice');
  if (botNotice) botNotice.style.display = 'none';
  _initUserRoleDropdown('member');
  _initAvatarPicker('');
  document.getElementById('create-user-modal').classList.add('active');
  setTimeout(() => document.getElementById('create-user-name').focus(), 100);
}

function openCreateBotModal() {
  _userModalEditId = null;
  _userModalBotMode = true;
  document.getElementById('user-modal-title').textContent = 'Create bot';
  document.getElementById('create-user-name').value = '';
  document.getElementById('create-user-email').value = '';
  document.getElementById('create-user-email').disabled = true;
  document.getElementById('create-user-email').style.opacity = '0.35';
  document.getElementById('create-user-email').placeholder = 'Auto-generated for bots';
  document.getElementById('create-user-password').value = '';
  document.getElementById('create-user-password').disabled = true;
  document.getElementById('create-user-password').style.opacity = '0.35';
  document.getElementById('create-user-password').placeholder = 'Not required for bots';
  document.getElementById('user-modal-submit').textContent = 'Create Bot';
  document.getElementById('user-modal-delete').classList.add('hidden');
  // Show bot notice
  let botNotice = document.getElementById('user-modal-bot-notice');
  if (!botNotice) {
    botNotice = document.createElement('div');
    botNotice.id = 'user-modal-bot-notice';
    botNotice.className = 'settings-restricted-notice';
    botNotice.textContent = 'Bots authenticate via API keys. Create one in API Keys after saving.';
    const form = document.getElementById('create-user-name').closest('.lwts-modal-body') || document.getElementById('create-user-name').parentNode.parentNode;
    form.insertBefore(botNotice, form.firstChild);
  }
  botNotice.style.display = '';
  _initUserRoleDropdown('member');
  _initAvatarPicker('');
  document.getElementById('create-user-modal').classList.add('active');
  setTimeout(() => document.getElementById('create-user-name').focus(), 100);
}

function openEditUserModal(user) {
  _userModalEditId = user.id;
  document.getElementById('user-modal-title').textContent = user.name;
  document.getElementById('create-user-name').value = user.name;
  document.getElementById('create-user-email').value = user.email;
  document.getElementById('create-user-password').value = '';
  document.getElementById('create-user-password').placeholder = 'New password (leave blank to keep)';
  document.getElementById('user-modal-submit').textContent = 'Save';
  const me = window.Auth.getUser && window.Auth.getUser();
  const isMe = me && me.id === user.id;
  const deleteBtn = document.getElementById('user-modal-delete');
  deleteBtn.classList.toggle('hidden', isMe || user.role === 'owner');
  _initUserRoleDropdown(user.role === 'owner' ? 'admin' : user.role);
  _initAvatarPicker(user.avatar_url || '');
  document.getElementById('create-user-modal').classList.add('active');
  setTimeout(() => document.getElementById('create-user-name').focus(), 100);
}

function openEditBotModal(bot) {
  _userModalEditId = bot.id;
  _userModalBotMode = true;
  document.getElementById('user-modal-title').textContent = bot.name;
  document.getElementById('create-user-name').value = bot.name;
  document.getElementById('create-user-email').value = '';
  document.getElementById('create-user-email').disabled = true;
  document.getElementById('create-user-email').style.opacity = '0.35';
  document.getElementById('create-user-email').placeholder = 'Auto-generated for bots';
  document.getElementById('create-user-password').value = '';
  document.getElementById('create-user-password').disabled = true;
  document.getElementById('create-user-password').style.opacity = '0.35';
  document.getElementById('create-user-password').placeholder = 'Not required for bots';
  document.getElementById('user-modal-submit').textContent = 'Save';
  const deleteBtn = document.getElementById('user-modal-delete');
  deleteBtn.classList.remove('hidden');
  _initUserRoleDropdown(bot.role === 'owner' ? 'admin' : bot.role);
  _initAvatarPicker('');
  const botNotice = document.getElementById('user-modal-bot-notice');
  if (botNotice) botNotice.style.display = '';
  document.getElementById('create-user-modal').classList.add('active');
  setTimeout(() => document.getElementById('create-user-name').focus(), 100);
}

function closeCreateUserModal() {
  document.getElementById('create-user-modal').classList.remove('active');
}

async function submitUserModal() {
  const name = document.getElementById('create-user-name').value.trim();
  const email = document.getElementById('create-user-email').value.trim();
  const password = document.getElementById('create-user-password').value;
  const role = _userModalRoleDropdown ? _userModalRoleDropdown.getValue() : 'member';
  if (!name) { window.Toast.error('Name is required'); return; }
  if (!_userModalBotMode && (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) { window.Toast.error('Valid email is required'); return; }

  const avatarUrl = document.getElementById('create-user-avatar').value;

  if (_userModalEditId) {
    // Edit mode
    try {
      await window.API.updateUserRole(_userModalEditId, role);
      if (avatarUrl !== undefined) {
        await window.API.updateUserAvatar(_userModalEditId, avatarUrl);
      }
      closeCreateUserModal();
      window.Toast.success('User updated');
      window.loadTeamMembers();
    } catch (e) {
      window.Toast.error(e.message || 'Failed to update user');
    }
  } else if (_userModalBotMode) {
    // Bot create mode
    try {
      await window.API.createBot(name, role);
      closeCreateUserModal();
      window.Toast.success(name + ' bot created');
      window.loadTeamMembers();
    } catch (e) {
      window.Toast.error(e.message || 'Failed to create bot');
    }
  } else {
    // User create mode
    if (!password) { window.Toast.error('Password is required'); return; }
    try {
      await window.API.createUser(name, email, password, role);
      closeCreateUserModal();
      window.Toast.success(name + ' added to the team');
      window.loadTeamMembers();
    } catch (e) {
      window.Toast.error(e.message || 'Failed to create user');
    }
  }
}

async function deleteUserFromModal() {
  if (!_userModalEditId) return;
  const name = document.getElementById('create-user-name').value.trim();
  try {
    await window.API.deleteUser(_userModalEditId);
    closeCreateUserModal();
    window.Toast.success(name + ' removed');
    window.loadTeamMembers();
  } catch (e) {
    window.Toast.error(e.message);
  }
}

// ── Avatar Picker ──

const DEFAULT_AVATARS = (function() {
  const colors = ['#82B1FF', '#fbc02d', '#4ade80', '#fb8c00', '#579DFF', '#ce93d8', '#4dd0e1', '#2B7DE9'];
  const patterns = ['circle', 'ring', 'diamond', 'stripe'];
  const avatars = [];
  for (let i = 0; i < 8; i++) {
    const c = colors[i];
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const pat = patterns[i % patterns.length];
    // Background
    ctx.fillStyle = c + '30';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = c;
    if (pat === 'circle') {
      ctx.beginPath(); ctx.arc(32, 32, 20, 0, Math.PI * 2); ctx.fill();
    } else if (pat === 'ring') {
      ctx.lineWidth = 6; ctx.strokeStyle = c;
      ctx.beginPath(); ctx.arc(32, 32, 18, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(32, 32, 8, 0, Math.PI * 2); ctx.fill();
    } else if (pat === 'diamond') {
      ctx.beginPath(); ctx.moveTo(32, 8); ctx.lineTo(56, 32); ctx.lineTo(32, 56); ctx.lineTo(8, 32); ctx.closePath(); ctx.fill();
    } else if (pat === 'stripe') {
      for (let s = 0; s < 4; s++) {
        ctx.fillRect(8 + s * 14, 16, 8, 32);
      }
    }
    avatars.push(canvas.toDataURL('image/png'));
  }
  return avatars;
})();

function openAvatarPicker(userId, btnEl) {
  // Close any existing picker
  closeAvatarPicker();

  const popover = document.createElement('div');
  popover.className = 'avatar-picker-popover';
  popover.id = 'avatar-picker-popover';

  popover.innerHTML = `
    <div class="avatar-picker-title">Choose Avatar</div>
    <button class="avatar-picker-upload-btn" onclick="uploadAvatarFile('${userId}')">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      Upload from file
    </button>
    <div class="avatar-picker-divider"></div>
    <div class="avatar-picker-grid">
      ${DEFAULT_AVATARS.map((url, i) => `<div class="avatar-picker-option" onclick="selectDefaultAvatar('${userId}', ${i})"><img src="${url}"></div>`).join('')}
    </div>
    <div class="avatar-picker-divider"></div>
    <button class="avatar-picker-remove-btn" onclick="removeAvatar('${userId}')">Remove avatar</button>
  `;

  // Position near the button
  const wrap = btnEl.closest('.settings-user-avatar-wrap') || btnEl.parentElement;
  wrap.style.position = 'relative';
  wrap.appendChild(popover);

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', _avatarPickerOutsideClick);
  }, 10);
}

function _avatarPickerOutsideClick(e) {
  const popover = document.getElementById('avatar-picker-popover');
  if (popover && !popover.contains(e.target) && !e.target.closest('.settings-user-avatar')) {
    closeAvatarPicker();
  }
}

function closeAvatarPicker() {
  const popover = document.getElementById('avatar-picker-popover');
  if (popover) popover.remove();
  document.removeEventListener('click', _avatarPickerOutsideClick);
}

function uploadAvatarFile(userId) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // Resize and convert to data URL
    const dataUrl = await resizeImageToDataURL(file, 128);
    await saveAvatar(userId, dataUrl);
  };
  input.click();
}

function selectDefaultAvatar(userId, idx) {
  saveAvatar(userId, DEFAULT_AVATARS[idx]);
}

function removeAvatar(userId) {
  saveAvatar(userId, '');
}

async function saveAvatar(userId, dataUrl) {
  closeAvatarPicker();
  try {
    await window.API.updateUserAvatar(userId, dataUrl);
    window.Toast.success('Avatar updated');
    window.loadTeamMembers();
    // Refresh user list in kanban if available
    if (typeof window.loadUsers === 'function') window.loadUsers();
  } catch (e) {
    window.Toast.error('Failed to update avatar: ' + e.message);
  }
}

function resizeImageToDataURL(file, maxSize) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > h) { h = maxSize * h / w; w = maxSize; }
        else { w = maxSize * w / h; h = maxSize; }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

window._userModalRoleDropdown = _userModalRoleDropdown;
window._userModalEditId = _userModalEditId;
window._initUserRoleDropdown = _initUserRoleDropdown;
window.openCreateUserModal = openCreateUserModal;
window.openCreateBotModal = openCreateBotModal;
window.openEditBotModal = openEditBotModal;
window.openEditUserModal = openEditUserModal;
window.closeCreateUserModal = closeCreateUserModal;
window.submitUserModal = submitUserModal;
window.deleteUserFromModal = deleteUserFromModal;
window.DEFAULT_AVATARS = DEFAULT_AVATARS;
window.openAvatarPicker = openAvatarPicker;
window.closeAvatarPicker = closeAvatarPicker;
window.uploadAvatarFile = uploadAvatarFile;
window.selectDefaultAvatar = selectDefaultAvatar;
window.removeAvatar = removeAvatar;
window.saveAvatar = saveAvatar;
window.resizeImageToDataURL = resizeImageToDataURL;
