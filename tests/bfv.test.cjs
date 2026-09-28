const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const scripts = path.join(__dirname, '..', 'scripts');

function appContext() {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
  const context = { Date, Intl, Map, Set, URL, localStorage: storage, sessionStorage: storage };
  context.window = context;
  vm.createContext(context);
  const run = (file) => vm.runInContext(fs.readFileSync(path.join(scripts, file), 'utf8'), context);
  run('bfv.js');
  run('game-title.js');
  run('schedule-filter.js');
  return { context, run, values };
}

const source = { id: 'excel-24', team: 'Atletico Ü32' };
function ics({ start, end, location, status = '' }) {
  return `BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:${start}\nDTEND:${end}\nSUMMARY:Atletico Erlangen-SV Tennenlohe\\, Meisterschaften\\, Kreisklasse 2\nLOCATION:${location}\nSTATUS:${status}\nUID:test-game\nEND:VEVENT\nEND:VCALENDAR`;
}

test('nur die vollständige Sportanlagenadresse zählt als Heimspiel', () => {
  const { context } = appContext();
  const venue = 'Sportanlage Erlangen Campingstrasse 38\\, Platz 2\\,Campingstr. 38\\,91056 Erlangen';
  const games = context.BfvData.parse(ics({ start: '20260925T170000Z', end: '20260925T184000Z', location: venue }), source);
  assert.equal(games.length, 1);
  assert.equal(games[0].status, 'Heimspiel');
  assert.equal(games[0].place, 'A'); // neutraler Planungsstart, nicht BFV-Platz 2
  assert.equal(games[0].uid, 'test-game');
  assert.equal(games[0].from, '19:00');
  assert.equal(games[0].to, '20:40');
  assert.equal(context.BfvData.homeLocation('Campingstr. 38, 91056 Erlangen'), false);
  assert.equal(context.BfvData.parse(ics({ start: '20260925T170000Z', end: '20260925T184000Z', location: 'Sportanlage Erlangen Sebastianstr. 2a, 91058 Erlangen' }), source).length, 0);
});

test('BFV-Platznummer 1, 2 oder 3 beeinflusst die Platzwahl nicht', () => {
  const { context } = appContext();
  for (const number of [1, 2, 3]) {
    const location = `Sportanlage Erlangen Campingstrasse 38\\, Platz ${number}\\,Campingstr. 38\\,91056 Erlangen`;
    const [game] = context.BfvData.parse(ics({ start: '20260925T100000Z', end: '20260925T110000Z', location }), source);
    assert.equal(game.id, 'bfv-test-game');
    assert.equal(game.place, 'A');
  }
});

test('BFV-Jugendspiel trägt die Mannschaft in der öffentlichen Terminüberschrift', async () => {
  const { context, run } = appContext();
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const date = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
  const app = { innerHTML: '', querySelectorAll: () => [], querySelector: () => null };
  context.document = { getElementById: () => app };
  run('data.js');
  context.AppData.bfvGames.push({ id: 'bfv-youth-heading', date, from: '12:00', to: '13:30',
    name: 'FC Dechsendorf-TSV Frauenaurach', source: 'E-Jugend', sourceIds: ['excel-13'],
    category: 'Pokal', status: 'Heimspiel', location: 'Sportanlage Erlangen Campingstrasse 38, 91056 Erlangen' });
  context.Cloud = { initialize: async () => ({ importedAt: null, games: [] }), role: () => '',
    read: (_, fallback) => fallback,
    sources: [{ id: 'excel-13', team: 'E-Jugend', organization: 'fcd' }] };
  run('calendar.js');
  await new Promise(setImmediate);
  assert.match(app.innerHTML, /FC Dechsendorf E-Jugend – TSV Frauenaurach/);
  assert.match(app.innerHTML, /data-event="bfv-youth-heading"/);
});

