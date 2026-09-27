(function () {
  const button = document.getElementById('activate');
  const message = document.getElementById('activation-message');
  const params = new URLSearchParams(window.location.hash.slice(1));
  const type = params.get('type');
  const token = params.get('token_hash');
  const target = params.get('target');
  if (!['invite', 'recovery'].includes(type) || !token || !['board', 'calendar'].includes(target)) {
    button.hidden = true;
    message.textContent = 'Dieser Link ist unvollständig. Bitte beim Administrator einen neuen Einmallink anfordern.';
    return;
  }
  button.addEventListener('click', async () => {
    button.disabled = true;
    message.textContent = 'Zugang wird geprüft …';
    try {
      const { error } = await window.Cloud.client.auth.verifyOtp({ token_hash: token, type });
      if (error) throw error;
      window.history.replaceState(null, '', window.location.pathname);
      window.location.replace(target === 'board' ? 'statistik.html' : 'index.html');
    } catch {
      button.hidden = true;
      message.textContent = 'Dieser Einmallink ist ungültig oder abgelaufen. Bitte beim Administrator einen neuen Link anfordern.';
    }
  });
})();
