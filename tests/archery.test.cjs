const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const scripts = path.join(__dirname, '..', 'scripts');

async function renderFor(day, { blocks = [], games = [], overrides = {} } = {}) {
  const app = { innerHTML: '', querySelectorAll: () => [], querySelector: () => null };
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [day])); }
  }
  const context = { Date: FixedDate, Intl, Map, Set, URL };
  context.window = context;
  context.document = { getElementById: () => app };
  context.Cloud = {
    initialize: async () => ({ importedAt: null, games: [] }),
    role: () => '',
    read: (key, fallback) => key === 'sg-blocks' ? blocks : key === 'sg-overrides' ? overrides : fallback
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(scripts, 'data.js'), 'utf8'), context);
  context.AppData.bfvGames = games;
  vm.runInContext(fs.readFileSync(path.join(scripts, 'game-title.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(scripts, 'schedule-filter.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(scripts, 'calendar.js'), 'utf8'), context);
  await new Promise(setImmediate);
  return app.innerHTML;
}

test('Bogenschützen erscheinen April bis September mittwochs und freitags auf 1/2 C-Platz', async () => {
  const html = await renderFor('2026-09-21T12:00:00+02:00');
  assert.match(html, /event archery right/);
  assert.match(html, /data-event="archery-2026-09-23"/);
  assert.match(html, /data-event="archery-2026-09-25"/);
  assert.match(html, /17:30–19:00 · 1\/2 C-Platz · Hinweis/);
  assert.match(html, /event voll archery-parallel[^"\n]*" data-event="standard-A-Jugend-2026-09-23/);
});

test('außerhalb April bis September gibt es keinen Bogenschützenblock', async () => {
  const html = await renderFor('2026-10-05T12:00:00+02:00');
  assert.doesNotMatch(html, /archery-2026-10-/);
  const spring = await renderFor('2027-04-05T12:00:00+02:00');
  assert.match(spring, /archery-2027-04-07/);
});

test('vollständige C-Platz-Sperre unterdrückt den Bogenschützenblock', async () => {
  const html = await renderFor('2026-09-21T12:00:00+02:00', { blocks: [{
    id: 'test', fromDate: '2026-09-23', toDate: '2026-09-23',
    place: 'C', scope: 'Ganz gesperrt', title: 'Pflege'
  }] });
  assert.doesNotMatch(html, /archery-2026-09-23/);
  assert.match(html, /archery-2026-09-25/);
});

test('Spiel auf C hat Vorrang und wird als Abstimmungsbedarf markiert', async () => {
  const game = { id: 'bfv-test', uid: 'test', date: '2026-09-25', name: 'Heimspiel',
    from: '17:45', to: '19:15', category: 'Liga', status: 'Heimspiel', source: 'Herren' };
  const html = await renderFor('2026-09-21T12:00:00+02:00', {
    games: [game], overrides: { 'bfv-test': { date: game.date, from: game.from, to: game.to, place: 'C', type: 'game' } }
  });
  assert.match(html, /event archery right archery-game/);
  assert.match(html, /Spielvorrang/);
});

