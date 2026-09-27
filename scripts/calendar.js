(async function () {
  const { places, trainingRules, mowingDates, bfvGames } = window.AppData;
  const app = document.getElementById('app');
  const bfv = window.BfvData;
  const language = window.PublicLanguage;
  const t = (key, fallback) => language?.t(key) || fallback;
  const publicCategory = (value) => language?.category(value) || value;
  const publicTeam = (value) => value === 'Bogenschützen' ? t('archers', value) : value;
  const publicCapacityLabel = (type) => type === 'halb' ? t('halfPitch', '1/2 Platz') : type === 'archery' ? t('archeryHalf', '1/2 C-Platz · Hinweis') : type === 'vorplatz' ? t('forecourt', 'Vorplatz') : type === 'special' ? t('closure', 'Sperre') : t('fullPitch', '1/1 Platz');
  const publicPlace = (place) => language?.place(place) || `${place}-Platz`;
  const displayDayName = (date) => language?.weekday((date.getDay() + 6) % 7) || dayName(date);
  let savedBfv = null;
  const bfvSummary = (snapshot) => `BFV: ${snapshot.games.filter((game) => game.status === 'Heimspiel').length} ${t('bfvHome', 'Heimspiele am Ort')} · ${snapshot.games.filter((game) => game.status === 'Ort offen').length} ${t('bfvUnknown', 'ohne Ortsangabe')} · ${t('asOf', 'Stand')} ${new Date(snapshot.importedAt).toLocaleString(language?.current() === 'en' ? 'en-GB' : language?.current() === 'es' ? 'es-ES' : 'de-DE', { timeZone: 'Europe/Berlin' })}`;
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
  const capacity = (type) => type === 'halb' ? .5 : ['vorplatz', 'archery'].includes(type) ? 0 : 1;
  const capacityLabel = (type) => type === 'halb' ? '1/2 Platz' : type === 'archery' ? '1/2 C-Platz · Hinweis' : type === 'vorplatz' ? 'Vorplatz' : type === 'special' ? 'Sperre' : '1/1 Platz';
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
  function requestedEvents(date) { return read('sg-requests', []).filter((item) => item.date === iso(date)).map((item, index) => ({ id: `request-${item.id || index}`, team: item.team, from: item.from, to: item.to, place: item.place, originalPlace: item.place, type: typeForCapacity(item.capacity), category: item.status === 'freigegeben' ? ({ training: 'Training', league: 'Liga', cup: 'Pokal', friendly: 'Freundschaftsspiel' }[item.kind] || 'Sondertermin') : 'Beantragter Termin', organization: item.organization || 'other', kind: item.kind || 'other', note: item.note || (item.status === 'freigegeben' ? 'Freigegeben' : 'Beantragt'), source: 'Abteilungsleitung', pending: item.status !== 'freigegeben', manual: item.status === 'freigegeben', requestStatus: item.status })); }
  function blockEvents(date) { return read('sg-blocks', []).filter((item) => item.fromDate <= iso(date) && item.toDate >= iso(date)).map((item, index) => ({ id: `block-${item.id || index}`, team: item.title || 'Platz gesperrt', from: '09:00', to: '22:00', place: item.place, originalPlace: item.place, type: 'special', category: 'Platzsperre', note: item.scope, scope: item.scope, source: 'Platzwart', allDay: true })); }
  function archeryEvents(date) {
    if (date.getMonth() < 3 || date.getMonth() > 8 || !['Mi', 'Fr'].includes(dayName(date))) return [];
    return [{ id: `archery-${iso(date)}`, team: 'Bogenschützen', from: '17:30', to: '19:00',
      place: 'C', originalPlace: 'C', type: 'archery', side: 1, category: 'Bogenschützen-Training',
      source: 'Vereinbarte Bogenschützenzeiten',
      note: 'Sperrzone auf einer Platzhälfte. Fußballtraining darf parallel stattfinden; Liga-, Pokal- und Freundschaftsspiele haben Vorrang.' }];
  }
  function rawEvents(date) {
    const games = bfvGames.filter((game) => game.date === iso(date)).map((game) => ({ id: game.id, uid: game.uid, team: game.source === 'Atletico Ü32' ? `${game.name} (Ü32)` : game.name, from: game.from, to: game.to, place: 'A', originalPlace: 'A', type: 'game', category: game.category, note: `${game.category} · ${game.status}`, source: `BFV-iCal · ${game.source}`, location: game.location, unresolved: game.status === 'Ort offen' }));
    const training = trainingRules.filter((row) => row[1] === dayName(date)).map(([team, , from, to, place, type]) => ({ id: `standard-${team}-${iso(date)}-${from}`, team, from, to, place, originalPlace: place, type, category: 'Training', source: 'Standardtrainingsplan' }));
    const deleted = new Set(read('sg-deletions', [])), overrides = read('sg-overrides', {}), base = [...blockEvents(date), ...games, ...requestedEvents(date), ...training, ...archeryEvents(date)];
    const officialById = new Map(bfvGames.map((game) => [game.id, game]));
    const manualState = (id, override) => ({
      manual: true,
      idConflict: officialById.has(id) && (
        override.date !== officialById.get(id).date ||
        override.from !== officialById.get(id).from ||
        override.to !== officialById.get(id).to),
      bfvMissing: id.startsWith('bfv-') && !officialById.has(id),
      bfvOfficial: officialById.get(id) || null
    });
    const current = base.filter((event) => !overrides[event.id] || !overrides[event.id].date || overrides[event.id].date === iso(date)).map((event) => overrides[event.id] ? { ...event, ...overrides[event.id], originalPlace: event.originalPlace, source: `${event.source} · administrativ geändert`, ...manualState(event.id, overrides[event.id]) } : event);
    const movedHere = Object.entries(overrides).filter(([id, override]) => override.date === iso(date) && !base.some((event) => event.id === id)).map(([id, override]) => ({ id, ...override, originalPlace: override.originalPlace || 'nicht festgelegt', category: 'Administrativ geänderter Termin', source: 'Administrator', ...manualState(id, override) }));
    return [...current, ...movedHere].filter((event) => !deleted.has(event.id));
  }
  function placementsFor(date) {
    const limit = sunsetFor(date).minutes - 15, assigned = [];
    const priority = { special: 4, game: 3, voll: 2, halb: 2, vorplatz: 1, archery: 0 };
    const rank = (event) => event.type === 'special' ? 4 : event.id.startsWith('bfv-') || event.type === 'game' ? 3 : event.manual ? 2.5 : priority[event.type] || 0;
    rawEvents(date).sort((a, b) => rank(b) - rank(a) || mins(a.from) - mins(b.from)).forEach((event) => {
      if (event.type === 'archery') {
        if (assigned.some((other) => other.place === 'C' && other.type === 'special' && other.scope === 'Ganz gesperrt')) return;
        event.archeryGame = assigned.some((other) => other.place === 'C' && other.type === 'game' && overlaps(event, other));
        if (event.archeryGame) event.note = 'Spiel hat Vorrang. Bogenschützentraining nur nach Abstimmung möglich.';
        assigned.push(event);
        return;
      }
      if (event.type === 'special' || event.type === 'vorplatz' || event.unresolved) { assigned.push(event); return; }
      const needsLight = event.place === 'A' && mins(event.to) > limit;
      if (event.manual) {
        if (needsLight || !fits(event, event.place, assigned)) {
          event.overbooked = true;
          event.note = `${event.category} · manuelle Platzwahl prüfen (${needsLight ? 'A-Platz ohne Flutlicht' : 'keine freie Kapazität'})`;
        }
        if (event.type === 'halb') event.side = assigned.filter((other) => other.place === event.place && other.type === 'halb' && overlaps(event, other)).length % 2;
        assigned.push(event);
        return;
      }
      let candidates = needsLight ? ['B', 'C'] : [event.place, ...places.filter((place) => place !== event.place && (place !== 'A' || mins(event.to) <= limit))];
      const target = candidates.find((place) => fits(event, place, assigned));
      if (target) {
        event.place = target;
        if (target !== event.originalPlace) event.note = `${event.category} · ${needsLight ? 'Flutlicht' : 'Kapazität'}: von ${event.originalPlace} nach ${target}`;
      } else { event.overbooked = true; event.note = `${event.category} · keine freie Kapazität`; }
      if (event.type === 'halb') event.side = assigned.filter((other) => other.place === event.place && other.type === 'halb' && overlaps(event, other)).length % 2;
      assigned.push(event);
    });
    const archery = assigned.filter((event) => event.type === 'archery');
    assigned.filter((event) => event.place === 'C' && ['voll', 'game'].includes(event.type))
      .forEach((event) => { event.archeryParallel = archery.some((other) => overlaps(event, other)); });
    return assigned;
  }
  const eventsFor = (date, place) => placementsFor(date).filter((event) => event.place === place);
  function lane(date, place) {
    const sun = sunsetFor(date), endLimit = sun.minutes - 15, endLabel = `${String(Math.floor(endLimit / 60)).padStart(2, '0')}:${String(endLimit % 60).padStart(2, '0')}`;
    const entries = eventsFor(date, place).map((event) => { const classes = ['event', event.type]; if (event.side) classes.push('right'); if (event.archeryParallel) classes.push('archery-parallel'); if (event.archeryGame) classes.push('archery-game'); if (event.manual) classes.push('manual'); if (event.pending) classes.push('pending'); if (event.unresolved || event.overbooked || event.idConflict || event.bfvMissing) classes.push('unresolved'); return `<button class="${classes.join(' ')}" data-event="${esc(event.id)}" data-date="${iso(date)}" style="top:${timeTop(event.from)}%;height:${timeHeight(event.from, event.to)}%"><b>${esc(publicTeam(event.team))}</b><span>${esc(event.from)}–${esc(event.to)} · ${publicCapacityLabel(event.type)}${event.archeryGame ? ` · ${t('gamePriority', 'Spielvorrang')}` : ''}</span></button>`; }).join('');
    return `<section class="lane"><span class="place-title">${publicPlace(place)}${place === 'A' ? ` · ${t('noLights', 'ohne Flutlicht')} · ${t('latest', 'Ende bis')} ${endLabel}` : ` · ${t('lights', 'Flutlicht')}`}</span><span class="sunset" style="top:${timeTop(sun.label)}%"><i></i> ${sun.label}</span>${entries || `<span class="free">${t('free', 'frei')}</span>`}</section>`;
  }
  function dayDetail(date) { const mow = mowingDates.has(iso(date)); const note = (window.Cloud.mowing || []).find((item) => item.date === iso(date))?.note; return `<article class="day-row"><div class="day-label"><b>${displayDayName(date)}</b><span>${fmtDate(date)}</span></div><div class="mow ${mow ? '' : 'empty'}">${mow ? `${t('cityMows', 'Stadt mäht')}${note ? ` · ${esc(note)}` : ''}` : ''}</div><div class="timeline"><div class="time-scale">${hourMarks.map((mark, i) => `<span style="top:${i * 100 / 13}%">${mark}</span>`).join('')}</div><div class="lanes">${places.map((place) => lane(date, place)).join('')}</div></div></article>`; }
  function mobileDay(date) {
    const events = placementsFor(date), sun = sunsetFor(date), latest = sun.minutes - 15;
    const latestLabel = `${String(Math.floor(latest / 60)).padStart(2, '0')}:${String(latest % 60).padStart(2, '0')}`;
    const mow = mowingDates.has(iso(date));
    const note = (window.Cloud.mowing || []).find((item) => item.date === iso(date))?.note;
    return `<article class="mobile-day"><header><div><strong>${displayDayName(date)} · ${fmtDate(date)}</strong><span>${t('sunset', 'Sonnenuntergang')} ${sun.label} · ${publicPlace('A')} ${t('until', 'bis')} ${latestLabel}</span></div>${mow ? `<b class="mobile-mow">${t('cityMows', 'Stadt mäht')}${note ? ` · ${esc(note)}` : ''}</b>` : ''}</header>${places.map((place) => {
      const entries = events.filter((event) => event.place === place).sort((a, b) => mins(a.from) - mins(b.from));
      return `<section class="mobile-place"><h3>${publicPlace(place)} <small>${place === 'A' ? t('noLights', 'ohne Flutlicht') : t('withLights', 'mit Flutlicht')}</small></h3>${entries.length ? entries.map((event) => `<button class="mobile-event ${event.type}${event.manual ? ' manual' : ''}${event.pending ? ' pending' : ''}${event.unresolved || event.overbooked || event.idConflict || event.bfvMissing ? ' unresolved' : ''}" data-event="${esc(event.id)}" data-date="${iso(date)}"><span class="mobile-event-time">${event.from}–${event.to}</span><span class="mobile-event-title">${esc(publicTeam(event.team))}</span><span class="mobile-event-meta">${esc(publicCategory(event.category))} · ${publicCapacityLabel(event.type)}${event.archeryGame ? ` · ${t('gamePriority', 'Spielvorrang')}` : event.idConflict || event.bfvMissing ? ` · ${t('bfvCheck', 'BFV-Abgleich nötig')}` : event.overbooked ? ` · ${t('conflict', 'Konflikt')}` : ''}</span></button>`).join('') : `<p class="mobile-free">${t('noBookings', 'Keine Belegung')}</p>`}</section>`;
    }).join('')}</article>`;
  }
  function weekDetail(week) { const weekStart = addDays(start, week * 7); return `<div class="week-detail"><div class="desktop-week-detail">${Array.from({ length: 7 }, (_, i) => dayDetail(addDays(weekStart, i))).join('')}</div><div class="mobile-week-detail">${Array.from({ length: 7 }, (_, i) => mobileDay(addDays(weekStart, i))).join('')}</div></div>`; }
  function weeksMarkup() { const weekNo = (date) => { const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); return Math.ceil((((d - new Date(Date.UTC(d.getUTCFullYear(), 0, 1))) / 86400000) + 1) / 7); }; return `<div class="weeks-intro"><span class="eyebrow">${t('publicWeeks', 'Öffentliche Wochenansicht')}</span><p>${t('weekIntro', 'Die sechs Wochen beginnen mit der aktuell laufenden Kalenderwoche.')}</p></div><div class="weeks">${Array.from({ length: 6 }, (_, week) => { const ws = addDays(start, week * 7), we = addDays(ws, 6), open = openWeek === week; return `<section class="week ${open ? 'is-open' : ''}"><button class="week-toggle" data-week="${week}" aria-expanded="${open}"><span><small>${t('week', 'Kalenderwoche')} ${weekNo(ws)}</small><b>${fmtDate(ws)} – ${fmtDate(we)} · ${ws.getFullYear()}</b></span><span class="toggle-state">${open ? t('closeWeek', 'Übersicht schließen −') : t('openWeek', 'Übersicht öffnen +')}</span></button>${open ? weekDetail(week) : ''}</section>`; }).join('')}</div>`; }
  function calendarMarkup() { const week = openWeek === null ? 0 : openWeek, ws = addDays(start, week * 7); return `<section class="calendar-panel"><div class="calendar-heading"><h2>${fmtDate(ws)} – ${fmtDate(addDays(ws, 6))}</h2><div class="week-nav"><button data-shift="-1" ${week === 0 ? 'disabled' : ''}>←</button><button data-shift="1" ${week === 5 ? 'disabled' : ''}>→</button></div></div><div class="calendar-grid">${Array.from({ length: 7 }, (_, i) => { const date = addDays(ws, i), entries = placementsFor(date).map((event) => `<li class="${event.type}${event.manual ? ' manual' : ''}${event.pending ? ' pending' : ''}${event.unresolved || event.overbooked || event.idConflict || event.bfvMissing ? ' unresolved' : ''}"><button class="calendar-event-button" data-event="${esc(event.id)}" data-date="${iso(date)}"><b>${event.from}</b> ${esc(publicTeam(event.team))}<span>${event.place} · ${publicCapacityLabel(event.type)}${event.archeryGame ? ` · ${t('gamePriority', 'Spielvorrang')}` : event.idConflict || event.bfvMissing ? ` · ${t('bfvCheck', 'BFV-Abgleich nötig')}` : ''}</span></button></li>`); const mow = mowingDates.has(iso(date)); const note = (window.Cloud.mowing || []).find((item) => item.date === iso(date))?.note; return `<article class="calendar-day"><header><b>${displayDayName(date)}</b><span>${fmtDate(date)}</span></header>${mow ? `<p class="mow-note">${t('cityMows', 'Stadt mäht')}${note ? ` · ${esc(note)}` : ''}</p>` : ''}<ul>${entries.join('') || `<li class="empty-day">${t('noBookings', 'Keine Belegung')}</li>`}</ul></article>`; }).join('')}</div></section>`; }
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
    const kind = item.kind || '';
    const kindField = (item.action || 'new') === 'new'
      ? `<label>Terminart für die Statistik<select name="kind" required><option value="" disabled ${!kind ? 'selected' : ''}>Bitte wählen</option><option value="training" ${kind === 'training' ? 'selected' : ''}>Training</option><option value="league" ${kind === 'league' ? 'selected' : ''}>Ligaspiel</option><option value="cup" ${kind === 'cup' ? 'selected' : ''}>Pokalspiel</option><option value="friendly" ${kind === 'friendly' ? 'selected' : ''}>Freundschaftsspiel</option><option value="other" ${kind === 'other' ? 'selected' : ''}>Sonstiges</option></select></label>`
      : `<input type="hidden" name="kind" value="${esc(kind || 'other')}">`;
    const organization = item.organization || '';
    const organizationField = (item.action || 'new') === 'new'
      ? `<label>Zugehörigkeit für die Statistik<select name="organization" required><option value="" disabled ${!organization ? 'selected' : ''}>Bitte wählen</option><option value="fcd" ${organization === 'fcd' ? 'selected' : ''}>FC Dechsendorf</option><option value="atletico" ${organization === 'atletico' ? 'selected' : ''}>Atletico Erlangen</option><option value="other" ${organization === 'other' ? 'selected' : ''}>Sonstige / extern</option></select></label>`
      : `<input type="hidden" name="organization" value="${esc(organization || 'other')}">`;
    const formIndex = index === '' ? (item._index ?? '') : index;
    return `<form data-request-form><input type="hidden" name="index" value="${formIndex}"><input type="hidden" name="id" value="${esc(item.id || '')}"><input type="hidden" name="action" value="${esc(item.action || 'new')}"><input type="hidden" name="targetId" value="${esc(item.targetId || '')}"><label>Bezeichnung${teamField}</label><div class="form-grid"><label>Datum${dateField}</label><label>Platz<select name="place" data-place>${places.map((option) => `<option ${place === option ? 'selected' : ''}>${option}</option>`).join('')}</select></label><label>Beginn${timeField('from', item.from)}</label><label>Ende${timeField('to', item.to)}</label><label>Platzbedarf${capacityField}</label></div>${kindField}${organizationField}${fixedGame ? '<p class="access-note">BFV-Spiel: Datum und Uhrzeit sind fest; nur der Platz kann verlegt werden.</p>' : ''}<label>Hinweis<textarea name="note" rows="3">${esc(item.note)}</textarea></label><button class="primary">${role === 'admin' ? 'Übernehmen' : 'Beantragen'}</button></form>`;
  }
  const movePreset = () => selectedEvent ? ({ ...selectedEvent, capacity: capacityForType(selectedEvent.type), action: 'move', targetId: selectedEvent.id, note: `Verlegung beantragt. ${selectedEvent.note || ''}` }) : {};
  const organizationOptions = (selected = '') => [['fcd', 'FC Dechsendorf'], ['atletico', 'Atletico Erlangen'], ['other', 'Sonstige / extern']]
    .map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
  function dashboardMarkup() { const requests = read('sg-requests', []).map((item, index) => ({ item, index })).filter(({ item }) => item.status === 'beantragt'); const manager = role === 'manager'; return `<section class="modal-card admin"><button class="close" data-close>×</button><span class="eyebrow">${manager ? 'Abteilungsleitung' : 'Administrator'}</span><h2>Terminverwaltung</h2>${manager ? requestForm(selectedEvent?.requestAction === 'move' ? movePreset() : {}) : `<div class="request-list">${requests.length ? requests.map(({ item, index }) => `<article><b>${esc(item.team)}</b><span>${esc(item.date)} · ${esc(item.from)}–${esc(item.to)} · ${esc(item.place)} · ${esc(item.capacity)} · ${esc(item.status)}</span><p>${esc(item.note || 'Kein Hinweis')}</p><button data-edit-request="${index}">Bearbeiten</button> <button data-approve="${index}">Übernehmen</button> <button data-delete-request="${index}">Löschen</button></article>`).join('') : '<p>Keine offenen Beantragungen.</p>'}</div><h3>Platzwart: Sperre eintragen</h3><form data-block-form><div class="form-grid"><label>Platz<select name="place">${places.map((place) => `<option>${place}</option>`).join('')}</select></label><label>Art<select name="scope"><option>Ganz gesperrt</option><option>Halbseitig gesperrt</option><option>Teilbereiche gesperrt</option></select></label><label>Von<input name="fromDate" type="date" required></label><label>Bis<input name="toDate" type="date" required></label></div><label>Bezeichnung<input name="title" placeholder="z. B. Nachsaat C-Platz"></label><button class="secondary">Ganztägige Sperre speichern</button></form><h3>Mähtermin</h3><form data-mowing-form><div class="form-grid"><label>Datum<input name="date" type="date" required></label><label>Hinweis<input name="note" placeholder="z. B. voraussichtlich vormittags"></label></div><button class="secondary">Mähtermin speichern</button></form><div data-mowing-list></div><h3>Abteilungsleitung einladen</h3><form data-invite-manager><label>E-Mail-Adresse<input name="email" type="email" required></label><button class="secondary">Einladung senden</button></form><div data-manager-list></div>`}</section>`; }
  function sourceMarkup() {
    const items = bfv.sources(), snapshot = bfv.cached();
    return `<section class="modal-card admin"><button class="close" data-close>×</button><span class="eyebrow">Administrator</span><h2>BFV-iCal-Quellen</h2><p class="source-note">${esc(bfvMessage)}. Änderungen an Quellen werden gemeinsam gespeichert.</p><button class="secondary" data-refresh-bfv>Jetzt neu abrufen</button><div class="source-list">${items.map((item, index) => `<form data-source-form="${index}"><div class="source-heading"><b>${esc(item.team)}</b><span>${item.row ? `Excel-Zeile ${item.row}` : 'Neu hinzugefügt'}</span></div><label>Mannschaft<input name="team" value="${esc(item.team)}" required></label><label>Zugehörigkeit<select name="organization" required>${organizationOptions(item.organization)}</select></label><label>BFV-iCal-Link<input name="url" type="url" value="${esc(item.url)}" required></label><label class="checkline"><input name="active" type="checkbox" ${item.active ? 'checked' : ''}>Aktiv (deaktivieren bei Abmeldung)</label><button class="secondary">Quelle speichern</button></form>`).join('')}</div><h3>Mannschaft / iCal-Quelle hinzufügen</h3><form data-new-source><label>Mannschaft<input name="team" required></label><label>Zugehörigkeit<select name="organization" required><option value="" selected disabled>Bitte wählen</option>${organizationOptions()}</select></label><label>BFV-iCal-Link<input name="url" type="url" placeholder="https://service.bfv.de/rest/icsexport/Spielplan?..." required></label><button class="primary">Hinzufügen und abrufen</button></form>${snapshot?.errors?.length ? `<p class="source-error">${snapshot.errors.length} Quelle(n) konnten beim letzten Abruf nicht geladen werden.</p>` : ''}</section>`;
  }
  function validBfvUrl(value) { try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'service.bfv.de' && url.pathname === '/rest/icsexport/Spielplan' && url.searchParams.has('staffel') && url.searchParams.has('id'); } catch { return false; } }
  async function refreshBfv() {
    bfvMessage = 'BFV-Daten werden geladen'; render();
    try { savedBfv = await window.Cloud.refreshBfv(); bfvMessage = bfvSummary(savedBfv); }
    catch (error) { bfvMessage = `BFV-Abruf fehlgeschlagen: ${error.message}`; }
    render();
  }
  const detailScope = (value) => ({
    'Ganz gesperrt': t('fullClosure', value),
    'Halbseitig gesperrt': t('halfClosure', value),
    'Teilbereiche gesperrt': t('partialClosure', value)
  }[value] || value);
  function detailSource(value) {
    if (!value) return '';
    const changed = value.endsWith(' · administrativ geändert');
    const original = changed ? value.slice(0, -' · administrativ geändert'.length) : value;
    const source = {
      Standardtrainingsplan: t('standardSource', original),
      'Vereinbarte Bogenschützenzeiten': t('archerySource', original),
      Abteilungsleitung: t('managerSource', original),
      Platzwart: t('groundskeeperSource', original)
    }[original] || original;
    return changed ? `${source} · ${t('adminChanged', 'administrativ geändert')}` : source;
  }
  function detailNote(event) {
    const value = event.note || '';
    if (event.type === 'archery') return t(event.archeryGame ? 'archeryGameNote' : 'archeryNote', value);
    if (!value) return t('regularBooking', 'Standardbelegung');
    const exact = {
      Freigegeben: 'approved', Beantragt: 'requested',
      'Ganz gesperrt': 'fullClosure', 'Halbseitig gesperrt': 'halfClosure', 'Teilbereiche gesperrt': 'partialClosure'
    }[value];
    if (exact) return t(exact, value);
    if (value.startsWith('Verlegung beantragt.')) return `${t('moveRequested', 'Verlegung beantragt.')}${value.slice('Verlegung beantragt.'.length)}`;
    if (event.id.startsWith('bfv-')) {
      const bfv = value.match(/^(.*?) · (Heimspiel|Ort offen)$/);
      if (bfv) return `${publicCategory(bfv[1])} · ${t(bfv[2] === 'Heimspiel' ? 'homeMatch' : 'venueUnknown', bfv[2])}`;
    }
    const moved = value.match(/^(.*?) · (Flutlicht|Kapazität): von ([ABC]) nach ([ABC])$/);
    if (moved) return `${publicCategory(moved[1])} · ${t(moved[2] === 'Flutlicht' ? 'detailFloodlights' : 'capacityReason', moved[2])}: ${t('movedFrom', 'von')} ${moved[3]} ${t('movedTo', 'nach')} ${moved[4]}`;
    const crowded = value.match(/^(.*?) · keine freie Kapazität$/);
    if (crowded) return `${publicCategory(crowded[1])} · ${t('noCapacity', 'keine freie Kapazität')}`;
    const manual = value.match(/^(.*?) · manuelle Platzwahl prüfen \((A-Platz ohne Flutlicht|keine freie Kapazität)\)$/);
    if (manual) return `${publicCategory(manual[1])} · ${t('checkManualPlace', 'manuelle Platzwahl prüfen')} (${t(manual[2] === 'A-Platz ohne Flutlicht' ? 'noLightsReason' : 'noCapacity', manual[2])})`;
    return value;
  }
  function eventMarkup(event) {
    const editable = role === 'admin' && event.type !== 'archery', requestable = role === 'manager' && event.type !== 'archery';
    const sun = sunsetFor(new Date(`${event.date}T12:00:00`));
    const bfvCheck = event.idConflict
      ? `<p class="bfv-conflict">${t('bfvMismatch', 'BFV-Abgleich nötig: Datum oder Uhrzeit der manuellen Fassung weichen bei gleicher BFV-ID vom aktuellen BFV-Spiel ab. Der manuelle Termin bleibt erhalten. BFV meldet:')} ${esc(event.bfvOfficial.date)} · ${esc(event.bfvOfficial.from)}–${esc(event.bfvOfficial.to)}. ${t('bfvNoPlace', 'Eine BFV-Platznummer wird nicht übernommen.')}</p>`
      : event.bfvMissing
        ? `<p class="bfv-conflict">${t('bfvGone', 'BFV-Abgleich nötig: Die ID dieses manuell geänderten Spiels fehlt im aktuellen BFV-Abruf. Der manuelle Termin bleibt erhalten.')}</p>`
        : '';
    const moveDescription = () => language?.moveDescription(event.originalPlace, event.manual)
      || `${event.manual ? 'manuell' : 'automatisch'} von ${event.originalPlace} verlegt`;
    const bfvGame = event.id.startsWith('bfv-');
    const idInfo = bfvGame ? `<dt>BFV-ID</dt><dd>${esc(event.uid || event.bfvOfficial?.uid || event.id.slice(4))}</dd><dt>${t('bfvPlace', 'BFV-Platzangabe')}</dt><dd>${t('bfvPlaceInfo', 'Für unsere Platzverteilung nicht maßgeblich; der Platz wird nach Vereinsregeln festgelegt.')}</dd>` : '';
    const placeOrigin = bfvGame ? t('detailStartPlace', 'Planungsstart') : t('detailOriginalPlace', 'Ursprünglicher Platz');
    const requirement = event.type === 'special' ? esc(event.scope ? detailScope(event.scope) : t('closure', 'Sperre')) : event.type === 'archery' ? t('archeryZone', 'Vereinbarte Sperrzone auf 1/2 C-Platz · Fußballtraining parallel möglich') : `${publicCapacityLabel(event.type)} (${capacity(event.type)} ${t('pitchCapacity', 'Platzkapazität')})`;
    return `<section class="modal-card"><button class="close" data-close aria-label="${t('close', 'Schließen')}">×</button><span class="eyebrow">${esc(publicCategory(event.category))}</span><h2>${esc(publicTeam(event.team))}</h2>${bfvCheck}<dl><dt>${t('detailDate', 'Datum')}</dt><dd>${esc(event.date)}</dd><dt>${t('detailTime', 'Zeit')}</dt><dd>${esc(event.from)}–${esc(event.to)}</dd><dt>${t('detailPlace', 'Platz')}</dt><dd>${esc(event.place)}${event.place !== event.originalPlace ? ` · ${esc(moveDescription())}` : ''}</dd><dt>${placeOrigin}</dt><dd>${esc(event.originalPlace || t('notSet', 'nicht festgelegt'))}</dd><dt>${t('detailCapacity', 'Platzbedarf')}</dt><dd>${requirement}</dd><dt>${t('detailFloodlights', 'Flutlicht')}</dt><dd>${event.place === 'A' ? `${t('noSunset', 'Nein · Sonnenuntergang')} ${sun.label}` : t('yesAvailable', 'Ja verfügbar')}</dd><dt>${t('detailVenue', 'Ort')}</dt><dd>${esc(event.location || 'Sportanlage Dechsendorf')}</dd>${idInfo}<dt>${t('detailSource', 'Quelle')}</dt><dd>${esc(detailSource(event.source))}</dd><dt>${t('detailStatus', 'Status')}</dt><dd>${esc(detailNote(event))}</dd></dl>${editable ? `<div class="modal-actions">${event.type === 'special' ? '' : `<button class="primary" data-edit-event>${t('editEvent', 'Termin bearbeiten')}</button>`}<button class="secondary" data-delete-event-direct>${event.type === 'special' ? t('removeClosure', 'Sperre entfernen') : t('deleteEvent', 'Termin löschen')}</button></div>` : requestable && event.type !== 'special' ? `<div class="modal-actions"><button class="primary" data-move-request>${t('requestMove', 'Verlegung beantragen')}</button><button class="secondary" data-delete-request-event>${t('requestDeletion', 'Löschung beantragen')}</button></div>` : `<p class="access-note">${event.type === 'archery' ? t('archeryInfo', 'Saisonaler Hinweisblock; Liga-, Pokal- und Freundschaftsspiele haben Vorrang.') : t('signInToEdit', 'Für Änderungen bitte anmelden.')}</p>`}</section>`;
  }
  const eventEditPreset = () => {
    if (!selectedEvent) return {};
    if (selectedEvent.id.startsWith('request-')) {
      const requestIndex = read('sg-requests', []).findIndex((item) => `request-${item.id}` === selectedEvent.id);
      if (requestIndex !== -1) return { ...read('sg-requests', [])[requestIndex], _index: requestIndex };
    }
    return { ...selectedEvent, capacity: capacityForType(selectedEvent.type), action: 'override', targetId: selectedEvent.id };
  };
  function modalMarkup() { if (!modal) return ''; if (modal === 'set-password') return `<section class="modal-card login"><span class="eyebrow">Zugang aktivieren</span><h2>Eigenes Passwort festlegen</h2><form data-set-password><label>Neues Passwort<input name="password" type="password" minlength="12" autocomplete="new-password" required></label><label>Wiederholung<input name="confirm" type="password" minlength="12" autocomplete="new-password" required></label><button class="primary">Passwort speichern</button></form></section>`; if (modal === 'manager' || modal === 'admin') return loginMarkup(modal); if (modal === 'dashboard') return dashboardMarkup(); if (modal === 'bfv-sources' && role === 'admin') return sourceMarkup(); if (modal === 'new-event') return `<section class="modal-card"><button class="close" data-close>×</button><span class="eyebrow">${role === 'admin' ? 'Administrator' : 'Abteilungsleitung'}</span><h2>Neuer Termin</h2>${requestForm()}</section>`; if (modal === 'event-edit') return `<section class="modal-card"><button class="close" data-close>×</button><span class="eyebrow">Administrator</span><h2>Termin direkt bearbeiten</h2>${requestForm(eventEditPreset())}</section>`; if (modal === 'event' && selectedEvent) return eventMarkup(selectedEvent); if (modal === 'request-edit') return `<section class="modal-card"><button class="close" data-close>×</button><span class="eyebrow">Administrator</span><h2>Beantragung bearbeiten</h2>${requestForm(read('sg-requests', [])[selectedRequest], selectedRequest)}</section>`; return ''; }
  const roleName = (value) => ({ admin: 'Administrator', manager: 'Abteilungsleitung', board: 'Vorstand', disabled: 'Gesperrt' }[value] || value);
  const lastLogin = (value) => value ? new Date(value).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'short' }) : 'Noch nie angemeldet';
  function usersMarkup() {
    return `<section class="modal-card admin users-panel"><button class="close" data-close>×</button><span class="eyebrow">Administrator</span><h2>Zugänge verwalten</h2><p class="access-note">Einmallinks nur persönlich weitergeben. „Letzte Anmeldung“ ist kein letzter Seitenaufruf.</p><form data-user-invite><div class="form-grid"><label>E-Mail-Adresse<input name="email" type="email" required></label><label>Rolle<select name="role"><option value="manager">Abteilungsleitung</option><option value="board">Vorstand</option><option value="admin">Administrator (nur Hauptadministrator)</option></select></label></div><button class="primary">Einmallink erzeugen</button></form><div data-user-link hidden></div><h3>Bestehende Zugänge</h3><div data-users-list>Wird geladen …</div><h3>Eigenes Passwort</h3><form data-own-password><label>Neues Passwort<input name="password" type="password" minlength="12" autocomplete="new-password" required></label><label>Wiederholung<input name="confirm" type="password" minlength="12" autocomplete="new-password" required></label><button class="secondary">Eigenes Passwort ändern</button></form></section>`;
  }
  function showPrivateLink(target, link, email) {
    target.hidden = false;
    target.replaceChildren();
    const note = document.createElement('p');
    note.className = 'access-note';
    note.textContent = `Einmallink für ${email}: nur privat weitergeben. Wer ihn besitzt, kann das Konto aktivieren.`;
    const input = document.createElement('input');
    input.type = 'text'; input.readOnly = true; input.value = link;
    const copy = document.createElement('button');
    copy.type = 'button'; copy.className = 'secondary'; copy.textContent = 'Link kopieren';
    copy.onclick = async () => { try { await navigator.clipboard.writeText(link); copy.textContent = 'Kopiert'; } catch { input.select(); copy.textContent = 'Link markieren und kopieren'; } };
    target.append(note, input, copy);
  }
  function render() {
    const displayedBfv = bfvMessage.startsWith('BFV-Abruf fehlgeschlagen') ? bfvMessage : savedBfv?.importedAt ? bfvSummary(savedBfv) : bfvMessage === 'Gemeinsame Daten werden geladen' ? t('bfvLoading', bfvMessage) : bfvMessage === 'BFV-Daten sind noch nicht importiert' ? t('bfvMissing', bfvMessage) : bfvMessage;
    document.title = t('title', 'FC Dechsendorf - Platzbelegungsplan');
    app.innerHTML = `<main class="wrap"><header class="app-header"><div class="brand-lockup"><img class="club-logo" src="assets/fc-dechsendorf-logo.png" alt="Wappen des FC Dechsendorf"><div><span class="eyebrow">FC Dechsendorf</span><h1>${t('title', 'FC Dechsendorf - Platzbelegungsplan')}</h1><p>${t('subtitle', 'Standardtrainingsplan · öffentliche Übersicht')}</p></div></div><div class="status"><span></span> ${t('season', 'Saison')} 2026/27</div></header><div class="management-actions"><button data-open="manager">Abteilungsleitung</button><button data-open="admin">Administrator</button><a class="management-link" href="statistik.html">Vorstand</a>${role ? `<button data-new-event>Neuer Termin</button>${role === 'admin' ? '<button data-admin-panel>Beantragungen</button><button data-bfv-panel>iCal-Quellen</button>' : ''}<span>Angemeldet: ${role === 'admin' ? 'Administrator' : 'Abteilungsleitung'} <button data-logout>Abmelden</button></span>` : ''}<label class="language-picker"><span aria-hidden="true">🌐</span><select data-language aria-label="Sprache / Language / Idioma"><option value="de" ${language?.current() === 'de' || !language ? 'selected' : ''}>Deutsch</option><option value="en" ${language?.current() === 'en' ? 'selected' : ''}>English</option><option value="es" ${language?.current() === 'es' ? 'selected' : ''}>Español</option></select></label><button type="button" class="theme-toggle" data-theme-toggle aria-label="Darstellung wechseln" aria-pressed="false">🌙 Dunkel</button></div><p class="bfv-status">${esc(displayedBfv)}</p>${mowingDates.size ? '' : `<p class="mowing-status">${t('mowingEmpty', 'Mähplan: Noch keine Termine eingetragen.')}</p>`}<nav class="view-switch"><button data-view="weeks" class="${view === 'weeks' ? 'active' : ''}">${t('weeks', 'Wochenübersicht')}</button><button data-view="calendar" class="${view === 'calendar' ? 'active' : ''}">${t('calendar', 'Kalenderansicht')}</button></nav>${view === 'weeks' ? weeksMarkup() : calendarMarkup()}<footer>${t('legend', 'Grün: Standardtraining. Blau: BFV-Spiele. Gelb: manuell übernommene Termine und Änderungen. Lila: Sonderereignisse und Platzsperren. Orange gestrichelt: beantragt. Rot: Klärung erforderlich. Grau: Bogenschützen-Hinweis auf 1/2 C-Platz.')}</footer></main><div class="modal-backdrop ${modal ? 'show' : ''}">${modalMarkup()}</div>`;
    if (role === 'admin') app.querySelector('[data-bfv-panel]')?.insertAdjacentHTML?.('afterend', '<button data-users-panel>Zugänge</button>');
    app.querySelectorAll('[data-view]').forEach((button) => button.onclick = () => { view = button.dataset.view; render(); }); app.querySelectorAll('[data-week]').forEach((button) => button.onclick = () => { openWeek = openWeek === Number(button.dataset.week) ? null : Number(button.dataset.week); render(); }); app.querySelectorAll('[data-shift]').forEach((button) => button.onclick = () => { openWeek = Math.max(0, Math.min(5, openWeek + Number(button.dataset.shift))); render(); });
    app.querySelector('[data-language]')?.addEventListener('change', (event) => { language?.set(event.target.value); render(); });
    app.querySelectorAll('[data-open]').forEach((button) => button.onclick = () => { modal = button.dataset.open; render(); }); app.querySelectorAll('[data-close]').forEach((button) => button.onclick = () => { modal = null; render(); }); app.querySelector('[data-logout]')?.addEventListener('click', async () => { try { await window.Cloud.logout(); role = ''; render(); } catch (error) { alert(error.message); } });
    app.querySelectorAll('[data-event]').forEach((button) => button.onclick = () => { selectedEvent = placementsFor(new Date(`${button.dataset.date}T12:00:00`)).find((event) => event.id === button.dataset.event); if (selectedEvent) { selectedEvent.date = button.dataset.date; modal = 'event'; render(); } });
    if (modal === 'dashboard') {
      const oldInvite = app.querySelector('[data-invite-manager]');
      if (oldInvite) { oldInvite.previousElementSibling?.remove(); oldInvite.remove(); }
      app.querySelector('[data-manager-list]')?.remove();
    }
    if (modal === 'users') {
      app.querySelector('.modal-backdrop').innerHTML = usersMarkup();
      app.querySelector('[data-close]').onclick = () => { modal = null; render(); };
      const list = app.querySelector('[data-users-list]');
      const loadUsers = async () => {
        const result = await window.Cloud.manageUsers('list');
        app.querySelector('[data-user-invite] option[value="admin"]').hidden = !result.isOwner;
        list.innerHTML = result.users.map((user) => `<article class="user-row"><div><b>${esc(user.email)}</b><span>${user.owner ? 'Hauptadministrator · geschützt' : roleName(user.role)} · Letzte Anmeldung: ${esc(lastLogin(user.lastSignInAt))}</span></div><div class="user-actions">${user.owner || user.role === 'disabled' || (user.role === 'admin' && !result.isOwner) ? '' : `<select data-user-role="${esc(user.id)}"><option value="manager" ${user.role === 'manager' ? 'selected' : ''}>Abteilungsleitung</option><option value="board" ${user.role === 'board' ? 'selected' : ''}>Vorstand</option>${result.isOwner ? `<option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Administrator</option>` : ''}</select><button class="secondary" data-save-role="${esc(user.id)}">Rolle speichern</button><button class="secondary" data-recovery="${esc(user.id)}">Passwortlink</button><button class="secondary" data-disable="${esc(user.id)}">Zugang sperren</button>`}</div></article>`).join('') || '<p>Noch keine Zugänge.</p>';
        list.querySelectorAll('[data-save-role]').forEach((button) => button.onclick = async () => {
          try { await window.Cloud.manageUsers('role', { userId: button.dataset.saveRole, role: list.querySelector(`[data-user-role="${button.dataset.saveRole}"]`).value }); await loadUsers(); }
          catch (error) { alert(error.message); }
        });
        list.querySelectorAll('[data-recovery]').forEach((button) => button.onclick = async () => {
          try { const result = await window.Cloud.manageUsers('recovery', { userId: button.dataset.recovery }); showPrivateLink(app.querySelector('[data-user-link]'), result.actionLink, result.email); }
          catch (error) { alert(error.message); }
        });
        list.querySelectorAll('[data-disable]').forEach((button) => button.onclick = async () => {
          if (!confirm('Zugang sperren? Termine und Bearbeitungshistorie bleiben erhalten.')) return;
          try { await window.Cloud.manageUsers('disable', { userId: button.dataset.disable }); await loadUsers(); }
          catch (error) { alert(error.message); }
        });
      };
      loadUsers().catch((error) => { list.textContent = `Zugänge konnten nicht geladen werden: ${error.message}`; });
      app.querySelector('[data-user-invite]').onsubmit = async (event) => {
        event.preventDefault(); const values = new FormData(event.currentTarget);
        try { const result = await window.Cloud.manageUsers('invite', { email: String(values.get('email')), role: String(values.get('role')) }); showPrivateLink(app.querySelector('[data-user-link]'), result.actionLink, result.email); await loadUsers(); }
        catch (error) { alert(`Einladung fehlgeschlagen: ${error.message}`); }
      };
      app.querySelector('[data-own-password]').onsubmit = async (event) => {
        event.preventDefault(); const values = new FormData(event.currentTarget);
        if (values.get('password') !== values.get('confirm')) { alert('Passwörter stimmen nicht überein.'); return; }
        try { await window.Cloud.updatePassword(String(values.get('password'))); event.currentTarget.reset(); alert('Passwort geändert.'); }
        catch (error) { alert(`Passwortänderung fehlgeschlagen: ${error.message}`); }
      };
    }
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
    app.querySelector('[data-users-panel]')?.addEventListener('click', () => { modal = 'users'; render(); });
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
      items[index] = { ...items[index], team: String(data.get('team')).trim(), organization: String(data.get('organization')), url, active: data.has('active') };
      try { await bfv.saveSources(items); await refreshBfv(); }
      catch (error) { alert(`Quelle konnte nicht gespeichert werden: ${error.message}`); }
    }));
    app.querySelector('[data-new-source]')?.addEventListener('submit', async (event) => {
      event.preventDefault(); if (role !== 'admin') return;
      const data = new FormData(event.currentTarget), url = String(data.get('url')).trim();
      if (!validBfvUrl(url)) { alert('Bitte einen vollständigen BFV-Spielplan-Link mit staffel und id eingeben.'); return; }
      const items = bfv.sources(); items.push({ id: `manual-${Date.now()}`, team: String(data.get('team')).trim(), organization: String(data.get('organization')), url, active: true });
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
