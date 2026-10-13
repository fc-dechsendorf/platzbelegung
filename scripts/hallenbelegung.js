(function () {
  'use strict';

  const HALLS = ['Dechsendorfer Halle', 'ASG Halle 1+2'];
  const DAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
  const SAMPLE = [
    { id: 'demo-1', day: 3, hall: 0, start: 1020, end: 1140, text: 'G-Jugend' },
    { id: 'demo-2', day: 3, hall: 0, start: 1200, end: 1290, text: 'AH' },
    { id: 'demo-3', day: 5, hall: 0, start: 540, end: 630, text: 'D-Jugend' },
    { id: 'demo-4', day: 5, hall: 0, start: 630, end: 720, text: 'F-Jugend' },
    { id: 'demo-5', day: 5, hall: 0, start: 720, end: 810, text: 'A-Jugend' },
    { id: 'demo-6', day: 5, hall: 0, start: 810, end: 900, text: 'Bambini' },
    { id: 'demo-7', day: 5, hall: 1, start: 900, end: 1020, text: 'Jugend' },
    { id: 'demo-8', day: 5, hall: 1, start: 1020, end: 1140, text: 'AH' }
  ];
  const WINDOWS = {
    3: [[1020, 1290, [1020, 1140, 1200, 1290]]],
    5: [[540, 1260, [540, 630, 720, 810, 900, 1020, 1140, 1260]]],
    6: [[540, 720, [540, 630, 720]], [900, 1020, [900, 1020]]]
  };

  function time(minutes) {
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function normalize(entry) {
    const item = {
      id: String(entry.id || '').trim(), day: Number(entry.day), hall: Number(entry.hall),
      start: Number(entry.start), end: Number(entry.end), text: String(entry.text || '').trim()
    };
    if (!item.id || !Number.isInteger(item.day) || item.day < 0 || item.day > 6 ||
        !Number.isInteger(item.hall) || item.hall < 0 || item.hall >= HALLS.length ||
        !Number.isInteger(item.start) || !Number.isInteger(item.end) ||
        item.start < 0 || item.end > 1440 || item.start >= item.end ||
        item.start % 30 || item.end % 30 || !item.text || item.text.length > 80) {
      throw new Error('Bitte Halle, Wochentag, halbstündige Zeiten und einen Text (maximal 80 Zeichen) prüfen.');
    }
    return item;
  }

  function upsert(list, entry) {
    const item = normalize(entry);
    if (list.some((other) => other.id !== item.id && other.day === item.day &&
        other.hall === item.hall && item.start < other.end && other.start < item.end)) {
      throw new Error('Diese Halle ist in diesem Zeitraum bereits belegt.');
    }
    return [...list.filter((other) => other.id !== item.id), item]
      .sort((a, b) => a.day - b.day || a.start - b.start || a.hall - b.hall);
  }

  function rowsForDay(day, list) {
    const original = [
      ...(WINDOWS[day] || []).map(([start, end, points]) => ({ start, end, points })),
      ...list.filter((entry) => entry.day === day)
        .map((item) => ({ start: item.start, end: item.end, points: [item.start, item.end] }))
    ].sort((a, b) => a.start - b.start || a.end - b.end);
    const windows = [];
    for (const window of original) {
      const previous = windows.at(-1);
      if (previous && window.start <= previous.end) {
        previous.end = Math.max(previous.end, window.end);
        previous.points.push(...window.points);
      } else windows.push({ start: window.start, end: window.end, points: [...window.points] });
    }
    const rows = [];
    for (const window of windows) {
      const points = new Set(window.points);
      for (const item of list.filter((entry) => entry.day === day &&
          entry.start < window.end && entry.end > window.start)) {
        points.add(Math.max(window.start, item.start));
        points.add(Math.min(window.end, item.end));
      }
      const sorted = [...points].filter((point) => point >= window.start && point <= window.end)
        .sort((a, b) => a - b);
      for (let index = 0; index < sorted.length - 1; index++) {
        const start = sorted[index];
        const end = sorted[index + 1];
        if (start >= end || rows.some((row) => row.start === start && row.end === end)) continue;
        rows.push({ day, start, end, entries: HALLS.map((_, hall) =>
          list.find((item) => item.day === day && item.hall === hall &&
            item.start <= start && item.end >= end) || null) });
      }
    }
    return rows.sort((a, b) => a.start - b.start || a.end - b.end);
  }

  function spanAt(rows, index, hall) {
    const item = rows[index]?.entries[hall];
    if (!item) return 1;
    let span = 1;
    while (rows[index + span]?.day === rows[index].day &&
        rows[index + span]?.entries[hall]?.id === item.id &&
        rows[index + span - 1].end === rows[index + span].start) span++;
    return span;
  }

  const api = { HALLS, DAYS, SAMPLE, time, escapeHtml, normalize, upsert, rowsForDay, spanAt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;

  const app = document.getElementById('app');
  if (!app) return;
  let mode = 'public';
  let role = '';
  let authChecking = true;
  let authMessage = '';
  let loginOpen = false;
  let selectedDay = 3;
  let selected = null;
  let notice = '';
  let bookings = [];
  let dataLoading = true;
  let dataError = '';
  let publicVisible = false;

  async function loadBookings() {
    const settings = await window.Cloud.client.from('hall_settings').select('public_visible').eq('id', 1).single();
    if (settings.error) throw settings.error;
    publicVisible = settings.data.public_visible;
    const { data, error } = await window.Cloud.client.from('hall_bookings')
      .select('id,weekday,hall,start_minute,end_minute,label,updated_at')
      .order('weekday').order('start_minute');
    if (error) throw error;
    let loaded = [];
    for (const row of data) {
      const item = normalize({ id: row.id, day: row.weekday - 1, hall: row.hall,
        start: row.start_minute, end: row.end_minute, text: row.label });
      loaded = upsert(loaded, item);
    }
    bookings = loaded.map((item) => ({ ...item,
      updated_at: data.find((row) => row.id === item.id).updated_at }));
    dataLoading = false;
    dataError = '';
    render();
  }

  function payload(item) {
    return { weekday: item.day + 1, hall: item.hall, start_minute: item.start,
      end_minute: item.end, label: item.text };
  }

  function publicMarkup() {
    const days = [...new Set([3, 5, 6, ...bookings.map((item) => item.day)])].sort();
    const allRows = days.flatMap((day) => {
      const rows = rowsForDay(day, bookings);
      return rows.length ? rows : [{ day, start: null, end: null, entries: [null, null] }];
    });
    if (dataLoading) return '<section class="hall-panel" aria-live="polite">Hallenbelegung wird geladen …</section>';
    if (dataError) return `<section class="hall-panel hall-auth-message" role="alert">Die Hallenbelegung ist gerade nicht abrufbar: ${escapeHtml(dataError)}</section>`;
    if (!publicVisible && role !== 'admin') return '<section class="hall-panel"><h2>Hallenbelegung</h2><p>Der Standardplan ist derzeit nicht öffentlich freigeschaltet.</p></section>';
    if (!publicVisible && mode !== 'editor') return '<section class="hall-panel"><h2>Hallenbelegung</h2><p>Der Standardplan ist derzeit nicht öffentlich freigeschaltet. Im Admin-Bereich kannst du ihn wieder einblenden.</p></section>';
    if (!bookings.length) return '<section class="hall-panel"><h2>Standard-Hallenbelegungsplan</h2><p>Noch keine Hallentermine eingetragen.</p></section>';
    return `<section class="hall-panel" aria-labelledby="public-title">
      <div class="hall-section-heading"><div><span class="eyebrow">Öffentliche Ansicht</span><h2 id="public-title">Standard-Hallenbelegungsplan</h2><p>Wiederkehrende Standardwoche</p></div><span class="hall-count">${bookings.length} Belegungen</span></div>
      <div class="hall-table-wrap"><table class="hall-table"><thead><tr><th>Wochentag</th><th>Uhrzeit</th><th>${HALLS.map(escapeHtml).join('</th><th>')}</th></tr></thead><tbody>${allRows.map((row, index) => `<tr>${index === 0 || allRows[index - 1].day !== row.day ? `<th scope="rowgroup" rowspan="${allRows.filter((entry) => entry.day === row.day).length}">${DAYS[row.day]}</th>` : ''}<td class="hall-time">${row.start === null ? '—' : `${time(row.start)} – ${time(row.end)}`}</td>${row.entries.map((item, hall) => {
        if (item && index > 0 && allRows[index - 1].day === row.day &&
            allRows[index - 1].entries[hall]?.id === item.id && allRows[index - 1].end === row.start) return '';
        return `<td class="${item ? 'hall-filled' : 'hall-empty'}" ${item ? `rowspan="${spanAt(allRows, index, hall)}"` : ''}>${item ? escapeHtml(item.text) : '<span aria-label="frei">—</span>'}</td>`;
      }).join('')}</tr>`).join('')}</tbody></table></div>
      <div class="hall-mobile-list">${days.map((day) => {
        const items = bookings.filter((entry) => entry.day === day)
          .sort((a, b) => a.start - b.start || a.hall - b.hall);
        return `<section class="hall-mobile-day"><h3>${DAYS[day]}</h3>${items.length ? items.map((item) => `<div class="hall-mobile-row"><strong>${time(item.start)} – ${time(item.end)}</strong><div><small>${escapeHtml(HALLS[item.hall])}</small><span class="hall-mobile-filled">${escapeHtml(item.text)}</span></div></div>`).join('') : '<p>Keine Belegung eingetragen.</p>'}</section>`;
      }).join('')}</div>
    </section>`;
  }

  function editorMarkup() {
    if (mode !== 'editor' || role !== 'admin') return '';
    const slots = Array.from({ length: 48 }, (_, index) => index * 30);
    return `<section class="hall-panel hall-editor" aria-labelledby="editor-title"><div class="hall-section-heading"><div><span class="eyebrow">Administrator</span><h2 id="editor-title">Admin-Kalender · Standardwoche</h2><p>Ein Termin ist ein durchgehender Block. Das Halbstundenraster im Hintergrund hilft bei der Zeitwahl; gespeichert wird nur ein Eintrag pro Block.</p></div><button type="button" class="primary hall-new" data-new-hall>Neuer Hallentermin</button></div>
      <label class="hall-publish"><input type="checkbox" data-public-visible ${publicVisible ? 'checked' : ''}> Hallenbelegung für die Allgemeinheit anzeigen</label>
      <div class="hall-day-tabs" role="group" aria-label="Wochentag wählen">${DAYS.map((day, index) => `<button type="button" data-day="${index}" class="${index === selectedDay ? 'active' : ''}" aria-pressed="${index === selectedDay}">${day}</button>`).join('')}</div>
      <div class="hall-editor-scroll"><table class="hall-editor-grid"><thead><tr><th>Uhrzeit</th>${HALLS.map((hall) => `<th>${escapeHtml(hall)}</th>`).join('')}</tr></thead><tbody>${slots.map((start) => `<tr><th scope="row">${time(start)} – ${time(start + 30)}</th>${HALLS.map((hall, hallIndex) => {
        const item = bookings.find((entry) => entry.day === selectedDay && entry.hall === hallIndex && entry.start <= start && entry.end > start);
        if (item && item.start !== start) return '';
        if (item) return `<td rowspan="${(item.end - item.start) / 30}" class="hall-block-cell"><button type="button" data-edit="${escapeHtml(item.id)}" class="hall-block" style="--hall-span:${(item.end - item.start) / 30}" aria-label="${escapeHtml(`${item.text}, ${hall}, ${DAYS[selectedDay]}, ${time(item.start)} bis ${time(item.end)} bearbeiten`)}"><b>${escapeHtml(item.text)}</b><small>${time(item.start)} – ${time(item.end)} · Bearbeiten</small></button></td>`;
        return `<td><button type="button" data-slot="${start}" data-hall="${hallIndex}" class="hall-slot" aria-label="${escapeHtml(`${DAYS[selectedDay]}, ${hall}, ${time(start)}: frei, Belegung eintragen`)}"><span>＋</span></button></td>`;
      }).join('')}</tr>`).join('')}</tbody></table></div>
    </section>`;
  }

  function options(selectedValue, values, label) {
    return values.map(([value, title]) => `<option value="${value}" ${value === selectedValue ? 'selected' : ''}>${escapeHtml(title || label(value))}</option>`).join('');
  }

  function formMarkup() {
    if (!selected || role !== 'admin') return '';
    const dayOptions = DAYS.map((day, index) => [index, day]);
    const hallOptions = HALLS.map((hall, index) => [index, hall]);
    const times = Array.from({ length: 49 }, (_, index) => [index * 30, time(index * 30)]);
    return `<dialog class="hall-dialog" id="hall-dialog" aria-labelledby="hall-dialog-title"><form id="hall-form"><button type="button" class="hall-dialog-close" data-close aria-label="Schließen">×</button><span class="eyebrow">Administrator</span><h2 id="hall-dialog-title">${selected.id ? 'Belegung bearbeiten' : 'Belegung eintragen'}</h2><div class="hall-form-grid"><label>Wochentag<select name="day">${options(selected.day, dayOptions)}</select></label><label>Halle<select name="hall">${options(selected.hall, hallOptions)}</select></label><label>Beginn<select name="start">${options(selected.start, times.slice(0, -1))}</select></label><label>Ende<select name="end">${options(selected.end, times.slice(1))}</select></label></div><label>Bezeichnung<input name="text" maxlength="80" required value="${escapeHtml(selected.text || '')}" placeholder="z. B. G-Jugend" /></label><p class="hall-form-error" role="alert" hidden></p><div class="hall-form-actions"><button type="submit" class="primary">${selected.id ? 'Änderung speichern' : 'Eintragen'}</button>${selected.id ? '<button type="button" class="hall-delete" data-delete>Belegung löschen</button>' : ''}<button type="button" class="secondary" data-close>Abbrechen</button></div></form></dialog>`;
  }

  function loginMarkup() {
    if (!loginOpen || role === 'admin') return '';
    return `<dialog class="hall-dialog" id="hall-login" aria-labelledby="hall-login-title"><form id="hall-login-form"><button type="button" class="hall-dialog-close" data-close-login aria-label="Schließen">×</button><span class="eyebrow">Geschützter Bereich</span><h2 id="hall-login-title">Administrator anmelden</h2><p>Für die Bearbeitung gilt dein bestehender FC-Dechsendorf-Zugang.</p><label>E-Mail-Adresse<input name="email" type="email" autocomplete="username" required /></label><label>Passwort<input name="password" type="password" autocomplete="current-password" required /></label><p class="hall-form-error" role="alert" hidden></p><div class="hall-form-actions"><button type="submit" class="primary">Anmelden</button><button type="button" class="secondary" data-close-login>Abbrechen</button></div></form></dialog>`;
  }

  async function verifyAdmin() {
    const { data, error } = await window.Cloud.client.auth.getUser();
    if (error) throw error;
    return data.user?.app_metadata?.fcd_role === 'admin';
  }

  function render() {
    app.innerHTML = `<header class="app-header"><div class="brand-lockup"><img class="club-logo" src="assets/fc-dechsendorf-logo.png" alt="Wappen des FC Dechsendorf"><div><span class="eyebrow">FC Dechsendorf</span><h1>Hallenbelegung</h1><p>Standardplan für Dechsendorfer Halle und ASG Halle 1+2</p></div></div><div class="status"><span></span> Standardplan</div></header>
      <nav class="view-switch hall-main-nav" aria-label="Ansichten"><a href="index.html">Wochenübersicht</a><a href="index.html#kalender">Kalenderansicht</a><span class="active" aria-current="page">Hallenbelegung</span></nav>
      <div class="hall-toolbar"><p>Wiederkehrende Hallenbelegung · ${publicVisible ? 'öffentlich sichtbar' : 'derzeit nicht öffentlich'}</p><div>${authChecking ? '<span class="hall-auth-state">Anmeldung wird geprüft …</span>' : role === 'admin' ? `<button type="button" class="secondary" data-mode>${mode === 'public' ? 'Admin-Hallenbelegung' : 'Zur öffentlichen Ansicht'}</button><button type="button" class="secondary" data-logout>Abmelden</button>` : '<button type="button" class="secondary" data-login-open>Administrator anmelden</button>'}<button type="button" class="theme-toggle secondary" data-theme-toggle aria-label="Darstellung wechseln" aria-pressed="false">🌙 Dunkel</button></div></div>
      ${authMessage ? `<p class="hall-auth-message" role="alert">${escapeHtml(authMessage)}</p>` : ''}${notice ? `<p class="hall-notice" role="status">${escapeHtml(notice)}</p>` : ''}${publicMarkup()}${editorMarkup()}<footer class="hall-footer">Dieser Standardplan wiederholt sich wöchentlich. Änderungen sind nur nach Anmeldung als Administrator möglich.</footer>${formMarkup()}${loginMarkup()}`;
    app.querySelector('[data-public-visible]')?.addEventListener('change', async (event) => {
      const input = event.currentTarget;
      if (role !== 'admin' || !await verifyAdmin()) { input.checked = publicVisible; return; }
      input.disabled = true;
      const { data, error } = await window.Cloud.client.from('hall_settings')
        .update({ public_visible: input.checked }).eq('id', 1).select('id');
      if (error || data.length !== 1) { input.checked = publicVisible; notice = `Freigabe konnte nicht geändert werden: ${error?.message || 'keine Berechtigung'}`; }
      else { publicVisible = input.checked; notice = publicVisible ? 'Hallenbelegung öffentlich sichtbar.' : 'Hallenbelegung für die Öffentlichkeit ausgeblendet.'; }
      render();
    });
    app.querySelector('[data-mode]')?.addEventListener('click', () => {
      if (role !== 'admin') return;
      mode = mode === 'public' ? 'editor' : 'public'; notice = ''; render();
      if (mode === 'editor') app.querySelector('#editor-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    app.querySelector('[data-login-open]')?.addEventListener('click', () => {
      loginOpen = true; authMessage = ''; render(); app.querySelector('#hall-login')?.showModal();
    });
    app.querySelector('[data-logout]')?.addEventListener('click', async () => {
      try { await window.Cloud.logout(); role = ''; mode = 'public'; selected = null; await loadBookings(); }
      catch (error) { authMessage = `Abmelden fehlgeschlagen: ${error.message}`; render(); }
    });
    app.querySelectorAll('[data-day]').forEach((button) => button.addEventListener('click', () => {
      selectedDay = Number(button.dataset.day); render();
    }));
    app.querySelector('[data-new-hall]')?.addEventListener('click', () => {
      if (role !== 'admin') return;
      selected = { id: '', day: selectedDay, hall: 0, start: 540, end: 600, text: '' };
      render(); app.querySelector('#hall-dialog')?.showModal(); app.querySelector('[name="text"]')?.focus();
    });
    app.querySelectorAll('[data-slot]').forEach((button) => button.addEventListener('click', () => {
      if (role !== 'admin') return;
      const start = Number(button.dataset.slot);
      const hall = Number(button.dataset.hall);
      selected = { id: '', day: selectedDay, hall, start, end: Math.min(start + 60, 1440), text: '' };
      render(); app.querySelector('#hall-dialog')?.showModal(); app.querySelector('[name="text"]')?.focus();
    }));
    app.querySelectorAll('[data-edit]').forEach((button) => button.addEventListener('click', () => {
      if (role !== 'admin') return;
      const item = bookings.find((entry) => entry.id === button.dataset.edit);
      if (!item) return;
      selected = { ...item }; render(); app.querySelector('#hall-dialog')?.showModal();
    }));
    const loginDialog = app.querySelector('#hall-login');
    loginDialog?.querySelectorAll('[data-close-login]').forEach((button) => button.addEventListener('click', () => {
      loginDialog.close(); loginOpen = false; render();
    }));
    loginDialog?.querySelector('#hall-login-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      try {
        await window.Cloud.login(String(form.get('email')), String(form.get('password')));
        if (!await verifyAdmin()) throw new Error('Nur Administratoren dürfen die Hallenbelegung bearbeiten.');
        role = 'admin'; loginOpen = false; mode = 'editor'; authMessage = ''; await loadBookings();
        app.querySelector('#editor-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (error) {
        const message = loginDialog.querySelector('.hall-form-error');
        message.textContent = error.message; message.hidden = false;
      }
    });
    const dialog = app.querySelector('#hall-dialog');
    dialog?.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => { dialog.close(); selected = null; render(); }));
    dialog?.addEventListener('close', () => { selected = null; });
    dialog?.querySelector('[data-delete]')?.addEventListener('click', async () => {
      if (role !== 'admin' || !selected?.id || !confirm('Diese Hallenbelegung endgültig löschen?')) return;
      try {
        if (!await verifyAdmin()) throw new Error('Administratorrechte erforderlich.');
        const result = await window.Cloud.client.from('hall_bookings').delete()
          .eq('id', selected.id).eq('updated_at', selected.updated_at).select('id');
        if (result.error) throw result.error;
        if (result.data.length !== 1) throw new Error('Dieser Eintrag wurde inzwischen geändert. Bitte die Seite neu laden.');
        selected = null; notice = 'Belegung gelöscht.'; await loadBookings();
      } catch (error) { const message = dialog.querySelector('.hall-form-error'); message.textContent = error.message; message.hidden = false; }
    });
    dialog?.querySelector('#hall-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (role !== 'admin') return;
      const form = new FormData(event.currentTarget);
      try {
        if (!await verifyAdmin()) throw new Error('Administratorrechte erforderlich.');
        const id = selected.id || (globalThis.crypto?.randomUUID?.() || `draft-${Date.now()}-${Math.random()}`);
        const entry = { id, day: form.get('day'), hall: form.get('hall'), start: form.get('start'), end: form.get('end'), text: form.get('text') };
        const checked = normalize(entry);
        upsert(bookings, checked);
        const query = selected.id
          ? window.Cloud.client.from('hall_bookings').update({ ...payload(checked), updated_at: new Date().toISOString() })
              .eq('id', selected.id).eq('updated_at', selected.updated_at).select('id')
          : window.Cloud.client.from('hall_bookings').insert(payload(checked)).select('id');
        const result = await query;
        if (result.error) throw result.error;
        if (result.data.length !== 1) throw new Error('Dieser Eintrag wurde inzwischen geändert. Bitte die Seite neu laden.');
        selectedDay = checked.day; selected = null; notice = 'Hallenbelegung gespeichert.';
        await loadBookings();
      } catch (error) {
        const message = dialog.querySelector('.hall-form-error');
        message.textContent = error.message; message.hidden = false;
      }
    });
  }

  render();
  loadBookings().catch((error) => { dataLoading = false; dataError = error.message; render(); });
  window.Cloud.initializeAuth().then(async () => {
    if (window.Cloud.role() === 'admin' && await verifyAdmin()) role = 'admin';
    authChecking = false; await loadBookings();
  }).catch(() => {
    authChecking = false; authMessage = 'Die Anmeldung konnte nicht geprüft werden. Die öffentliche Hallenansicht bleibt verfügbar.'; render();
  });
})();
