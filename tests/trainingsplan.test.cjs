const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '../scripts/trainingsplan.js'), 'utf8');
async function page(role) {
  const app = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] };
  const context = {
    document: { getElementById: () => app },
    window: { Cloud: {
      initializeAuth: async () => {}, role: () => role,
      listTrainingRules: async () => [{ id: 'one', team: 'D-Jugend', weekday: 4,
        starts_at: '17:30:00', ends_at: '19:00:00', place: 'C', capacity: '1/2',
        organization: 'fcd', active: true, valid_from: null, valid_until: null }]
    } },
    Object, String, Number, Promise
  };
  vm.runInNewContext(script, context);
  await new Promise(setImmediate);
  return app.innerHTML;
}

test('Administrator kann Standardtraining sehen und bearbeiten', async () => {
  const html = await page('admin');
  assert.match(html, /D-Jugend/);
  assert.match(html, /Donnerstag/);
  assert.match(html, /17:30–19:00/);
  assert.match(html, /data-training-form/);
  assert.match(html, /Pausieren/);
});

test('Abteilungsleitung erhält keinen Trainingsplan-Editor', async () => {
  const html = await page('manager');
  assert.doesNotMatch(html, /data-training-form/);
  assert.match(html, /Nur Administratoren/);
});
