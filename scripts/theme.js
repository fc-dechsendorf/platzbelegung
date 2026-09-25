(function () {
  const key = 'fcd-color-theme';
  const root = document.documentElement;
  const system = window.matchMedia?.('(prefers-color-scheme: dark)');
  let preference = null;
  try {
    const stored = localStorage.getItem(key);
    if (stored === 'light' || stored === 'dark') preference = stored;
  } catch { /* Private browsing may prevent storage. */ }

  const current = () => preference || (system?.matches ? 'dark' : 'light');
  function updateButton() {
    const button = document.querySelector('[data-theme-toggle]');
    if (!button) return;
    const dark = current() === 'dark';
    const label = dark ? '☀️ Hell' : '🌙 Dunkel';
    const accessibleLabel = dark ? 'Helles Layout einschalten' : 'Dunkles Layout einschalten';
    if (button.textContent !== label) button.textContent = label;
    if (button.getAttribute('aria-label') !== accessibleLabel) button.setAttribute('aria-label', accessibleLabel);
    if (button.getAttribute('aria-pressed') !== String(dark)) button.setAttribute('aria-pressed', String(dark));
  }
  function apply() {
    root.dataset.theme = current();
    updateButton();
  }
  document.addEventListener('click', (event) => {
    if (!event.target.closest?.('[data-theme-toggle]')) return;
    preference = current() === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(key, preference); } catch { /* Choice still works this session. */ }
    apply();
  });
  system?.addEventListener?.('change', () => { if (!preference) apply(); });
  const app = document.getElementById('app');
  if (app) new MutationObserver(updateButton).observe(app, { childList: true });
  apply();
})();
