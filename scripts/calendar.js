(async function () {
  const { places, trainingRules, mowingDates, bfvGames } = window.AppData;
  const app = document.getElementById('app');
  const bfv = window.BfvData;
  let savedBfv = null;
  const bfvSummary = (snapshot) => `BFV: ${snapshot.games.filter((game) => game.status === 'Heimspiel').length} Heimspiele am Ort · ${snapshot.games.filter((game) => game.status === 'Ort offen').length} ohne Ortsangabe · Stand ${new Date(snapshot.importedAt).toLocaleString('de-DE')}`;
  let bfvMessage = 'Gemeinsame Daten werden geladen';
  const weekdays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const hourMarks = Array.from({ length: 14 }, (_, n) => `${String(n + 9).padStart(2, '0')}:00`);
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
  let view = 'weeks', openWeek = 0, modal = null, selectedEvent = null, selectedRequest = null;
  let role = '';
  const fmtDate = (date) => new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' }).format(date);
  // Kalendertage werden lokal formatiert. toISOString() würde in Deutschland
  // Abendstunden in den Vortag (UTC) verschieben.
  const iso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
  const dayName = (date) => weekdays[(date.getDay() + 6) % 7];
  const mins = (time) => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
  const timeTop = (time) => ((mins(time) - 540) / 780) * 100;
  const timeHeight = (from, to) => Math.max(3.5, ((mins(to) - mins(from)) / 780) * 100);
  const read = (key, fallback) => window.Cloud.read(key, fallback);
  let saveQueue = Promise.resolve();
  const write = (key, value) => {
    saveQueue = saveQueue.catch(() => {}).then(() => window.Cloud.save(key, value)).then(render);
    return saveQueue;
  };
  const capacity = (type) => type === 'halb' ? .5 : type === 'vorplatz' ? 0 : 1;
  const capacityLabel = (type) => type === 'halb' ? '1/2 Platz' : type === 'vorplatz' ? 'Vorplatz' : type === 'special' ? 'Sperre' : '1/1 Platz';
  const esc = (value) => String(value || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function summerTime(date) { const y = date.getFullYear(), march = new Date(y, 2, 31 - new Date(y, 2, 31).getDay()), october = new Date(y, 9, 31 - new Date(y, 9, 31).getDay()); return date >= march && date < october; }
  function sunsetFor(date) {
    const day = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000), gamma = 2 * Math.PI / 365 * (day - .5);
    const equation = 229.18 * (.000075 + .001868 * Math.cos(gamma) - .032077 * Math.sin(gamma) - .014615 * Math.cos(2 * gamma) - .040849 * Math.sin(2 * gamma));
    const decl = .006918 - .399912 * Math.cos(gamma) + .070257 * Math.sin(gamma) - .006758 * Math.cos(2 * gamma) + .000907 * Math.sin(2 * gamma) - .002697 * Math.cos(3 * gamma) + .00148 * Math.sin(3 * gamma), lat = 49.62 * Math.PI / 180;
    const angle = Math.acos(Math.cos(90.833 * Math.PI / 180) / (Math.cos(lat) * Math.cos(decl)) - Math.tan(lat) * Math.tan(decl));
    const total = Math.round(720 - 4 * (11.02 - angle * 180 / Math.PI) - equation + (summerTime(date) ? 120 : 60));
    return { minutes: total, label: `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}` };
  }
  const overlaps = (a, b) => mins(a.from) < mins(b.to) && mins(b.from) < mins(a.to);
  function fits(event, place, assigned) {
    const simultaneous = assigned.filter((other) =>
      other.place === place && (other.allDay || overlaps(event, other)));
    const blocks = simultaneous.filter((other) => other.type === 'special');
    if (blocks.some((block) => block.scope === 'Ganz gesperrt')) return false;
    if (event.type === 'game' && blocks.length) return false;
    if (event.type === 'vorplatz') return true;
    const limit = blocks.some((block) => block.scope === 'Halbseitig gesperrt') ? .5 : 1;
    const occupied = simultaneous.filter((other) => other.type !== 'special')
      .reduce((sum, other) => sum + capacity(other.type), 0);
    return occupied + capacity(event.type) <= limit;
  }
  const typeForCapacity = (value) => value === '1/2' ? 'halb' : value === 'vorplatz' ? 'vorplatz' : 'voll';
  const capacityForType = (value) => value === 'halb' ? '1/2' : value === 'vorplatz' ? 'vorplatz' : '1/1';
  function requestedEvents(date) { return read('sg-requests', []).filter((item) => item.date === iso(date)).map((item, index) => ({ id: `request-${item.id || index}`, team: item.team, from: item.from, to: item.to, place: item.place, originalPlace: item.place, type: typeForCapacity(item.capacity), category: item.status === 'freigegeben' ? 'Freigegebener Termin' : 'Beantragter Termin', note: item.note || (item.status === 'freigegeben' ? 'Freigegeben' : 'Beantragt'), source: 'Abteilungsleitung', pending: item.status !== 'freigegeben', manual: item.status === 'freigegeben', requestStatus: item.status })); }
  function blockEvents(date) { return read('sg-blocks', []).filter((item) => item.fromDate <= iso(date) && item.toDate >= iso(date)).map((item, index) => ({ id: `block-${item.id || index}`, team: item.title || 'Platz gesperrt', from: '09:00', to: '22:00', place: item.place, originalPlace: item.place, type: 'special', category: 'Platzsperre', note: item.scope, scope: item.scope, source: 'Platzwart', allDay: true })); }
  function rawEvents(date) {
    const games = bfvGames.filter((game) => game.date === iso(date)).map((game) => ({ id: game.id, team: game.source === 'Atletico Ü32' ? `${game.name} (Ü32)` : game.name, from: game.from, to: game.to, place: game.place || 'A', originalPlace: game.place || 'A', type: 'game', category: game.category, note: `${game.category} · ${game.status}`, source: `BFV-iCal · ${game.source}`, location: game.location, unresolved: game.status === 'Ort offen' }));
    const training = trainingRules.filter((row) => row[1] === dayName(date)).map(([team, , from, to, place, type]) => ({ id: `standard-${team}-${iso(date)}-${from}`, team, from, to, place, originalPlace: place, type, category: 'Training', source: 'Standardtrainingsplan' }));
    const deleted = new Set(read('sg-deletions', [])), overrides = read('sg-overrides', {}), base = [...blockEvents(date), ...games, ...requestedEvents(date), ...training];
    const officialById = new Map(bfvGames.map((game) => [game.id, game]));
    const manualState = (id) => ({
      manual: true,
      idConflict: officialById.has(id),
      bfvMissing: id.startsWith('bfv-') && !officialById.has(id),
      bfvOfficial: officialById.get(id) || null
    });
    const current = base.filter((event) => !overrides[event.id] || !overrides[event.id].date || overrides[event.id].date === iso(date)).map((event) => overrides[event.id] ? { ...event, ...overrides[event.id], originalPlace: event.originalPlace, source: `${event.source} · administrativ geändert`, ...manualState(event.id) } : event);
    const movedHere = Object.entries(overrides).filter(([id, override]) => override.date === iso(date) && !base.some((event) => event.id === id)).map(([id, override]) => ({ id, ...override, originalPlace: override.originalPlace || 'nicht festgelegt', category: 'Administrativ geänderter Termin', source: 'Administrator', ...manualState(id) }));
    return [...current, ...movedHere].filter((event) => !deleted.has(event.id));
  }
  function placementsFor(date) {
    const limit = sunsetFor(date).minutes - 15, assigned = [];
    const priority = { special: 4, game: 3, voll: 2, halb: 2, vorplatz: 1 };
    rawEvents(date).sort((a, b) => priority[b.type] - priority[a.type] || mins(a.from) - mins(b.from)).forEach((event) => {
      if (event.type === 'special' || event.type === 'vorplatz' || event.unresolved) { assigned.push(event); return; }
      const needsLight = event.place === 'A' && mins(event.to) > limit;
      let candidates = needsLight ? ['B', 'C'] : [event.place, ...places.filter((place) => place !== event.place && (place !== 'A' || mins(event.to) <= limit))];
      const target = candidates.find((place) => fits(event, place, assigned));
      if (target) {
        event.place = target;
        if (target !== event.originalPlace) event.note = `${event.category} · ${needsLight ? 'Flutlicht' : 'Kapazität'}: von ${event.originalPlace} nach ${target}`;
      } else { event.overbooked = true; event.note = `${event.category} · keine freie Kapazität`; }
      if (event.type === 'halb') event.side = assigned.filter((other) => other.place === event.place && other.type === 'halb' && overlaps(event, other)).length % 2;
      assigned.push(event);
    });
    return assigned;
  }
  const eventsFor = (date, place) => placementsFor(date).filter((event) => event.place === place);
  function lane(date, place) {
    const sun = sunsetFor(date), endLimit = sun.minutes - 15, endLabel = `${String(Math.floor(endLimit / 60)).padStart(2, '0')}:${String(endLimit % 60).padStart(2, '0')}`;
    const entries = eventsFor(date, place).map((event) => { const classes = ['event', event.type]; if (event.side) classes.push('right'); if (event.manual) classes.push('manual'); if (event.pending) classes.push('pending'); if (event.unresolved || event.overbooked || event.idConflict || event.bfvMissing) classes.push('unresolved'); return `<button class="${classes.join(' ')}" data-event="${esc(event.id)}" data-date="${iso(date)}" style="top:${timeTop(event.from)}%;height:${timeHeight(event.from, event.to)}%"><b>${esc(event.team)}</b><span>${esc(event.from)}–${esc(event.to)} · ${capacityLabel(event.type)}</span></button>`; }).join('');
    return `<section class="lane"><span class="place-title">${place}-Platz${place === 'A' ? ` · ohne Flutlicht · Ende bis ${endLabel}` : ' · Flutlicht'}</span><span class="sunset" style="top:${timeTop(sun.label)}%"><i></i> ${sun.label}</span>${entries || '<span class="free">frei</span>'}</section>`;
  }
  function dayDetail(date) { const mow = mowingDates.has(iso(date)); const note = (window.Cloud.mowing || []).find((item) => item.date === iso(date))?.note; return `<article class="day-row"><div class="day-label"><b>${dayName(date)}</b><span>${fmtDate(date)}</span></div><div class="mow ${mow ? '' : 'empty'}">${mow ? `Stadt mäht${note ? ` · ${esc(note)}` : ''}` : ''}</div><div class="timeline"><div class="time-scale">${hourMarks.map((mark, i) => `<span style="top:${i * 100 / 13}%">${mark}</span>`).join('')}</div><div class="lanes">${places.map((place) => lane(date, place)).join('')}</div></div></article>`; }
  function mobileDay(date) {
    const events = placementsFor(date), sun = sunsetFor(date), latest = sun.minutes - 15;
    const latestLabel = `${String(Math.floor(latest / 60)).padStart(2, '0')}:${String(latest % 60).padStart(2, '0')}`;
    const mow = mowingDates.has(iso(date));
    const note = (window.Cloud.mowing || []).find((item) => item.date === iso(date))?.note;
    return `<article class="mobile-day"><header><div><strong>${dayName(date)} · ${fmtDate(date)}</strong><span>Sonnenuntergang ${sun.label} · A-Platz bis ${latestLabel}</span></div>${mow ? `<b class="mobile-mow">Stadt mäht${note ? ` · ${esc(note)}` : ''}</b>` : ''}</header>${places.map((place) => {
      const entries = events.filter((event) => event.place === place).sort((a, b) => mins(a.from) - mins(b.from));
      return `<section class="mobile-place"><h3>${place}-Platz <small>${place === 'A' ? 'ohne Flutlicht' : 'mit Flutlicht'}</small></h3>${entries.length ? entries.map((event) => `<button class="mobile-event ${event.type}${event.manual ? ' manual' : ''}${event.pending ? ' pending' : ''}${event.unresolved || event.overbooked || event.idConflict || event.bfvMissing ? ' unresolved' : ''}" data-event="${esc(event.id)}" data-date="${iso(date)}"><span class="mobile-event-time">${event.from}–${event.to}</span><span class="mobile-event-title">${esc(event.team)}</span><span class="mobile-event-meta">${esc(event.category)} · ${capacityLabel(event.type)}${event.idConflict || event.bfvMissing ? ' · BFV-Abgleich nötig' : event.overbooked ? ' · Konflikt' : ''}</span></button>`).join('') : '<p class="mobile-free">Keine Belegung</p>'}</section>`;
    }).join('')}</article>`;
  }
  function weekDetail(week) { const weekStart = addDays(start, week * 7); return `<div class="week-detail"><div class="desktop-week-detail">${Array.from({ length: 7 }, (_, i) => dayDetail(addDays(weekStart, i))).join('')}</div><div class="mobile-week-detail">${Array.from({ length: 7 }, (_, i) => mobileDay(addDays(weekStart, i))).join('')}</div></div>`; }
  function weeksMarkup() { const weekNo = (date) => { const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); return Math.ceil((((d - new Date(Date.UTC(d.getUTCFullYear(), 0, 1))) / 86400000) + 1) / 7); }; return `<div class="weeks-intro"><span class="eyebrow">Öffentliche Wochenansicht</span><p>Die sechs Wochen beginnen mit der aktuell laufenden Kalenderwoche.</p></div><div class="weeks">${Array.from({ length: 6 }, (_, week) => { const ws = addDays(start, week * 7), we = addDays(ws, 6), open = openWeek === week; return `<section class="week ${open ? 'is-open' : ''}"><button class="week-toggle" data-week="${week}" aria-expanded="${open}"><span><small>Kalenderwoche ${weekNo(ws)}</small><b>${fmtDate(ws)} – ${fmtDate(we)} · ${ws.getFullYear()}</b></span><span class="toggle-state">${open ? 'Übersicht schließen −' : 'Übersicht öffnen +'}</span></button>${open ? weekDetail(week) : ''}</section>`; }).join('')}</div>`; }
  function calendarMarkup() { const week = openWeek === null ? 0 : openWeek, ws = addDays(start, week * 7); return `<section class="calendar-panel"><div class="calendar-heading"><h2>${fmtDate(ws)} – ${fmtDate(addDays(ws, 6))}</h2><div class="week-nav"><button data-shift="-1" ${week === 0 ? 'disabled' : ''}>←</button><button data-shift="1" ${week === 5 ? 'disabled' : ''}>→</button></div></div><div class="calendar-grid">${Array.from({ length: 7 }, (_, i) => { const date = addDays(ws, i), entries = placementsFor(date).map((event) => `<li class="${event.type}${event.manual ? ' manual' : ''}${event.pending ? ' pending' : ''}${event.unresolved || event.overbooked || event.idConflict || event.bfvMissing ? ' unresolved' : ''}"><button class="calendar-event-button" data-event="${esc(event.id)}" data-date="${iso(date)}"><b>${event.from}</b> ${esc(event.team)}<span>${event.place} · ${capacityLabel(event.type)}${event.idConflict || event.bfvMissing ? ' · BFV-Abgleich nötig' : ''}</span></button></li>`); const mow = mowingDates.has(iso(date)); const note = (window.Cloud.mowing || []).find((item) => item.date === iso(date))?.note; return `<article class="calendar-day"><header><b>${dayName(date)}</b><span>${fmtDate(date)}</span></header>${mow ? `<p class="mow-note">Stadt mäht${note ? ` · ${esc(note)}` : ''}</p>` : ''}<ul>${entries.join('') || '<li class="empty-day">Keine Belegung</li>'}</ul></article>`; }).join('')}</div></section>`; }
  function loginMarkup(kind) { const title = kind === 'manager' ? 'Abteilungsleitung' : 'Administrator'; return `<section class="modal-card login"><button class="close" data-close>×</button><span class="eyebrow">Geschützter Bereich</span><h2>${title}</h2><form data-login="${kind}"><label>E-Mail-Adresse<input name="email" type="email" autocomplete="username" required autofocus></label><label>Passwort<input name="password" type="password" autocomplete="current-password" required></label><button class="primary">Anmelden</button></form><p class="access-note">Ein Zugang wird vom Administrator eingerichtet. Bitte kein Passwort per Chat weitergeben.</p></section>`; }
  const timeOptions = (value) => {
    const options = Array.from({ length: 96 }, (_, slot) => `${String(Math.floor(slot / 4)).padStart(2, '0')}:${String(slot % 4 * 15).padStart(2, '0')}`);
    if (value && !options.includes(value)) options.push(value);
    options.sort();
    return `<option value="" ${value ? '' : 'selected'} disabled>Uhrzeit wählen</option>${options.map((time) => `<option value="${time}" ${time === value ? 'selected' : ''}>${time}${Number(time.slice(3)) % 15 ? ' (bisher)' : ''}</option>`).join('')}`;
  };
  function requestForm(item = {}, index = '') {
    const place = item.place || 'A', cap = item.capacity || '1/1', fixedGame = Boolean(item.targetId?.startsWith('bfv-'));
    const dateField = fixedGame ? `${esc(item.date)}<input type="hidden" name="date" value="${esc(item.date)}">` : `<input name="date" type="date" value="${item.date || ''}" required>`;
    const timeField = (name, value) => fixedGame ? `${esc(value)}<input type="hidden" name="${name}" value="${esc(value)}">` : `<select name="${name}" required>${timeOptions(value)}</select>`;
    const teamField = fixedGame ? `${esc(item.team)}<input type="hidden" name="team" value="${esc(item.team)}">` : `<input name="team" value="${esc(item.team)}" required>`;
    const capacityField = fixedGame ? `1/1 Platz<input type="hidden" name="capacity" value="1/1">` : `<select name="capacity" data-capacity><option value="1/2" ${cap === '1/2' ? 'selected' : ''}>1/2 Platz</option><option value="1/1" ${cap === '1/1' ? 'selected' : ''}>1/1 Platz</option><option value="vorplatz" ${cap === 'vorplatz' ? 'selected' : ''} ${place !== 'A' ? 'disabled' : ''}>Vorplatz (nur A-Platz)</option></select>`;
    return `<form data-request-form><input type="hidden" name="index" value="${index}"><input type="hidden" name="id" value="${esc(item.id || '')}"><input type="hidden" name="action" value="${esc(item.action || 'new')}"><input type="hidden" name="targetId" value="${esc(item.targetId || '')}"><label>Bezeichnung${teamField}</label><div class="form-grid"><label>Datum${dateField}</label><label>Platz<select name="place" data-place>${places.map((option) => `<option ${place === option ? 'selected' : ''}>${option}</option>`).join('')}</select></label><label>Beginn${timeField('from', item.from)}</label><label>Ende${timeField('to', item.to)}</label><label>Platzbedarf${capacityField}</label></div>${fixedGame ? '<p class="access-note">BFV-Spiel: Datum und Uhrzeit sind fest; nur der Platz kann verlegt werden.</p>' : ''}<label>Hinweis<textarea name="note" rows="3">${esc(item.note)}</textarea></label><button class="primary">${role === 'admin' ? 'Übernehmen' : 'Beantragen'}</button></form>`;
  }
  const movePreset = () => selectedEvent ? ({ ...selectedEvent, capacity: capacityForType(selectedEvent.type), action: 'move', targetId: selectedEvent.id, note: `Verlegung beantragt. ${selectedEvent.note || ''}` }) : {};
  function dashboardMarkup() { const requests = read('sg-requests', []); const manager = role === 'manager'; return `<section class="modal-card admin"><button class="close" data-close>×</button><span class="eyebrow">${manager ? 'Abteilungsleitung' : 'Administrator'}</span><h2>Terminverwaltung</h2>${manager ? requestForm(selectedEvent?.requestAction === 'move' ? movePreset() : {}) : `<div class="request-list">${requests.length ? requests.map((item, i) => `<article><b>${esc(item.team)}</b><span>${esc(item.date)} · ${esc(item.from)}–${esc(item.to)} · ${esc(item.place)} · ${esc(item.capacity)} · ${esc(item.status)}</span><p>${esc(item.note || 'Kein Hinweis')}</p><button data-edit-request="${i}">Bearbeiten</button> <button data-approve="${i}">Übernehmen</button> <button data-delete-request="${i}">Löschen</button></article>`).join('') : '<p>Keine Beantragungen.</p>'}</div><h3>Platzwart: Sperre eintragen</h3><form data-block-form><div class="form-grid"><label>Platz<select name="place">${places.map((place) => `<option>${place}</option>`).join('')}</select></label><label>Art<select name="scope"><option>Ganz gesperrt</option><option>Halbseitig gesperrt</option><option>Teilbereiche gesperrt</option></select></label><label>Von<input name="fromDate" type="date" required></label><label>Bis<input name="toDate" type="date" required></label></div><label>Bezeichnung<input name="title" placeholder="z. B. Nachsaat C-Platz"></label><button class="secondary">Ganztägige Sperre speichern</button></form><h3>Mähtermin</h3><form data-mowing-form><div class="form-grid"><label>Datum<input name="date" type="date" required></label><label>Hinweis<input name="note" placeholder="z. B. voraussichtlich vormittags"></label></div><button class="secondary">Mähtermin speichern</button></form><div data-mowing-list></div><h3>Abteilungsleitung einladen</h3><form data-invite-manager><label>E-Mail-Adresse<input name="email" type="email" required></label><button class="secondary">Einladung senden</button></form><div data-manager-list></div>`}</section>`; }
  function sourceMarkup() {
    const items = bfv.sources(), snapshot = bfv.cached();
    return `<section class="modal-card admin"><button class="close" data-close>×</button><span class="eyebrow">Administrator</span><h2>BFV-iCal-Quellen</h2><p class="source-note">${esc(bfvMessage)}. Änderungen an Quellen werden gemeinsam gespeichert.</p><button class="secondary" data-refresh-bfv>Jetzt neu abrufen</button><div class="source-list">${items.map((item, index) => `<form data-source-form="${index}"><div class="source-heading"><b>${esc(item.team)}</b><span>${item.row ? `Excel-Zeile ${item.row}` : 'Neu hinzugefügt'}</span></div><label>Mannschaft<input name="team" value="${esc(item.team)}" required></label><label>BFV-iCal-Link<input name="url" type="url" value="${esc(item.url)}" required></label><label class="checkline"><input name="active" type="checkbox" ${item.active ? 'checked' : ''}>Aktiv (deaktivieren bei Abmeldung)</label><button class="secondary">Quelle speichern</button></form>`).join('')}</div><h3>Mannschaft / iCal-Quelle hinzufügen</h3><form data-new-source><label>Mannschaft<input name="team" required></label><label>BFV-iCal-Link<input name="url" type="url" placeholder="https://service.bfv.de/rest/icsexport/Spielplan?..." required></label><button class="primary">Hinzufügen und abrufen</button></form>${snapshot?.errors?.length ? `<p class="source-error">${snapshot.errors.length} Quelle(n) konnten beim letzten Abruf nicht geladen werden.</p>` : ''}</section>`;
  }
  function validBfvUrl(value) { try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'service.bfv.de' && url.pathname === '/rest/icsexport/Spielplan' && url.searchParams.has('staffel') && url.searchParams.has('id'); } catch { return false; } }
  async function refreshBfv() {
    bfvMessage = 'BFV-Daten werden geladen'; render();
    try { bfvMessage = bfvSummary(await window.Cloud.refreshBfv()); }
    catch (error) { bfvMessage = `BFV-Abruf fehlgeschlagen: ${error.message}`; }
    render();
  }
  function eventMarkup(event) { const editable = role === 'admin', requestable = role === 'manager', sun = sunsetFor(new Date(`${event.date}T12:00:00`)); const bfvCheck = event.idConflict ? `<p class="bfv-conflict">BFV-Abgleich nötig: Diese manuelle Fassung und ein BFV-Spiel haben dieselbe ID. Der manuelle Termin bleibt erhalten. BFV meldet: ${esc(event.bfvOfficial.game_date || event.bfvOfficial.date)} · ${esc(event.bfvOfficial.starts_at || event.bfvOfficial.from)}–${esc(event.bfvOfficial.ends_at || event.bfvOfficial.to)} · ${esc(event.bfvOfficial.place)}-Platz.</p>` : event.bfvMissing ? '<p class="bfv-conflict">BFV-Abgleich nötig: Die ID dieses manuell geänderten Spiels fehlt im aktuellen BFV-Abruf. Der manuelle Termin bleibt erhalten.</p>' : ''; return `<section class="modal-card"><button class="close" data-close>×</button><span class="eyebrow">${esc(event.category)}</span><h2>${esc(event.team)}</h2>${bfvCheck}<dl><dt>Datum</dt><dd>${esc(event.date)}</dd><dt>Zeit</dt><dd>${esc(event.from)}–${esc(event.to)}</dd><dt>Platz</dt><dd>${esc(event.place)}${event.place !== event.originalPlace ? ` · automatisch von ${esc(event.originalPlace)} verlegt` : ''}</dd><dt>Ursprünglicher Platz</dt><dd>${esc(event.originalPlace || 'nicht festgelegt')}</dd><dt>Platzbedarf</dt><dd>${event.type === 'special' ? esc(event.scope || 'Sperre') : `${capacityLabel(event.type)} (${capacity(event.type)} Platzkapazität)`}</dd><dt>Flutlicht</dt><dd>${event.place === 'A' ? `Nein · Sonnenuntergang ${sun.label}` : 'Ja verfügbar'}</dd><dt>Ort</dt><dd>${esc(event.location || 'Sportanlage Dechsendorf')}</dd><dt>Quelle</dt><dd>${esc(event.source)}</dd><dt>Status</dt><dd>${esc(event.note || 'Standardbelegung')}</dd></dl>${editable ? `<div class="modal-actions">${event.type === 'special' ? '' : '<button class="primary" data-edit-event>Termin bearbeiten</button>'}<button class="secondary" data-delete-event-direct>${event.type === 'special' ? 'Sperre entfernen' : 'Termin löschen'}</button></div>` : requestable && event.type !== 'special' ? '<div class="modal-actions"><button class="primary" data-move-request>Verlegung beantragen</button><button class="secondary" data-delete-request-event>Löschung beantragen</button></div>' : '<p class="access-note">Für Änderungen bitte anmelden.</p>'}</section>`; }
  const eventEditPreset = () => selectedEvent ? ({ ...selectedEvent, capacity: capacityForType(selectedEvent.type), action: 'override', targetId: selectedEvent.id }) : {};
  function modalMarkup() { if (!modal) return ''; if (modal === 'set-password') return `<section class="modal-card login"><span class="eyebrow">Zugang aktivieren</span><h2>Eigenes Passwort festlegen</h2><form data-set-password><label>Neues Passwort<input name="password" type="password" minlength="12" autocomplete="new-password" required></label><label>Wiederholung<input name="confirm" type="password" minlength="12" autocomplete="new-password" required></label><button class="primary">Passwort speichern</button></form></section>`; if (modal === 'manager' || modal === 'admin') return loginMarkup(modal); if (modal === 'dashboard') return dashboardMarkup(); if (modal === 'bfv-sources' && role === 'admin') return sourceMarkup(); if (modal === 'new-event') return `<section class="modal-card"><button class="close" data-close>×</button><span class="eyebrow">${role === 'admin' ? 'Administrator' : 'Abteilungsleitung'}</span><h2>Neuer Termin</h2>${requestForm()}</section>`; if (modal === 'event-edit') return `<section class="modal-card"><button class="close" data-close>×</button><span class="eyebrow">Administrator</span><h2>Termin direkt bearbeiten</h2>${requestForm(eventEditPreset())}</section>`; if (modal === 'event' && selectedEvent) return eventMarkup(selectedEvent); if (modal === 'request-edit') return `<section class="modal-card"><button class="close" data-close>×</button><span class="eyebrow">Administrator</span><h2>Beantragung bearbeiten</h2>${requestForm(read('sg-requests', [])[selectedRequest], selectedRequest)}</section>`; return ''; }
  function render() {
    app.innerHTML = `<main class="wrap"><header class="app-header"><div class="brand-lockup"><img class="club-logo" src="assets/fc-dechsendorf-logo.png" alt="Wappen des FC Dechsendorf"><div><span class="eyebrow">FC Dechsendorf</span><h1>FC Dechsendorf - Platzbelegungsplan</h1><p>Standardtrainingsplan · öffentliche Übersicht</p></div></div><div class="status"><span></span> Saison 2026/27</div></header><div class="management-actions"><button data-open="manager">Abteilungsleitung</button><button data-open="admin">Administrator</button>${role ? `<button data-new-event>Neuer Termin</button>${role === 'admin' ? '<button data-admin-panel>Beantragungen</button><button data-bfv-panel>iCal-Quellen</button>' : ''}<span>Angemeldet: ${role === 'admin' ? 'Administrator' : 'Abteilungsleitung'} <button data-logout>Abmelden</button></span>` : ''}</div><p class="bfv-status">${esc(bfvMessage)}</p>${mowingDates.size ? '' : '<p class="mowing-status">Mähplan: Noch keine Termine eingetragen.</p>'}<nav class="view-switch"><button data-view="weeks" class="${view === 'weeks' ? 'active' : ''}">Wochenübersicht</button><button data-view="calendar" class="${view === 'calendar' ? 'active' : ''}">Kalenderansicht</button></nav>${view === 'weeks' ? weeksMarkup() : calendarMarkup()}<footer>Grün: Standardtraining. Blau: BFV-Spiele. Gelb: manuell übernommene Termine, Änderungen und Sperren. Orange gestrichelt: beantragt. Rot: Klärung erforderlich.</footer></main><div class="modal-backdrop ${modal ? 'show' : ''}">${modalMarkup()}</div>`;
    app.querySelectorAll('[data-view]').forEach((button) => button.onclick = () => { view = button.dataset.view; render(); }); app.querySelectorAll('[data-week]').forEach((button) => button.onclick = () => { openWeek = openWeek === Number(button.dataset.week) ? null : Number(button.dataset.week); render(); }); app.querySelectorAll('[data-shift]').forEach((button) => button.onclick = () => { openWeek = Math.max(0, Math.min(5, openWeek + Number(button.dataset.shift))); render(); });
    app.querySelectorAll('[data-open]').forEach((button) => button.onclick = () => { modal = button.dataset.open; render(); }); app.querySelectorAll('[data-close]').forEach((button) => button.onclick = () => { modal = null; render(); }); app.querySelector('[data-logout]')?.addEventListener('click', async () => { try { await window.Cloud.logout(); role = ''; render(); } catch (error) { alert(error.message); } });
    app.querySelectorAll('[data-event]').forEach((button) => button.onclick = () => { selectedEvent = placementsFor(new Date(`${button.dataset.date}T12:00:00`)).find((event) => event.id === button.dataset.event); if (selectedEvent) { selectedEvent.date = button.dataset.date; modal = 'event'; render(); } });
    app.querySelector('[data-login]')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      try {
        role = await window.Cloud.login(String(data.get('email')), String(data.get('password')));
        modal = null;
        render();
      } catch (error) { alert(`Anmeldung fehlgeschlagen: ${error.message}`); }
    });
    app.querySelector('[data-set-password]')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const password = String(data.get('password')), confirmation = String(data.get('confirm'));
      if (password !== confirmation) { alert('Die Passwörter stimmen nicht überein.'); return; }
      try {
        await window.Cloud.updatePassword(password);
        modal = null;
        alert('Dein Zugang ist aktiviert.');
        render();
      } catch (error) { alert(`Passwort konnte nicht gespeichert werden: ${error.message}`); }
    });
    app.querySelector('[data-new-event]')?.addEventListener('click', () => { selectedEvent = null; modal = 'new-event'; render(); }); app.querySelector('[data-admin-panel]')?.addEventListener('click', () => { modal = 'dashboard'; render(); });
    app.querySelector('[data-bfv-panel]')?.addEventListener('click', () => { modal = 'bfv-sources'; render(); });
    const inviteForm = app.querySelector('[data-invite-manager]');
    if (inviteForm && modal === 'dashboard' && role === 'admin') {
      inviteForm.querySelector('button').textContent = 'Einmallink erzeugen';
      const output = document.createElement('div');
      output.dataset.inviteLink = '';
      output.hidden = true;
      inviteForm.after(output);
    }
    const managerList = app.querySelector('[data-manager-list]');
    if (managerList && role === 'admin') window.Cloud.listManagers()
      .then((items) => {
        managerList.innerHTML = items.length
          ? `<p class="access-note">Eingerichtete Abteilungsleitungen: ${items.map((item) => esc(item.email)).join(', ')}</p>`
          : '<p class="access-note">Noch keine Abteilungsleitung eingeladen.</p>';
      })
      .catch((error) => { managerList.textContent = `Zugänge konnten nicht geladen werden: ${error.message}`; });
    app.querySelector('[data-invite-manager]')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const email = String(new FormData(event.currentTarget).get('email')).trim();
      try {
        const invitation = await window.Cloud.inviteManager(email);
        const output = app.querySelector('[data-invite-link]');
        output.hidden = false;
        output.replaceChildren();
        const hint = document.createElement('p');
        hint.className = 'access-note';
        hint.textContent = `Link für ${email}: Nur privat an diese Person weitergeben. Wer den Link besitzt, kann den Zugang aktivieren. Der Link ist einmalig und verfällt nach etwa einer Stunde.`;
        const link = document.createElement('input');
        link.type = 'text';
        link.readOnly = true;
        link.value = invitation.actionLink;
        link.setAttribute('aria-label', `Einladungslink für ${email}`);
        const copy = document.createElement('button');
        copy.type = 'button';
        copy.textContent = 'Link kopieren';
        copy.onclick = async () => {
          try { await navigator.clipboard.writeText(link.value); copy.textContent = 'Kopiert'; }
          catch { link.select(); copy.textContent = 'Link markieren und manuell kopieren'; }
        };
        output.append(hint, link, copy);
      } catch (error) { alert(`Einladung fehlgeschlagen: ${error.message}`); }
    });
    const mowingList = app.querySelector('[data-mowing-list]');
    if (mowingList && role === 'admin') {
      const dates = window.Cloud.mowing;
      mowingList.innerHTML = dates.length
        ? dates.map((item) => `<p><b>${esc(item.date)}</b> ${esc(item.note)} <button data-remove-mowing="${esc(item.date)}">Entfernen</button></p>`).join('')
        : '<p class="access-note">Noch keine Mähtermine eingetragen.</p>';
      mowingList.querySelectorAll('[data-remove-mowing]').forEach((button) => {
        button.onclick = async () => {
          if (!confirm(`Mähtermin am ${button.dataset.removeMowing} entfernen?`)) return;
          try { await window.Cloud.removeMowing(button.dataset.removeMowing); render(); }
          catch (error) { alert(`Entfernen fehlgeschlagen: ${error.message}`); }
        };
      });
    }
    app.querySelector('[data-mowing-form]')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      try {
        await window.Cloud.addMowing(String(data.get('date')), String(data.get('note') || ''));
        render();
      } catch (error) { alert(`Mähtermin konnte nicht gespeichert werden: ${error.message}`); }
    });
    app.querySelector('[data-refresh-bfv]')?.addEventListener('click', () => { if (role === 'admin') refreshBfv(); });
    app.querySelectorAll('[data-source-form]').forEach((form) => form.addEventListener('submit', async (event) => {
      event.preventDefault(); if (role !== 'admin') return;
      const data = new FormData(form), url = String(data.get('url')).trim();
      if (!validBfvUrl(url)) { alert('Bitte einen vollständigen BFV-Spielplan-Link mit staffel und id eingeben.'); return; }
      const items = bfv.sources(), index = Number(form.dataset.sourceForm);
      items[index] = { ...items[index], team: String(data.get('team')).trim(), url, active: data.has('active') };
      try { await bfv.saveSources(items); await refreshBfv(); }
      catch (error) { alert(`Quelle konnte nicht gespeichert werden: ${error.message}`); }
    }));
    app.querySelector('[data-new-source]')?.addEventListener('submit', async (event) => {
      event.preventDefault(); if (role !== 'admin') return;
      const data = new FormData(event.currentTarget), url = String(data.get('url')).trim();
      if (!validBfvUrl(url)) { alert('Bitte einen vollständigen BFV-Spielplan-Link mit staffel und id eingeben.'); return; }
      const items = bfv.sources(); items.push({ id: `manual-${Date.now()}`, team: String(data.get('team')).trim(), url, active: true });
      try { await bfv.saveSources(items); await refreshBfv(); }
      catch (error) { alert(`Quelle konnte nicht gespeichert werden: ${error.message}`); }
    });
    app.querySelector('[data-place]')?.addEventListener('change', (event) => { const choice = app.querySelector('[data-capacity]'), forecourt = choice?.querySelector('option[value="vorplatz"]'); if (!forecourt) return; forecourt.disabled = event.target.value !== 'A'; if (forecourt.disabled && choice.value === 'vorplatz') choice.value = '1/2'; });
    app.querySelector('[data-request-form]')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget));
      if (data.place !== 'A' && data.capacity === 'vorplatz') { alert('Vorplatz ist nur am A-Platz möglich.'); return; }
      if (mins(data.from) >= mins(data.to)) { alert('Das Ende muss nach dem Beginn liegen.'); return; }
      const official = bfvGames.find((game) => game.id === data.targetId);
      if (official && (data.date !== official.date || data.from !== official.from || data.to !== official.to || data.capacity !== '1/1')) {
        alert('Bei BFV-Spielen darf nur der Platz geändert werden.'); return;
      }
      const requests = read('sg-requests', []), index = data.index;
      delete data.index;
      try {
        if (data.action === 'override' && data.targetId) {
          if (role !== 'admin') throw new Error('Nur Administratoren dürfen direkt ändern.');
          const overrides = read('sg-overrides', {});
          overrides[data.targetId] = { team: data.team, date: data.date, from: data.from, to: data.to, place: data.place, type: typeForCapacity(data.capacity), note: data.note || 'Administrativ geändert' };
          await write('sg-overrides', overrides);
        } else {
          data.status = index !== '' ? requests[Number(index)].status :
            role === 'admin' ? 'freigegeben' : 'beantragt';
          if (index !== '') requests[Number(index)] = data; else requests.push(data);
          await write('sg-requests', requests);
        }
        modal = null; selectedEvent = null; render();
      } catch (error) { alert(`Speichern fehlgeschlagen: ${error.message}`); }
    });
    app.querySelectorAll('[data-edit-request]').forEach((button) => button.onclick = () => {
      selectedRequest = Number(button.dataset.editRequest); modal = 'request-edit'; render();
    });
    app.querySelectorAll('[data-approve]').forEach((button) => button.onclick = async () => {
      const item = read('sg-requests', [])[Number(button.dataset.approve)];
      if (!item) return;
      try { await window.Cloud.approveRequest(item.id); render(); }
      catch (error) { alert(`Übernehmen fehlgeschlagen: ${error.message}`); }
    });
    app.querySelectorAll('[data-delete-request]').forEach((button) => button.onclick = async () => {
      const requests = read('sg-requests', []);
      requests.splice(Number(button.dataset.deleteRequest), 1);
      try { await write('sg-requests', requests); }
      catch (error) { alert(`Antrag konnte nicht gelöscht werden: ${error.message}`); }
    });
    app.querySelector('[data-block-form]')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const blocks = read('sg-blocks', []);
      const block = Object.fromEntries(new FormData(event.currentTarget));
      if (block.fromDate > block.toDate) { alert('Das Ende muss nach dem Beginn liegen.'); return; }
      blocks.push(block);
      try { await write('sg-blocks', blocks); }
      catch (error) { alert(`Sperre konnte nicht gespeichert werden: ${error.message}`); }
    });
    app.querySelector('[data-edit-event]')?.addEventListener('click', () => { modal = 'event-edit'; render(); });
    app.querySelector('[data-delete-event-direct]')?.addEventListener('click', async () => {
      if (!selectedEvent || !confirm(`Termin „${selectedEvent.team}“ wirklich löschen?`)) return;
      if (selectedEvent.type === 'special') {
        const blocks = read('sg-blocks', []).filter((item) => `block-${item.id}` !== selectedEvent.id);
        try { await write('sg-blocks', blocks); modal = null; render(); }
        catch (error) { alert(`Sperre konnte nicht entfernt werden: ${error.message}`); }
        return;
      }
      const deletions = read('sg-deletions', []);
      if (!deletions.includes(selectedEvent.id)) deletions.push(selectedEvent.id);
      try { await write('sg-deletions', deletions); modal = null; render(); }
      catch (error) { alert(`Termin konnte nicht gelöscht werden: ${error.message}`); }
    });
    app.querySelector('[data-move-request]')?.addEventListener('click', () => {
      selectedEvent.requestAction = 'move'; modal = 'dashboard'; render();
    });
    app.querySelector('[data-delete-request-event]')?.addEventListener('click', async () => {
      const requests = read('sg-requests', []);
      requests.push({ team: selectedEvent.team, date: selectedEvent.date,
        from: selectedEvent.from, to: selectedEvent.to, place: selectedEvent.place,
        capacity: capacityForType(selectedEvent.type), note: 'Löschung beantragt',
        status: 'beantragt', action: 'delete', targetId: selectedEvent.id });
      try { await write('sg-requests', requests); modal = null; render(); }
      catch (error) { alert(`Löschantrag fehlgeschlagen: ${error.message}`); }
    });
  }
  try {
    savedBfv = await window.Cloud.initialize();
    role = window.Cloud.role();
    bfvMessage = savedBfv.importedAt ? bfvSummary(savedBfv) : 'BFV-Daten sind noch nicht importiert';
    if (window.Cloud.needsPasswordSetup) modal = 'set-password';
    render();
  } catch (error) {
    app.innerHTML = `<main class="wrap"><h1>Platzbelegungsplan vorübergehend nicht verfügbar</h1><p>Die gemeinsamen Daten konnten nicht geladen werden. Bitte später erneut versuchen.</p><p class="access-note">${esc(error.message)}</p></main>`;
  }
}());