test('Erlanger Sommer- und Winterzeit sowie lokale iCal-Zeiten', () => {
  const { context } = appContext();
  const location = 'Sportanlage Erlangen Campingstrasse 38\\,91056 Erlangen';
  assert.equal(context.BfvData.parse(ics({ start: '20260925T170000Z', end: '20260925T184000Z', location }), source)[0].from, '19:00');
  assert.equal(context.BfvData.parse(ics({ start: '20261101T170000Z', end: '20261101T184000Z', location }), source)[0].from, '18:00');
  assert.equal(context.BfvData.parse(ics({ start: '20260925T190000', end: '20260925T204000', location }), source)[0].from, '19:00');
});

test('abgesagte Spiele werden nicht übernommen', () => {
  const { context } = appContext();
  assert.equal(context.BfvData.parse(ics({ start: '20260925T170000Z', end: '20260925T184000Z', location: 'Sportanlage Erlangen Campingstrasse 38\\,91056 Erlangen', status: 'CANCELLED' }), source).length, 0);
});

test('leere BFV-Platzhalter ohne Spielpaarung werden ignoriert', () => {
  const { context } = appContext();
  const placeholder = 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:19691206T112300\nDTEND:19691206T112300\nUID:placeholder\nEND:VEVENT\nEND:VCALENDAR';
  assert.equal(context.BfvData.parse(placeholder, source).length, 0);
});

test('Terminformular bietet Viertelstunden und Vorplatz', async () => {
  const { context, run } = appContext();
  const handlers = new Map();
  let insertedUserButton = '';
  const app = {
    innerHTML: '',
    querySelectorAll: () => [],
    querySelector: (selector) => ['[data-manager-list]', '[data-mowing-list]'].includes(selector) ? null :
      ({ addEventListener: (_, handler) => handlers.set(selector, handler),
        insertAdjacentHTML: (_, markup) => { if (selector === '[data-bfv-panel]') insertedUserButton = markup; } })
  };
  context.document = { getElementById: () => app };
  context.alert = () => {};
  run('data.js');
  context.Cloud = { initialize: async () => ({ importedAt: null, games: [] }), role: () => 'admin',
    read: (_, fallback) => fallback };
  run('calendar.js');
  await new Promise(setImmediate);
  assert.match(app.innerHTML, /FC Dechsendorf - Platzbelegungsplan/);
  assert.match(insertedUserButton, /data-users-panel>Zugänge<\/button>/);
  assert.ok(handlers.has('[data-users-panel]'));
  assert.match(app.innerHTML, /data-theme-toggle aria-label="Darstellung wechseln"/);
  assert.match(app.innerHTML, /mobile-week-detail/);
  assert.match(app.innerHTML, /mobile-day/);
  handlers.get('[data-new-event]')();
  assert.match(app.innerHTML, /<option value="00:15"/);
  assert.match(app.innerHTML, /<option value="23:45"/);
  assert.doesNotMatch(app.innerHTML, /<option value="00:01"/);
  assert.match(app.innerHTML, /value="vorplatz"/);
  assert.match(app.innerHTML, /Terminart für die Statistik/);
  assert.match(app.innerHTML, /Zugehörigkeit für die Statistik/);
  assert.match(app.innerHTML, /Sonstige \/ extern/);
  assert.match(app.innerHTML, /href="statistik.html">Vorstand<\/a>/);
});

