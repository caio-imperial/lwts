function initBrowserNotificationBindings() {
  const toggle = document.getElementById('browser-notif-toggle');
  const status = document.getElementById('browser-notif-status');
  const testBtn = document.getElementById('browser-notif-test');
  if (!toggle) return;
  const N = window.Notifier;

  const refresh = () => {
    if (!N || !N.isSupported()) {
      toggle.checked = false;
      toggle.disabled = true;
      if (status) status.textContent = 'Not supported in this browser.';
      if (testBtn) testBtn.style.display = 'none';
      return;
    }
    const perm = N.currentPermission();
    const enabled = N.isMasterEnabled();
    toggle.disabled = false;
    toggle.checked = enabled && perm === 'granted';
    if (status) {
      if (perm === 'denied') {
        status.textContent = 'Permission denied — enable it in your browser site settings.';
      } else if (perm === 'default') {
        status.textContent = 'Permission not yet granted.';
      } else if (perm === 'granted' && enabled) {
        status.textContent = 'Active.';
      } else if (perm === 'granted') {
        status.textContent = 'Ready — flip the toggle to turn on.';
      } else {
        status.textContent = '';
      }
    }
    if (testBtn) testBtn.style.display = (perm === 'granted' && enabled) ? '' : 'none';
  };

  toggle.onchange = async () => {
    if (!N || !N.isSupported()) { toggle.checked = false; return; }
    if (toggle.checked) {
      const perm = await N.requestPermission();
      if (perm !== 'granted') {
        toggle.checked = false;
        N.setMasterEnabled(false);
        if (window.Toast) window.Toast.error('Notification permission ' + perm);
      } else {
        N.setMasterEnabled(true);
        // Immediate feedback ping so the user sees it working.
        try { N.testNotification(); } catch {}
      }
    } else {
      N.setMasterEnabled(false);
    }
    refresh();
  };

  refresh();
}

function testBrowserNotification() {
  if (window.Notifier) window.Notifier.testNotification();
}

window.testBrowserNotification = testBrowserNotification;
window.initBrowserNotificationBindings = initBrowserNotificationBindings;
