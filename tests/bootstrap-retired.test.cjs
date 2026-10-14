const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('Stillgelegte Ersteinrichtung verarbeitet keine Einrichtung mehr und benötigt keine Geheimschlüssel', async () => {
  let handler;
  // Deliberately provide no environment access or privileged Auth client.
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,
    '../supabase/functions/bootstrap-admin/index.ts'), 'utf8'), {
    Deno: { serve: (callback) => { handler = callback; } }, Response
  });
  for (const method of ['GET', 'POST', 'OPTIONS']) {
    const result = await handler(new Request('https://example.invalid', {
      method, headers: { 'x-setup-token': 'obsolete-setup-token' }
    }));
    assert.equal(result.status, 410);
    assert.equal(result.headers.get('Cache-Control'), 'no-store');
    const data = await result.json();
    assert.match(data.error, /stillgelegt/);
    assert.equal(data.invited, undefined);
  }
});
