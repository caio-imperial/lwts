// ── Confirm Modal (replaces browser confirm()) ──

let _fnConfirmResolve = null;

function fnConfirm(message, title, okLabel) {
  return new Promise(resolve => {
    _fnConfirmResolve = resolve;
    document.getElementById('confirm-modal-title').textContent = title || 'Confirm';
    document.getElementById('confirm-modal-message').textContent = message;
    const okBtn = document.getElementById('confirm-modal-ok');
    okBtn.textContent = okLabel || 'Confirm';
    // Danger styling if title contains danger words
    if (/delete|remove|revoke|clear|reset/i.test(title || message)) {
      okBtn.style.background = 'rgba(248,113,113,0.15)';
      okBtn.style.borderColor = 'rgba(248,113,113,0.4)';
      okBtn.style.color = 'rgba(248,113,113,0.95)';
    } else {
      okBtn.style.background = '';
      okBtn.style.borderColor = '';
      okBtn.style.color = '';
    }
    document.getElementById('confirm-modal').classList.add('active');
  });
}

function fnConfirmResolve(result) {
  document.getElementById('confirm-modal').classList.remove('active');
  if (_fnConfirmResolve) {
    _fnConfirmResolve(result);
    _fnConfirmResolve = null;
  }
}

window.fnConfirm = fnConfirm;
window.fnConfirmResolve = fnConfirmResolve;
window._fnConfirmResolve = _fnConfirmResolve;
