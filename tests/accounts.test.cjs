const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/cloud-entry.js'), 'utf8')
  .replace(/^import .*?;\s*/m, '');

test('Einladung bleibt bis zur Passwortvergabe sichtbar, auch ohne URL-Typ', async () => {
  const user = { app_metadata: { fcd_role: 'board' },
    user_metadata: { fcd_password_setup_pending: true } };
  const session = { user };
  let savedPassword;
  const client = { auth: {
    getSession: async () => ({ data: { session }, error: null }),
    onAuthStateChange: () => {},
    updateUser: async (data) => {
      savedPassword = data;
      return { data: { user: { ...user, user_metadata: data.data } }, error: null };
    }
  } };
  const context = { window: { location: { hash: '', search: '' } },
    createClient: () => client, URLSearchParams };
  vm.runInNewContext(source, context);
  await context.window.Cloud.initializeAuth();
  assert.equal(context.window.Cloud.needsPasswordSetup, true);
  await context.window.Cloud.updatePassword('ein-sehr-langes-passwort');
  assert.equal(savedPassword.data.fcd_password_setup_pending, false);
  await context.window.Cloud.initializeAuth();
  assert.equal(context.window.Cloud.needsPasswordSetup, false);
});

test('Administrator speichert Trainingsregel ohne die stabile Terminkennung zu ändern', async () => {
  const user = { app_metadata: { fcd_role: 'admin' }, user_metadata: {} };
  let payload;
  const client = {
    auth: { getSession: async () => ({ data: { session: { user } }, error: null }),
      onAuthStateChange: () => {} },
    from: () => ({ update: (value) => {
      payload = value;
      return { eq: () => ({ select: async () => ({ data: [{ id: 'rule-1', ...value }], error: null }) }) };
    } })
  };
  const context = { window: { location: { hash: '', search: '' } },
    createClient: () => client, URLSearchParams };
  vm.runInNewContext(source, context);
  await context.window.Cloud.initializeAuth();
  await context.window.Cloud.saveTrainingRule({ id: 'rule-1', team: 'D-Jugend', weekday: 4,
    starts_at: '17:30', ends_at: '19:00', place: 'C', capacity: '1/2',
    organization: 'fcd', active: true, event_key_template: 'alter-schlüssel' });
  assert.equal(payload.team, 'D-Jugend');
  assert.equal(payload.event_key_template, undefined);
  await assert.rejects(context.window.Cloud.saveTrainingRule({ team: 'D-Jugend', weekday: 4,
    starts_at: '17:30', ends_at: '19:00', place: 'C', capacity: 'vorplatz',
    organization: 'fcd', active: true }), /prüfen/);
});
