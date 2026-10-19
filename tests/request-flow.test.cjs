const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const scripts = path.join(__dirname, '..', 'scripts');
const monday = new Date();
monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
const date = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;

async function setup(kind) {
  const handlers = new Map();
  const state = { requests: [], saved: [] };
  const eventButton = { dataset: { event: kind === 'game' ? 'bfv-test-uid' : `standard-Testtraining-${date}-10:00`, date } };
  const app = {
    innerHTML: '',
    querySelectorAll: (selector) => selector === '[data-event]' ? [eventButton] : [],
    querySelector: (selector) => ['[data-invite-manager]', '[data-manager-list]', '[data-mowing-list]'].includes(selector)
      ? null : ({ addEventListener: (_, handler) => handlers.set(selector, handler) })
  };
  const context = { Date, Intl, Map, Set, URL, console, setTimeout, clearTimeout,
    document: { getElementById: () => app }, alert: (message) => { throw new Error(message); } };
  context.window = context;
  context.FormData = class {
    constructor(form) { return new Map(Object.entries(form.values)); }
  };
  vm.createContext(context);
  const run = (file) => vm.runInContext(fs.readFileSync(path.join(scripts, file), 'utf8'), context);
  run('data.js');
  run('schedule-filter.js');
  if (kind === 'game') context.AppData.bfvGames.push({ id: eventButton.dataset.event,
    uid: 'test-uid', name: 'FC Dechsendorf – Gast', date, from: '10:00', to: '11:30',
    category: 'Liga', status: 'Heimspiel', source: 'Herren' });
  else context.AppData.trainingRules.push(['Testtraining', 'Mo', '10:00', '11:30', 'B', 'halb']);
  context.Cloud = {
    initialize: async () => ({ importedAt: null, games: [] }), role: () => 'manager',
    read: (key, fallback) => key === 'sg-requests' ? state.requests : fallback,
    save: async (key, rows) => {
      assert.equal(key, 'sg-requests');
      state.saved.push(rows.at(-1));
      state.requests = rows.map((row, index) => ({ ...row, id: row.id || `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}` }));
    }
  };
  run('calendar.js');
  await new Promise(setImmediate);
  return { app, context, eventButton, handlers, state };
}

for (const kind of ['game', 'training']) {
  test(`Abteilungsleitung kann ${kind === 'game' ? 'BFV-Spiel' : 'Training'} verlegen: eigene Antrags-ID, stabile Ziel-ID`, async () => {
    const { app, eventButton, handlers, state } = await setup(kind);
    assert.equal(typeof eventButton.onclick, 'function', app.innerHTML);
    eventButton.onclick();
    assert.match(app.innerHTML, /data-move-request/);
    handlers.get('[data-move-request]')();
    assert.match(app.innerHTML, /name="id" value=""/);
    assert.match(app.innerHTML, new RegExp(`name="targetId" value="${eventButton.dataset.event}"`));
    const submit = handlers.get('[data-request-form]');
    assert.ok(submit);
    const form = { values: { index: '', id: eventButton.dataset.event, action: 'move',
      targetId: eventButton.dataset.event, team: 'Test', date, from: '10:00', to: '11:30',
      place: 'B', capacity: '1/1', kind: 'other', organization: 'fcd', note: 'Verlegung' } };
    await submit({ preventDefault() {}, currentTarget: form });
    assert.equal(state.saved.length, 1);
    assert.equal(state.saved[0].id, undefined);
    assert.equal(state.saved[0].targetId, eventButton.dataset.event);
    assert.equal(state.saved[0].status, 'beantragt');
    assert.match(app.innerHTML, /Beantragter Termin/);
  });
}