test('Administrator sieht nur offene Beantragungen, mit originalen Listenindizes', async () => {
  const { context, run } = appContext();
  const handlers = new Map();
  const requests = [
    { id: 'approved', action: 'new', status: 'freigegeben', team: 'Bereits erledigt', date: '2026-10-01', from: '10:00', to: '11:00', place: 'A', capacity: '1/1' },
    { id: 'pending', action: 'new', status: 'beantragt', team: 'Noch offen', date: '2026-10-02', from: '10:00', to: '11:00', place: 'B', capacity: '1/2' }
  ];
  const app = {
    innerHTML: '', querySelectorAll: () => [],
    querySelector: (selector) => ['[data-invite-manager]', '[data-manager-list]', '[data-mowing-list]'].includes(selector)
      ? null : ({ addEventListener: (_, handler) => handlers.set(selector, handler) })
  };
  context.document = { getElementById: () => app };
  context.alert = () => {};
  run('data.js');
  context.Cloud = { initialize: async () => ({ importedAt: null, games: [] }), role: () => 'admin',
    read: (key, fallback) => key === 'sg-requests' ? requests : fallback };
  run('calendar.js');
  await new Promise(setImmediate);
  handlers.get('[data-admin-panel]')();
  const dashboard = app.innerHTML.split('<div class="modal-backdrop')[1];
  assert.doesNotMatch(dashboard, /Bereits erledigt/);
  assert.match(dashboard, /Noch offen/);
  assert.match(dashboard, /data-approve="1"/);
});

test('BFV-Spiel zeigt Ü32 und erlaubt eine Verlegung unter derselben BFV-ID', async () => {
  const { context, run } = appContext();
  const handlers = new Map();
  const gameButton = { dataset: { event: 'bfv-test-game', date: '2026-09-25' } };
  const app = {
    innerHTML: '',
    querySelectorAll: (selector) => selector === '[data-event]' ? [gameButton] : [],
    querySelector: (selector) => ['[data-manager-list]', '[data-mowing-list]'].includes(selector) ? null :
      ({ addEventListener: (_, handler) => handlers.set(selector, handler) })
  };
  context.document = { getElementById: () => app };
  context.alert = () => {};
  run('data.js');
  context.AppData.bfvGames.push({ id: 'bfv-test-game', uid: 'test-game', date: '2026-09-25', from: '19:00', to: '20:40', name: 'Atletico Erlangen-SV Tennenlohe', source: 'Atletico Ü32', category: 'Liga', status: 'Heimspiel', place: 'B', location: 'Sportanlage Erlangen Campingstrasse 38, Platz 2, 91056 Erlangen' });
  context.Cloud = { initialize: async () => ({ importedAt: null, games: [] }), role: () => 'admin',
    read: (_, fallback) => fallback };
  run('calendar.js');
  await new Promise(setImmediate);
  gameButton.onclick();
  assert.match(app.innerHTML, /Atletico Erlangen Ü32 – SV Tennenlohe/);
  assert.match(app.innerHTML, /BFV-ID<\/dt><dd>test-game/);
  assert.match(app.innerHTML, /BFV-Platzangabe<\/dt><dd>Für unsere Platzverteilung nicht maßgeblich/);
  handlers.get('[data-edit-event]')();
  assert.match(app.innerHTML, /BFV-Spiel-ID: test-game/);
  assert.match(app.innerHTML, /name="date" type="date" value="2026-09-25"/);
  assert.match(app.innerHTML, /<select name="to" required>/);
  assert.match(app.innerHTML, /<option value="20:40" selected>20:40 \(bisher\)<\/option>/);
  assert.match(app.innerHTML, /name="capacity" value="1\/1"/);
});

