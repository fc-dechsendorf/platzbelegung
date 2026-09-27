const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '../scripts/aktivieren.js'), 'utf8');

async function activation(hash, verify) {
  let click;
  let replaced;
  let destination;
  let calls = 0;
  const button = {
    hidden: false, disabled: false,
    addEventListener: (_, handler) => { click = handler; }
  };
  const message = { textContent: '' };
  const context = {
    document: { getElementById: (id) => id === 'activate' ? button : message },
    window: {
      location: { hash, pathname: '/platzbelegung/aktivieren.html',
        replace: (value) => { destination = value; } },
      history: { replaceState: (_, __, value) => { replaced = value; } },
      Cloud: { client: { auth: { verifyOtp: async (params) => {
        calls++; return verify(params);
      } } } }
    },
    URLSearchParams
  };
  vm.runInNewContext(script, context);
  if (click) await click();
  return { button, message, replaced, destination, calls };
}

test('Einmallink wird erst nach bewusstem Klick eingelöst', async () => {
  const result = await activation('#type=invite&token_hash=abc123&target=board', async (params) => {
    assert.equal(params.type, 'invite');
    assert.equal(params.token_hash, 'abc123');
    return { error: null };
  });
  assert.equal(result.calls, 1);
  assert.equal(result.replaced, '/platzbelegung/aktivieren.html');
  assert.equal(result.destination, 'statistik.html');
});

test('Ungültiger Einmallink wird nicht eingelöst', async () => {
  const result = await activation('#type=invite&target=calendar', async () => ({ error: null }));
  assert.equal(result.calls, 0);
  assert.equal(result.button.hidden, true);
  assert.match(result.message.textContent, /unvollständig/);
});

test('Abgelaufener Link erklärt den nächsten Schritt', async () => {
  const result = await activation('#type=recovery&token_hash=abc123&target=calendar',
    async () => ({ error: new Error('expired') }));
  assert.equal(result.destination, undefined);
  assert.equal(result.button.hidden, true);
  assert.match(result.message.textContent, /neuen Link/);
});
