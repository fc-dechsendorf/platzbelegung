const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/cloud-entry.js'), 'utf8').replace(/^import .*?;\s*/m, '');
function fixture(role = '', owner = false) {
  const id = owner ? '25f4325b-18d1-40ba-9645-8fec15ea5855' : 'one';
  const token = aal => 'h.' + Buffer.from(JSON.stringify({ aal })).toString('base64url') + '.s';
  let mfa = { required: true, strong: false, blocked: true };
  let current = role ? { access_token: token('aal1'), user: { id, app_metadata: { fcd_role: role } } } : null;
  const calls = [];
  let callback;
  let failPublic = false;
  let privateDenied = false;
  const pub = { id: 'approved', team: 'Gastmannschaft', event_date: '2026-10-14', starts_at: '18:00', ends_at: '19:00', place: 'C', capacity: '1/2', status: 'freigegeben', kind: 'friendly' };
  const client = {
    functions: { invoke: async () => ({ data: mfa }) },
    auth: {
      getSession: async () => ({ data: { session: current } }),
      onAuthStateChange: (cb) => { callback = cb; },
      signOut: async () => { current = null; return { error: null }; },
      signInWithPassword: async () => { current = { access_token: token('aal1'), user: { id, app_metadata: { fcd_role: 'admin' } } }; return { data: { session: current } }; }
    },
    from: (table) => ({ select: async () => {
      calls.push(table);
      const data = table === 'schedule_requests' ? [{ ...pub, note: 'INTERN' }, { ...pub, id: 'pending', status: 'beantragt', note: 'PRIVATE' }]
        : table === 'event_overrides' ? [{ target_id: 'bfv-1', team: 'Gastmannschaft', place: 'B', note: 'INTERN' }] : [];
      return { data: privateDenied && ['schedule_requests', 'event_overrides'].includes(table) ? [] : data };
    } }),
    rpc: async (name) => ({ data: name === 'public_schedule_events' ? [pub] : [{ target_id: 'bfv-1', team: 'Gastmannschaft', place: 'B' }], error: failPublic ? new Error('offline') : null })
  };
  const window = { location: { hash: '', search: '' }, AppData: { trainingRules: [], mowingDates: new Set(), bfvGames: [] } };
  window.WebsiteMFA = { authenticate: async () => { current.access_token = token('aal2'); mfa = { required: true, strong: true, blocked: false }; }, mount: () => {} };
  vm.runInNewContext(source, { window, createClient: () => client, URLSearchParams, atob, setTimeout: () => {} });
  return { cloud: window.Cloud, calls, authChange: (s) => callback('SIGNED_OUT', s),
    fail: () => { failPublic = true; }, denyPrivate: () => { privateDenied = true; } };
}
for (const role of ['', 'board', 'admin', 'manager']) test(`Kalenderprojektion und interne Daten: ${role || 'anon'}`, async () => {
  const f = fixture(role);
  await f.cloud.initialize();
  const requests = f.cloud.read('sg-requests');
  assert.equal(requests[0].team, 'Gastmannschaft');
  assert.equal(requests[0].place, 'C');
  assert.equal(requests[0].from, '18:00');
  assert.equal(requests.length, ['admin', 'manager'].includes(role) ? 2 : 1);
  assert.equal(f.calls.includes('schedule_requests'), ['admin', 'manager'].includes(role));
  assert.equal(f.calls.includes('event_overrides'), role === 'admin');
  assert.equal(requests[0].note, ['admin', 'manager'].includes(role) ? 'INTERN' : undefined);
  assert.equal(f.cloud.read('sg-overrides')['bfv-1'].note, role === 'admin' ? 'INTERN' : undefined);
});

test('Owner AAL1 loads public projection only until MFA login completes', async () => {
  const f = fixture('admin', true); await f.cloud.initialize();
  assert.equal(f.cloud.role(), '');
  assert.equal(f.calls.includes('schedule_requests'), false);
  assert.equal(f.cloud.read('sg-requests')[0].note, undefined);
  await f.cloud.login('owner', 'password');
  assert.equal(f.cloud.role(), 'admin');
  assert.equal(f.cloud.read('sg-requests')[0].note, 'INTERN');
});
test('Anmeldung lädt private Daten; Abmeldung entfernt sie auch bei Netzfehler', async () => {
  const f = fixture(); await f.cloud.initialize(); await f.cloud.login('x', 'x');
  assert.equal(f.cloud.read('sg-requests')[0].note, 'INTERN');
  f.fail(); await assert.rejects(f.cloud.logout());
  assert.equal(f.cloud.role(), '');
  assert.equal(f.cloud.read('sg-requests').length, 0);
  assert.deepEqual(Object.keys(f.cloud.read('sg-overrides')), []);
});
test('Abmeldung in anderem Tab leert private Daten sofort', async () => {
  const f = fixture('admin'); await f.cloud.initialize(); f.authChange(null);
  assert.equal(f.cloud.read('sg-requests').length, 0);
});
test('Veraltete Adminsitzung behält öffentliche Terminänderungen ohne interne Notiz', async () => {
  const f = fixture('admin'); f.denyPrivate(); await f.cloud.initialize();
  assert.equal(f.cloud.read('sg-requests').length, 1);
  assert.equal(f.cloud.read('sg-overrides')['bfv-1'].place, 'B');
  assert.equal(f.cloud.read('sg-overrides')['bfv-1'].note, undefined);
});
