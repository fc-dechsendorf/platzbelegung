(function () {
  const app = document.getElementById('app');
  const client = window.Cloud.client;
  const startYear = 2026;
  let role = '';
  let rows = [];
  let latestDay = null;
  let openYear = new Date().getFullYear();
  let errorText = '';
  let boardMembers = [];
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const boardRole = (user) => ['admin', 'board'].includes(user?.app_metadata?.fcd_role)
    ? user.app_metadata.fcd_role : '';
  const season = (year) => `${year}/${String((year + 1) % 100).padStart(2, '0')}`;
  const kinds = [
    ['training', 'Training'], ['league', 'Liga'], ['cup', 'Pokal'],
    ['friendly', 'Freundschaft'], ['other', 'Weitere']
  ];
  const organizations = [
    ['fcd', 'FC Dechsendorf'], ['atletico', 'Atletico Erlangen'], ['other', 'Sonstige']
  ];
  const emptyCounts = () => ({ ...Object.fromEntries(kinds.map(([kind]) => [kind, 0])), minutes: 0 });
  const duration = (minutes) => `${Math.floor(minutes / 60)} Std. ${String(minutes % 60).padStart(2, '0')} Min.`;
  const germanDate = (date) => date ? new Intl.DateTimeFormat('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  }).format(new Date(`${date}T12:00:00`)) : 'noch kein Tag erfasst';

  function totals(items) {
    const byTeam = new Map();
    for (const item of items) {
      const team = String(item.team || 'Unbekannte Mannschaft');
      const count = Number(item.event_count) || 0;
      if (!byTeam.has(team)) byTeam.set(team, emptyCounts());
      byTeam.get(team)[item.kind] = (byTeam.get(team)[item.kind] || 0) + count;
      byTeam.get(team).minutes += Number(item.minutes) || 0;
    }
    return [...byTeam].sort((a, b) => a[0].localeCompare(b[0], 'de'));
  }
  const totalFor = (counts) => kinds.reduce((sum, [kind]) => sum + (counts[kind] || 0), 0);
  function table(items) {
    const entries = totals(items);
    if (!entries.length) return '<p class="stats-empty">Für diesen Zeitraum liegen keine erfassten Belegungen vor.</p>';
    const sum = emptyCounts();
    entries.forEach(([, counts]) => { kinds.forEach(([kind]) => { sum[kind] += counts[kind] || 0; }); sum.minutes += counts.minutes; });
    return `<div class="stats-table-wrap"><table class="stats-table"><thead><tr><th scope="col">Mannschaft / Veranstaltung</th>${kinds.map(([, label]) => `<th scope="col">${label}</th>`).join('')}<th scope="col">Gesamt</th><th scope="col">Belegungszeit</th></tr></thead><tbody>${entries.map(([team, counts]) => `<tr><th scope="row">${esc(team)}</th>${kinds.map(([kind]) => `<td>${counts[kind] || 0}</td>`).join('')}<td><strong>${totalFor(counts)}</strong></td><td>${duration(counts.minutes)}</td></tr>`).join('')}</tbody><tfoot><tr><th scope="row">Insgesamt</th>${kinds.map(([kind]) => `<td>${sum[kind]}</td>`).join('')}<td><strong>${totalFor(sum)}</strong></td><td><strong>${duration(sum.minutes)}</strong></td></tr></tfoot></table></div>`;
  }
  function statisticsMarkup() {
    const now = new Date();
    const maxYear = Math.max(startYear, now.getFullYear(), ...rows.map((row) => Number(row.calendar_year)));
    const years = Array.from({ length: maxYear - startYear + 1 }, (_, index) => maxYear - index);
    const currentSeason = now.getFullYear() - (now.getMonth() < 6 ? 1 : 0);
    return `<section class="stats-intro"><h2>Geplante Platzbelegungen</h2><p>FC Dechsendorf, Atletico Erlangen und Sonstige sind getrennt ausgewiesen. Jede Trainingseinheit und jedes Heimspiel zählt einmal; die Belegungszeit zeigt die Dauer, nicht eine automatisch berechnete Gebühr. Erfassung ab 1. Oktober 2026; keine Aussage über die tatsächliche Durchführung.</p><p class="stats-status">Letzter abgeschlossener Erfassungstag: ${esc(germanDate(latestDay))}</p></section><section class="stats-years" aria-label="Kalenderjahre">${years.map((year) => `<div class="stats-year"><button type="button" data-year="${year}" aria-expanded="${openYear === year}"><span>Kalenderjahr ${year}</span><span>${openYear === year ? '−' : '+'}</span></button>${openYear === year ? `<div class="stats-year-body">${year === 2026 ? '<p class="stats-note">2026 ist nur ab Oktober erfasst.</p>' : ''}${organizations.map(([organization, label]) => `<section class="stats-organization"><h3>${label}</h3>${table(rows.filter((row) => Number(row.calendar_year) === year && row.organization === organization))}</section>`).join('')}</div>` : ''}</div>`).join('')}</section><section class="stats-seasons"><h2>Saisonvergleich</h2><p>Die drei jüngsten Spielzeiten, ebenfalls nach Zugehörigkeit getrennt. Frühere Saisons ohne Archivdaten werden nicht als Null-Belegung gewertet.</p><div class="stats-table-wrap"><table class="stats-table"><thead><tr><th scope="col">Saison</th><th scope="col">Bereich</th><th scope="col">Erfassung</th><th scope="col">Training</th><th scope="col">Liga</th><th scope="col">Pokal</th><th scope="col">Freundschaft</th><th scope="col">Weitere</th><th scope="col">Gesamt</th><th scope="col">Belegungszeit</th></tr></thead><tbody>${[currentSeason, currentSeason - 1, currentSeason - 2].flatMap((year) => organizations.map(([organization, label]) => {
      const items = rows.filter((row) => Number(row.season_start) === year && row.organization === organization);
      const counts = totals(items).reduce((all, [, values]) => {
        kinds.forEach(([kind]) => { all[kind] += values[kind] || 0; }); all.minutes += values.minutes; return all;
      }, emptyCounts());
      const coverage = year < 2026 ? 'Nicht erfasst' : year === 2026 ? 'Ab Oktober 2026' : 'Fortlaufend';
      return `<tr><th scope="row">${season(year)}</th><td>${label}</td><td>${coverage}</td>${kinds.map(([kind]) => `<td>${year < 2026 ? '–' : counts[kind]}</td>`).join('')}<td><strong>${year < 2026 ? '–' : totalFor(counts)}</strong></td><td>${year < 2026 ? '–' : duration(counts.minutes)}</td></tr>`;
    })).join('')}</tbody></table></div></section>${role === 'admin' ? `<section class="stats-board-admin"><h2>Vorstandszugänge</h2><p>Einmallinks nur persönlich an die jeweilige Person weitergeben. Ein Vorstandsaccount darf die Statistik lesen, aber keine Termine bearbeiten.</p><form data-invite-board><label>E-Mail-Adresse<input name="email" type="email" required></label><button class="primary">Einmallink erzeugen</button></form><div data-board-invite-output></div><p data-board-members>Vorhandene Zugänge: ${boardMembers.length ? boardMembers.map((member) => esc(member.email)).join(', ') : 'noch keine'}</p></section>` : ''}`;
  }
  function render() {
    app.innerHTML = `<div class="wrap stats-wrap"><header class="app-header"><div class="brand-lockup"><img class="club-logo" src="assets/fc-dechsendorf-logo.png" alt="Wappen des FC Dechsendorf"><div><span class="eyebrow">FC Dechsendorf</span><h1>Vorstand</h1><p>Platzbelegungsplan · geschützter Bereich</p></div></div></header><div class="management-actions"><a class="stats-back" href="index.html">← Platzbelegungsplan</a><button type="button" class="theme-toggle" data-theme-toggle aria-label="Darstellung wechseln" aria-pressed="false">🌙 Dunkel</button>${role ? `<span>Angemeldet: ${role === 'admin' ? 'Administrator' : 'Vorstand'} <button type="button" data-logout>Abmelden</button></span>` : ''}</div>${errorText ? `<p class="stats-error" role="alert">${esc(errorText)}</p>` : ''}${role ? statisticsMarkup() : `<section class="stats-login"><h2>Anmeldung für Vorstand und Administrator</h2><p>Die Auswertung ist erst nach Anmeldung sichtbar.</p>${window.Cloud.needsPasswordSetup ? `<form data-set-password><label>Neues Passwort<input name="password" type="password" minlength="12" autocomplete="new-password" required></label><label>Wiederholung<input name="confirm" type="password" minlength="12" autocomplete="new-password" required></label><button class="primary">Zugang aktivieren</button></form>` : `<form data-login><label>E-Mail-Adresse<input name="email" type="email" autocomplete="username" required></label><label>Passwort<input name="password" type="password" autocomplete="current-password" required></label><button class="primary">Anmelden</button></form>`}</section>`}</div>`;
    app.querySelectorAll('[data-year]').forEach((button) => button.addEventListener('click', () => {
      const year = Number(button.dataset.year);
      openYear = openYear === year ? null : year;
      render();
    }));
    app.querySelector('[data-login]')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const result = await client.auth.signInWithPassword({
        email: String(form.get('email')), password: String(form.get('password'))
      });
      if (result.error) { errorText = 'Anmeldung fehlgeschlagen.'; render(); return; }
      await refresh();
    });
    app.querySelector('[data-set-password]')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      if (form.get('password') !== form.get('confirm')) {
        errorText = 'Die Passwörter stimmen nicht überein.'; render(); return;
      }
      try { await window.Cloud.updatePassword(String(form.get('password'))); await refresh(); }
      catch { errorText = 'Das Passwort konnte nicht gespeichert werden.'; render(); }
    });
    app.querySelector('[data-logout]')?.addEventListener('click', async () => {
      await client.auth.signOut(); role = ''; rows = []; latestDay = null; render();
    });
    app.querySelector('[data-invite-board]')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const email = String(new FormData(event.currentTarget).get('email')).trim();
      const output = app.querySelector('[data-board-invite-output]');
      output.textContent = 'Einladung wird vorbereitet …';
      const { data, error } = await client.functions.invoke('manage-users', {
        body: { action: 'invite', email, role: 'board' }
      });
      if (error || data?.error || !data?.actionLink) {
        output.textContent = 'Die Einladung konnte nicht erzeugt werden.';
        return;
      }
      output.replaceChildren();
      const hint = document.createElement('p');
      hint.textContent = `Einmallink für ${email}: Bitte vertraulich weitergeben.`;
      const link = document.createElement('input');
      link.type = 'text'; link.readOnly = true;
      link.value = data.actionLink;
      link.setAttribute('aria-label', `Einmallink für ${email}`);
      output.append(hint, link);
      boardMembers = await listBoardMembers();
      app.querySelector('[data-board-members]').textContent =
        `Vorhandene Zugänge: ${boardMembers.length ? boardMembers.map((member) => member.email).join(', ') : 'noch keine'}`;
    });
  }
  async function listBoardMembers() {
    const { data, error } = await client.functions.invoke('manage-users', {
      body: { action: 'list' }
    });
    return error || data?.error ? [] : data?.boardMembers || [];
  }
  async function refresh() {
    errorText = '';
    if (window.Cloud.needsPasswordSetup) { role = ''; rows = []; render(); return; }
    const user = await client.auth.getUser();
    role = user.error ? '' : boardRole(user.data.user);
    if (!role) {
      rows = []; latestDay = null;
      if (!user.error && user.data.user) errorText = 'Für dieses Konto ist keine Vorstands- oder Administratorrolle eingerichtet.';
      render(); return;
    }
    const [summary, coverage] = await Promise.all([
      client.rpc('board_statistics'),
      client.from('stat_capture_days').select('capture_date').order('capture_date', { ascending: false }).limit(1)
    ]);
    if (summary.error || coverage.error) {
      role = ''; rows = []; latestDay = null;
      errorText = 'Die Statistik konnte nicht geladen werden. Bitte später erneut versuchen.';
    } else {
      rows = summary.data || [];
      latestDay = coverage.data?.[0]?.capture_date || null;
      if (role === 'admin') boardMembers = await listBoardMembers();
    }
    render();
  }
  render();
  refresh();
})();
