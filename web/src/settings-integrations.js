// ── Discord Integration ──

let _discordConfig = null;

async function loadDiscordConfig() {
  if (!window._isAdmin()) {
    const section = document.getElementById('settings-integrations');
    if (section) {
      section.classList.add('settings-restricted');
      window._addRestrictionNotice(section, 'Only admins can manage integrations.');
    }
    return;
  }
  try {
    const cfg = await window.API.getDiscord();
    _discordConfig = cfg;
    _updateDiscordCardStatus(cfg);
  } catch (e) {
    // Not configured yet
  }
}

function _updateDiscordCardStatus(cfg) {
  const statusEl = document.getElementById('discord-card-status');
  if (!statusEl) return;
  if (cfg && cfg.enabled && cfg.channel_id) {
    statusEl.textContent = 'Connected';
    statusEl.className = 'integration-card-status connected';
  } else if (cfg && cfg.channel_id) {
    statusEl.textContent = 'Disabled';
    statusEl.className = 'integration-card-status disconnected';
  } else {
    statusEl.textContent = 'Not configured';
    statusEl.className = 'integration-card-status disconnected';
  }
}

async function openIntegrationModal(type) {
  if (type !== 'discord') return;
  const modal = document.getElementById('discord-modal');
  if (!modal) return;
  const cfg = _discordConfig || {};
  document.getElementById('discord-enabled').checked = !!cfg.enabled;
  document.getElementById('discord-bot-token').value = cfg.bot_token || '';
  document.getElementById('discord-guild-id').value = cfg.guild_id || '';
  document.getElementById('discord-channel-id').value = cfg.channel_id || '';
  // Notification preferences
  const notify = cfg.notify || {};
  document.getElementById('discord-notify-assigned').checked = notify.assigned !== false;
  document.getElementById('discord-notify-done').checked = notify.done !== false;
  document.getElementById('discord-notify-comment').checked = notify.comment !== false;
  document.getElementById('discord-notify-created').checked = !!notify.created;
  document.getElementById('discord-notify-priority').checked = notify.priority !== false;
  _updateDiscordStatus('');
  modal.classList.add('active');
}

function closeIntegrationModal() {
  document.getElementById('discord-modal').classList.remove('active');
}

async function saveDiscordConfig() {
  const btn = document.getElementById('discord-save-btn');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  try {
    const data = {
      enabled: document.getElementById('discord-enabled').checked,
      bot_token: document.getElementById('discord-bot-token').value.trim(),
      guild_id: document.getElementById('discord-guild-id').value.trim(),
      channel_id: document.getElementById('discord-channel-id').value.trim(),
      notify: {
        assigned: document.getElementById('discord-notify-assigned').checked,
        done: document.getElementById('discord-notify-done').checked,
        comment: document.getElementById('discord-notify-comment').checked,
        created: document.getElementById('discord-notify-created').checked,
        priority: document.getElementById('discord-notify-priority').checked,
      },
    };
    // Don't send masked token back
    if (data.bot_token.includes('\u2022\u2022')) {
      delete data.bot_token;
    }
    const result = await window.API.putDiscord(data);
    _discordConfig = { ...(_discordConfig || {}), ...data, ...result };
    _updateDiscordCardStatus(_discordConfig);
    window.Toast.success('Discord settings saved');
    closeIntegrationModal();
  } catch (e) {
    window.Toast.error(e.message || 'Failed to save Discord settings');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save';
  }
}

async function testDiscordMessage() {
  const btn = document.getElementById('discord-test-btn');
  btn.disabled = true;
  btn.textContent = 'Sending...';
  _updateDiscordStatus('');
  try {
    const res = await window.API.testDiscord();
    window.Toast.success(res.status || 'Test message sent!');
    _updateDiscordStatus('Message sent!', 'success');
  } catch (e) {
    window.Toast.error(e.message || 'Failed to send test message');
    _updateDiscordStatus(e.message || 'Failed', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send Test Message';
  }
}

function _updateDiscordStatus(text, type) {
  const el = document.getElementById('discord-status');
  if (!el) return;
  el.textContent = text;
  el.className = 'integration-status';
  if (type) el.classList.add('integration-status-' + type);
}

window.loadDiscordConfig = loadDiscordConfig;
window.saveDiscordConfig = saveDiscordConfig;
window.testDiscordMessage = testDiscordMessage;
window.openIntegrationModal = openIntegrationModal;
window.closeIntegrationModal = closeIntegrationModal;