test('zwei bestätigte Jugendspiele können je 1/2 Platz gleichzeitig nutzen', async () => {
  const { context, run } = appContext();
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const date = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
  const gameButton = { dataset: { event: 'bfv-youth-one', date } };
  const handlers = new Map();
  const app = { innerHTML: '',
    querySelectorAll: (selector) => selector === '[data-event]' ? [gameButton] : [],
    querySelector: (selector) => ['[data-manager-list]', '[data-mowing-list]'].includes(selector) ? null :
      ({ addEventListener: (_, handler) => handlers.set(selector, handler) }) };
  context.document = { getElementById: () => app };
  run('data.js');
  const games = [
    { id: 'bfv-youth-one', uid: 'youth-one', source: 'D-Jugend', sourceIds: ['excel-12'], name: 'FC Dechsendorf-Gast 1' },
    { id: 'bfv-youth-two', uid: 'youth-two', source: 'E-Jugend', sourceIds: ['excel-13'], name: 'FC Dechsendorf-Gast 2' }
  ].map((game) => ({ ...game, date, from: '12:00', to: '13:30', category: 'Liga', status: 'Heimspiel' }));
  context.AppData.bfvGames.push(...games);
  const overrides = Object.fromEntries(games.map((game) => [game.id,
    { team: game.name, date, from: game.from, to: game.to, place: 'B', type: 'halb' }]));
  context.Cloud = { initialize: async () => ({ importedAt: null, games: [] }), role: () => 'admin',
    sources: [{ id: 'excel-12', team: 'D-Jugend', organization: 'fcd' }, { id: 'excel-13', team: 'E-Jugend', organization: 'fcd' }],
    read: (key, fallback) => key === 'sg-overrides' ? overrides : fallback };
  run('calendar.js');
  await new Promise(setImmediate);
  assert.match(app.innerHTML, /class="event halb manual" data-event="bfv-youth-one"/);
  assert.match(app.innerHTML, /class="event halb right manual" data-event="bfv-youth-two"/);
  assert.doesNotMatch(app.innerHTML, /class="event halb[^\"]*unresolved" data-event="bfv-youth-/);
  gameButton.onclick();
  assert.match(app.innerHTML, /Platzbedarf<\/dt><dd>1\/2 Platz/);
  handlers.get('[data-edit-event]')();
  assert.match(app.innerHTML, /Für C- bis G-Jugend sind 1\/2 oder 1\/1 Platz möglich/);
  assert.match(app.innerHTML, /<option value="1\/2" selected>1\/2 Platz<\/option>/);
  assert.doesNotMatch(app.innerHTML, /value="vorplatz"/);
});

test('eine bestätigte BFV-Verlegung ersetzt den alten Kalendereintrag ohne zweite Spiel-ID', async () => {
  const { context, run } = appContext();
  const original = { id: 'bfv-same-id', uid: 'same-id', date: '2026-09-28', from: '19:00', to: '20:30',
    name: 'FC Dechsendorf - Gast', source: 'Herren', category: 'Liga', status: 'Heimspiel',
    place: 'A', location: 'Sportanlage Erlangen Campingstrasse 38, 91056 Erlangen' };
  const override = { team: original.name, date: '2026-09-29', from: '19:30', to: '21:00',
    place: 'B', type: 'game', note: 'Vereinsverlegung bestätigt' };
  const gameButton = { dataset: { event: original.id, date: override.date } };
  const app = { innerHTML: '', querySelectorAll: (selector) => selector === '[data-event]' ? [gameButton] : [],
    querySelector: () => null };
  context.document = { getElementById: () => app };
  run('data.js');
  context.AppData.bfvGames.push(original);
  context.Cloud = { initialize: async () => ({ importedAt: null, games: [] }), role: () => '',
    read: (key, fallback) => key === 'sg-overrides' ? { [original.id]: override } : fallback };
  run('calendar.js');
  await new Promise(setImmediate);
  gameButton.onclick();
  assert.match(app.innerHTML, /BFV-ID<\/dt><dd>same-id/);
  assert.match(app.innerHTML, /Vereinsverlegung bestätigt · BFV-Abgleich ausstehend/);
  assert.match(app.innerHTML, /<dd>2026-09-29<\/dd>/);
  assert.match(app.innerHTML, /<dd>19:30–21:00<\/dd>/);
  assert.doesNotMatch(app.innerHTML, /class="bfv-conflict"/);
});

test('bereits gespeicherte BFV-Platznummer B wird bei der Vereinsplanung ignoriert', async () => {
  const { context, run } = appContext();
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const date = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
  const gameButton = { dataset: { event: 'bfv-legacy-place', date } };
  const app = { innerHTML: '',
    querySelectorAll: (selector) => selector === '[data-event]' ? [gameButton] : [],
    querySelector: () => null };
  context.document = { getElementById: () => app };
  run('data.js');
  context.AppData.bfvGames.push({ id: 'bfv-legacy-place', uid: 'legacy-place', date,
    from: '12:00', to: '13:30', name: 'Testspiel', source: 'Test',
    category: 'Liga', status: 'Heimspiel', place: 'B',
    location: 'Sportanlage Erlangen Campingstrasse 38, Platz 2, 91056 Erlangen' });
  context.Cloud = { initialize: async () => ({ importedAt: null, games: [] }), role: () => '',
    read: (_, fallback) => fallback };
  run('calendar.js');
  await new Promise(setImmediate);
  gameButton.onclick();
  assert.match(app.innerHTML, /Platz<\/dt><dd>A<\/dd>/);
  assert.match(app.innerHTML, /Planungsstart<\/dt><dd>A<\/dd>/);
  assert.match(app.innerHTML, /BFV-ID<\/dt><dd>legacy-place<\/dd>/);
});

test('Texte aus BFV-Terminen werden in der Detailansicht sicher angezeigt', async () => {
  const { context, run } = appContext();
  const date = new Date();
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7));
  const key = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
  const gameButton = { dataset: { event: 'bfv-unsafe', date: key } };
  const handlers = new Map();
  const app = {
    innerHTML: '',
    querySelectorAll: (selector) => selector === '[data-event]' ? [gameButton] : [],
    querySelector: () => ({ addEventListener: (_, handler) => handlers.set(_, handler) })
  };
  context.document = { getElementById: () => app };
  context.alert = () => {};
  run('data.js');
  context.AppData.bfvGames.push({ id: 'bfv-unsafe', date: key, from: '14:00',
    to: '15:30', name: '<img src=x onerror=alert(1)>', source: 'Test',
    category: 'Liga', status: 'Heimspiel', place: 'B',
    location: '<script>alert(1)</script>' });
  context.Cloud = { initialize: async () => ({ importedAt: null, games: [] }),
    role: () => '', read: (_, fallback) => fallback };
  run('calendar.js');
  await new Promise(setImmediate);
  gameButton.onclick();
  assert.doesNotMatch(app.innerHTML, /<img src=x onerror=/);
  assert.doesNotMatch(app.innerHTML, /<script>alert\(1\)<\/script>/);
  assert.match(app.innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('manuell übernommene Termine und Änderungen sind markiert, offene Anträge bleiben orange', async () => {
  const { context, run } = appContext();
  const today = new Date();
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
  const date = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
  const gameButton = { dataset: { event: 'bfv-manual', date } };
  const app = { innerHTML: '',
    querySelectorAll: (selector) => selector === '[data-event]' ? [gameButton] : [],
    querySelector: () => null };
  context.document = { getElementById: () => app };
  run('data.js');
  context.AppData.bfvGames.push({ id: 'bfv-manual', date, from: '12:00', to: '13:30',
    name: 'Testspiel', source: 'Test', category: 'Liga', status: 'Heimspiel', place: 'B' });
  context.AppData.bfvGames.push({ id: 'bfv-other', date, from: '11:45', to: '13:30',
    name: 'Anderes Spiel', source: 'Test', category: 'Liga', status: 'Heimspiel', place: 'C' });
  context.AppData.mowingDates.clear();
  context.AppData.mowingDates.add(date);
  const values = {
    'sg-blocks': [{ id: 'closed-c', place: 'C', scope: 'Ganz gesperrt', fromDate: date, toDate: date, title: 'Sperre C' }],
    'sg-overrides': {
      'bfv-manual': { team: 'Testspiel', date, from: '12:00', to: '13:30', place: 'C', type: 'voll', note: 'Verlegt' },
      'bfv-missing': { team: 'Entfallenes Spiel', date, from: '14:00', to: '15:30', place: 'B', type: 'voll', note: 'Manuell erhalten' }
    },
    'sg-requests': [
      { id: 'approved', team: 'Neues Training', date, from: '10:00', to: '11:00', place: 'A', capacity: '1/2', status: 'freigegeben' },
      { id: 'pending', team: 'Offener Antrag', date, from: '11:00', to: '12:00', place: 'A', capacity: '1/2', status: 'beantragt' }
    ]
  };
  context.Cloud = { initialize: async () => ({ importedAt: null, games: [] }), role: () => '',
    read: (key, fallback) => values[key] ?? fallback, mowing: [{ date, note: 'vormittags' }] };
  run('calendar.js');
  await new Promise(setImmediate);
  assert.match(app.innerHTML, /class="event voll manual unresolved"[^>]*><b>Testspiel<\/b>/);
  assert.match(app.innerHTML, /class="event voll manual unresolved"[^>]*><b>Entfallenes Spiel<\/b>/);
  assert.match(app.innerHTML, /class="event halb manual"[^>]*><b>Neues Training<\/b>/);
  assert.match(app.innerHTML, /class="event halb pending"[^>]*><b>Offener Antrag<\/b>/);
  assert.match(app.innerHTML, /class="event special"[^>]*><b>Sperre C<\/b>/);
  assert.match(app.innerHTML, /Lila: Sonderereignisse und Platzsperren/);
  assert.match(app.innerHTML, /Stadt mäht · vormittags/);
  gameButton.onclick();
  assert.doesNotMatch(app.innerHTML, /BFV-Abgleich nötig: Datum oder Uhrzeit/);
  assert.match(app.innerHTML, /Platz<\/dt><dd>C · manuell von A verlegt/);
  assert.match(app.innerHTML, /manuelle Platzwahl prüfen \(keine freie Kapazität\)/);
});

test('bestätigte BFV-Verlegung bleibt bei noch altem BFV-Termin gelb', async () => {
  const { context, run } = appContext();
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const date = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
  const gameButton = { dataset: { event: 'bfv-color', date } };
  const app = { innerHTML: '',
    querySelectorAll: (selector) => selector === '[data-event]' ? [gameButton] : [],
    querySelector: () => null };
  context.document = { getElementById: () => app };
  run('data.js');
  context.AppData.bfvGames.push({ id: 'bfv-color', uid: 'color', date,
    from: '12:00', to: '13:30', name: 'Ligaspiel', source: 'Test',
    category: 'Liga', status: 'Heimspiel', place: 'B' });
  const overrides = { 'bfv-color': { team: 'Ligaspiel', date, from: '12:00', to: '13:30', place: 'C', type: 'voll' } };
  context.Cloud = { initialize: async () => ({ importedAt: null, games: [] }), role: () => '',
    read: (key, fallback) => key === 'sg-overrides' ? overrides : fallback };
  run('calendar.js');
  await new Promise(setImmediate);
  assert.match(app.innerHTML, /class="event voll manual"[^>]*><b>Ligaspiel<\/b>/);
  gameButton.onclick();
  assert.doesNotMatch(app.innerHTML, /BFV-Abgleich nötig/);
  overrides['bfv-color'].from = '12:15';
  gameButton.onclick();
  assert.match(app.innerHTML, /class="event voll manual"[^>]*><b>Ligaspiel<\/b>/);
  assert.match(app.innerHTML, /Vereinsverlegung bestätigt · BFV-Abgleich ausstehend/);
});

test('Sonderereignisse sind in allen Ansichten lila und manuelle Termine bleiben gelb', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'styles', 'bfv.css'), 'utf8');
  for (const selector of ['.event.special', '.calendar-day li.special', '.mobile-event.special'])
    assert.match(css, new RegExp(selector.replace('.', '\\.')));
  assert.match(css, /\.event\.special[^\n]*background:#f1eafe/);
  assert.match(css, /\.event\.manual[^\n]*background:#fff7d7/);
});

