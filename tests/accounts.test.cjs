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
