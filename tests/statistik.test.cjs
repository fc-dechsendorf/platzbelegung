const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '../scripts/statistik.js'), 'utf8');

async function page(user) {
  const app = { innerHTML: '', querySelectorAll: () => [], querySelector: () => null };
  const client = {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    rpc: async () => ({ data: [{ calendar_year: 2026, season_start: 2026,
      organization: 'fcd', team: 'Herren', kind: 'league', event_count: 2, minutes: 180 },
      { calendar_year: 2026, season_start: 2026,
        organization: 'other', team: 'Torwartschule', kind: 'other', event_count: 1, minutes: 360 }], error: null }),
    from: () => ({ select: () => ({ order: () => ({ limit: async () => ({
      data: [{ capture_date: '2026-10-04' }], error: null
    }) }) }) })
  };
  const context = {
    document: { getElementById: () => app },
    window: { Cloud: { client, initializeAuth: async () => {}, needsPasswordSetup: false } },
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-05T12:00:00Z'])); } },
    Intl, Map, Math, Number, Object, String, Promise
  };
  vm.runInNewContext(script, context);
  await new Promise(setImmediate);
  return app.innerHTML;
}

test('Vorstand sieht Jahres- und Saisonwerte nach Anmeldung', async () => {
  const html = await page({ app_metadata: { fcd_role: 'board' } });
  assert.match(html, /Kalenderjahr 2026/);
  assert.match(html, /Herren/);
  assert.match(html, /Atletico Erlangen/);
  assert.match(html, /Torwartschule/);
  assert.match(html, /6 Std\. 00 Min\./);
  assert.match(html, /<h1>Vorstand<\/h1>/);
  assert.match(html, /2026\/27/);
  assert.match(html, /Ab Oktober 2026/);
  assert.doesNotMatch(html, /data-invite-board/);
});

test('Abteilungsleitung erhält keine Statistikwerte', async () => {
  const html = await page({ app_metadata: { fcd_role: 'manager' } });
  assert.match(html, /Anmeldung für Vorstand und Administrator/);
  assert.doesNotMatch(html, /<td>2<\/td>/);
});
