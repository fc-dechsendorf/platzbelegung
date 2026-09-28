(function () {
  const app = document.getElementById('app');
  const days = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
  const organizations = { fcd: 'FC Dechsendorf', atletico: 'Atletico Erlangen', other: 'Sonstige' };
  let role = '';
  let rows = [];
  let selectedId = null;
  let errorText = '';
  let notice = '';
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const shortTime = (value) => String(value || '').slice(0, 5);
  const current = () => rows.find((row) => row.id === selectedId);
  const range = (row) => row.valid_from || row.valid_until
    ? `${row.valid_from || 'offen'} – ${row.valid_until || 'offen'}` : 'fortlaufend';
  const formValue = (row, key, fallback = '') => esc(row?.[key] ?? fallback);

  function editor() {
    const row = current();
    return `<section class="training-editor"><h2>${row ? 'Standardtraining bearbeiten' : 'Neues Standardtraining'}</h2>
      <p class="training-note">Eintrag und Zeitraum gelten für alle passenden Wochen. Für einen Saisonwechsel den bisherigen Zeitraum begrenzen und einen neuen Eintrag anlegen. Bereits einzeln bearbeitete Termine behalten ihre Kennung.</p>
      <form class="training-form" data-training-form>
        <label>Mannschaft / Gruppe<input name="team" maxlength="160" required value="${formValue(row, 'team')}"></label>
        <label>Verein / Zuordnung<select name="organization">${Object.entries(organizations).map(([key, label]) => `<option value="${key}" ${row?.organization === key || (!row && key === 'fcd') ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
        <label>Wochentag<select name="weekday">${days.map((day, index) => `<option value="${index + 1}" ${Number(row?.weekday || 1) === index + 1 ? 'selected' : ''}>${day}</option>`).join('')}</select></label>
        <label>Beginn<input name="starts_at" type="time" step="900" required value="${shortTime(row?.starts_at || '17:30')}"></label>
        <label>Ende<input name="ends_at" type="time" step="900" required value="${shortTime(row?.ends_at || '19:00')}"></label>
        <label>Platz<select name="place">${['A', 'B', 'C'].map((place) => `<option value="${place}" ${row?.place === place || (!row && place === 'A') ? 'selected' : ''}>${place}-Platz</option>`).join('')}</select></label>
        <label>Platzbedarf<select name="capacity"><option value="1/1" ${row?.capacity === '1/1' ? 'selected' : ''}>1/1 Platz</option><option value="1/2" ${row?.capacity === '1/2' || !row ? 'selected' : ''}>1/2 Platz</option><option value="vorplatz" ${row?.capacity === 'vorplatz' ? 'selected' : ''}>Vorplatz (nur A)</option></select></label>
        <label>Gültig ab (optional)<input name="valid_from" type="date" value="${formValue(row, 'valid_from')}"></label>
        <label>Gültig bis (optional)<input name="valid_until" type="date" value="${formValue(row, 'valid_until')}"></label>
        <div class="training-actions"><button class="primary" type="submit">${row ? 'Änderungen speichern' : 'Training anlegen'}</button>${row ? '<button type="button" data-cancel-edit>Abbrechen</button>' : ''}</div>
      </form></section>`;
  }
  function list() {
    const sorted = [...rows].sort((a, b) => Number(b.active) - Number(a.active) ||
      a.weekday - b.weekday || shortTime(a.starts_at).localeCompare(shortTime(b.starts_at)) ||
      a.team.localeCompare(b.team, 'de'));
    return `<section class="training-list"><div class="training-list-head"><h2>Gespeicherter Standardplan</h2><span>${rows.filter((row) => row.active).length} aktiv · ${rows.length} insgesamt</span></div>
      <div class="training-table-wrap"><table class="training-table"><thead><tr><th>Tag</th><th>Mannschaft</th><th>Zeit</th><th>Platz</th><th>Bedarf</th><th>Gültigkeit</th><th>Status</th><th>Aktionen</th></tr></thead><tbody>
      ${sorted.map((row) => `<tr class="${row.active ? '' : 'inactive'}"><td>${days[row.weekday - 1] || '?'}</td><td><b>${esc(row.team)}</b><br><small>${esc(organizations[row.organization] || 'Sonstige')}</small></td><td>${shortTime(row.starts_at)}–${shortTime(row.ends_at)}</td><td>${esc(row.place)}</td><td>${esc(row.capacity)}</td><td>${esc(range(row))}</td><td><span class="training-pill ${row.active ? '' : 'inactive'}">${row.active ? 'Aktiv' : 'Pausiert'}</span></td><td><button type="button" data-edit="${esc(row.id)}">Bearbeiten</button><button type="button" data-active="${esc(row.id)}">${row.active ? 'Pausieren' : 'Aktivieren'}</button></td></tr>`).join('')}
      </tbody></table></div></section>`;
  }
  function render() {
    app.innerHTML = `<div class="wrap training-wrap"><header class="app-header"><div class="brand-lockup"><img class="club-logo" src="assets/fc-dechsendorf-logo.png" alt="Wappen des FC Dechsendorf"><div><span class="eyebrow">FC Dechsendorf</span><h1>Standardtrainingsplan</h1><p>Platzbelegungsplan · Verwaltung</p></div></div></header>
      <nav class="training-top"><a class="management-link" href="index.html">← Platzbelegung</a><button type="button" class="theme-toggle" data-theme-toggle>🌙 Dunkel</button>${role === 'admin' ? '<button type="button" data-logout>Abmelden</button>' : ''}</nav>
      ${errorText ? `<p class="training-message error" role="alert">${esc(errorText)}</p>` : ''}${notice ? `<p class="training-message" role="status">${esc(notice)}</p>` : ''}
      ${role === 'admin' ? `<section class="training-intro"><h2>Trainingsregeln</h2><p>Änderungen erscheinen beim nächsten Laden der öffentlichen Platzbelegung. Es werden keine einzelnen Spiel- oder Trainingsanträge gelöscht.</p></section>${editor()}${list()}` :
        `<section class="training-login"><h2>Administratorzugang</h2>${window.Cloud.needsPasswordSetup ? '<p>Bitte zuerst auf der Platzbelegungsseite dein Passwort festlegen.</p><a href="index.html">Zur Platzbelegung</a>' : `<p>Dieser Bereich ist nur für Administratoren zugänglich.</p><form data-login><label>E-Mail-Adresse<input name="email" type="email" autocomplete="username" required></label><label>Passwort<input name="password" type="password" autocomplete="current-password" required></label><button class="primary" type="submit">Anmelden</button></form>`}</section>`}</div>`;
    app.querySelector('[data-login]')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      try {
        await window.Cloud.login(String(data.get('email')), String(data.get('password')));
        role = window.Cloud.role();
        if (role !== 'admin') throw new Error('Nur Administratoren dürfen den Standardplan bearbeiten.');
        errorText = ''; await loadRows();
      } catch (error) { errorText = error.message; render(); }
    });
    app.querySelector('[data-logout]')?.addEventListener('click', async () => {
      await window.Cloud.logout(); role = ''; rows = []; selectedId = null; render();
    });
    app.querySelector('[data-training-form]')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const item = Object.fromEntries(form.entries());
      item.id = selectedId;
      item.active = current()?.active ?? true;
      try {
        await window.Cloud.saveTrainingRule(item);
        selectedId = null; errorText = ''; notice = 'Standardtraining gespeichert.';
        await loadRows();
      } catch (error) { errorText = `Speichern fehlgeschlagen: ${error.message}`; notice = ''; render(); }
    });
    app.querySelector('[data-cancel-edit]')?.addEventListener('click', () => {
      selectedId = null; errorText = ''; render();
    });
    app.querySelectorAll('[data-edit]').forEach((button) => button.addEventListener('click', () => {
      selectedId = button.dataset.edit; errorText = ''; notice = ''; render();
      app.querySelector('[data-training-form]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    app.querySelectorAll('[data-active]').forEach((button) => button.addEventListener('click', async () => {
      const row = rows.find((item) => item.id === button.dataset.active);
      if (!row || (row.active && !confirm(`„${row.team}“ pausieren? Künftige Standardtermine werden dann ausgeblendet.`))) return;
      try {
        await window.Cloud.setTrainingRuleActive(row.id, !row.active);
        errorText = ''; notice = row.active ? 'Training pausiert.' : 'Training aktiviert.';
        await loadRows();
      } catch (error) { errorText = error.message; notice = ''; render(); }
    }));
  }
  async function loadRows() {
    rows = await window.Cloud.listTrainingRules();
    render();
  }
  render();
  window.Cloud.initializeAuth().then(async () => {
    role = window.Cloud.role();
    if (role === 'admin') await loadRows();
    else { if (role === 'manager') errorText = 'Nur Administratoren dürfen den Standardplan bearbeiten.'; render(); }
  }).catch(() => { errorText = 'Die Anmeldung konnte nicht geprüft werden. Bitte die Seite neu laden.'; render(); });
})();
