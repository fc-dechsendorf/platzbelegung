const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const scripts = path.join(__dirname, '..', 'scripts');

async function setup(stored = null, options = {}) {
  const values = new Map(stored ? [['fcd-public-language', stored]] : []);
  let onChange;
  const eventButton = options.eventId ? { dataset: { event: options.eventId, date: options.eventDate } } : null;
  const app = {
    innerHTML: '',
    querySelectorAll: (selector) => selector === '[data-event]' && eventButton ? [eventButton] : [],
    querySelector: (selector) => selector === '[data-language]' ? { addEventListener(_event, callback) { onChange = callback; } } : null
  };
  class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : ['2026-09-21T12:00:00+02:00'])); } }
  const document = { documentElement: { lang: 'de' }, getElementById: () => app, title: '' };
  const context = { Date: FixedDate, Intl, Map, Set, URL, document,
    localStorage: { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) } };
  context.window = context;
  context.Cloud = { initialize: async () => ({ importedAt: null, games: [] }), role: () => '',
    read: (key, fallback) => key === 'sg-overrides' ? (options.overrides || fallback) : fallback };
  vm.createContext(context);
  for (const file of ['data.js', 'language.js', 'game-title.js', 'schedule-filter.js']) vm.runInContext(fs.readFileSync(path.join(scripts, file), 'utf8'), context);
  if (options.game) context.AppData.bfvGames.push(options.game);
  vm.runInContext(fs.readFileSync(path.join(scripts, 'calendar.js'), 'utf8'), context);
  await new Promise(setImmediate);
  return { app, context, document, values, change: (value) => onChange({ target: { value } }), openEvent: () => eventButton.onclick() };
}

test('defaults to German and switches the public weekly view to English', async () => {
  const state = await setup();
  assert.match(state.app.innerHTML, /Öffentliche Wochenansicht/);
  state.change('en');
  assert.equal(state.document.documentElement.lang, 'en');
  assert.equal(state.values.get('fcd-public-language'), 'en');
  assert.match(state.app.innerHTML, /Public weekly view/);
  assert.match(state.app.innerHTML, /<b>Mon<\/b><span>21\.09\.<\/span>/);
  assert.match(state.app.innerHTML, /1\/2 pitch/);
  assert.match(state.app.innerHTML, /Administrator/);
  assert.doesNotMatch(state.app.innerHTML, /Öffentliche Wochenansicht/);
});

test('restores Spanish and preserves German weekdays for training rules', async () => {
  const state = await setup('es');
  assert.equal(state.document.documentElement.lang, 'es');
  assert.match(state.app.innerHTML, /Vista semanal pública/);
  assert.match(state.app.innerHTML, /<b>Lun<\/b><span>21\.09\.<\/span>/);
  assert.match(state.app.innerHTML, /data-event="standard-E-Jugend-2026-09-21-17:30"/);
  assert.match(state.app.innerHTML, /1\/2 campo/);
  assert.match(state.app.innerHTML, /Verde: entrenamiento habitual/);
});

test('invalid language does not replace a valid choice', async () => {
  const state = await setup('es');
  state.change('fr');
  assert.equal(state.document.documentElement.lang, 'es');
  assert.equal(state.values.get('fcd-public-language'), 'es');
});

test('English event details translate fixed labels and leave a custom note untouched', async () => {
  const id = 'standard-E-Jugend-2026-09-21-17:30';
  const state = await setup('en', { eventId: id, eventDate: '2026-09-21',
    overrides: { [id]: { date: '2026-09-21', team: 'E-Jugend', from: '17:30', to: '19:00', place: 'A', type: 'halb', note: 'Bring water bottles' } } });
  state.openEvent();
  assert.match(state.app.innerHTML, /<dt>Date<\/dt>/);
  assert.match(state.app.innerHTML, /<dt>Pitch requirement<\/dt><dd>1\/2 pitch/);
  assert.match(state.app.innerHTML, /Regular training schedule · changed by administrator/);
  assert.match(state.app.innerHTML, /<dt>Status<\/dt><dd>Bring water bottles<\/dd>/);
  assert.match(state.app.innerHTML, /Sign in to make changes/);
});

test('Spanish archery details explain the shared C pitch in Spanish', async () => {
  const state = await setup('es', { eventId: 'archery-2026-09-23', eventDate: '2026-09-23' });
  state.openEvent();
  assert.match(state.app.innerHTML, /<dt>Fecha<\/dt>/);
  assert.match(state.app.innerHTML, /Zona de seguridad acordada en 1\/2 campo C/);
  assert.match(state.app.innerHTML, /los partidos de liga, copa y amistosos tienen prioridad/);
  assert.doesNotMatch(state.app.innerHTML, /Vereinbarte Sperrzone/);
});

test('English BFV match details translate the BFV pitch explanation', async () => {
  const game = { id: 'bfv-test-language', uid: 'test-language', date: '2026-09-25', from: '18:00', to: '19:30',
    name: 'Atletico Erlangen-Testgegner', source: 'Atletico', category: 'Liga', status: 'Heimspiel', location: 'Sportanlage Erlangen Campingstrasse 38, 91056 Erlangen' };
  const state = await setup('en', { game, eventId: game.id, eventDate: game.date });
  state.openEvent();
  assert.match(state.app.innerHTML, /<dt>BFV pitch designation<\/dt>/);
  assert.match(state.app.innerHTML, /according to club rules/);
  assert.match(state.app.innerHTML, /B · moved automatically from A/);
  const status = state.app.innerHTML.match(/<dt>Status<\/dt><dd>(.*?)<\/dd>/)?.[1];
  assert.match(status, /League/);
  assert.doesNotMatch(status, /Liga|Heimspiel|Flutlicht/);
  assert.match(state.app.innerHTML, /Atletico Erlangen-Testgegner/);
});

test('Spanish BFV conflict warning is translated while the manual appointment remains', async () => {
  const game = { id: 'bfv-conflict-language', uid: 'conflict-language', date: '2026-09-25', from: '18:00', to: '19:30',
    name: 'Atletico Erlangen-Testgegner', source: 'Atletico', category: 'Liga', status: 'Heimspiel' };
  const state = await setup('es', { game, eventId: game.id, eventDate: game.date,
    overrides: { [game.id]: { date: game.date, team: game.name, from: '18:15', to: '19:30', place: 'B', type: 'voll' } } });
  state.openEvent();
  assert.match(state.app.innerHTML, /Revisar con BFV: la fecha o la hora/);
  assert.match(state.app.innerHTML, /El evento manual se conserva/);
  assert.match(state.app.innerHTML, /B · trasladado manualmente desde A/);
  assert.match(state.app.innerHTML, /18:15–19:30/);
  assert.doesNotMatch(state.app.innerHTML, /BFV-Abgleich nötig: Datum oder Uhrzeit/);
});

