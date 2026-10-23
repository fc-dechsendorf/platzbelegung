const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const esbuild = require('esbuild');

const source = fs.readFileSync(path.join(__dirname, '../supabase/functions/refresh-bfv/reconcile.ts'), 'utf8');
const moduleExports = {};
const moduleObject = { exports: moduleExports };
vm.runInNewContext(esbuild.transformSync(source, { loader: 'ts', format: 'cjs' }).code,
  { exports: moduleExports, module: moduleObject });
const { reconcileGames } = moduleObject.exports;

test('abgeschlossene Spiele bleiben auch nach Wegfall aus dem Feed erhalten', () => {
  const old = [{ id: 'bfv-past', game_date: '2026-10-21', ends_at: '19:20:00' }];
  const plan = reconcileGames(old, [], '2026-10-23T18:00');
  assert.deepEqual([...plan.retainedIds], ['bfv-past']);
  assert.equal(plan.archived, 1);
  assert.equal(plan.missingFuture, 0);
  assert.equal(plan.upserts.length, 0);
});

test('bevorstehende BFV-Verlegung aktualisiert denselben Termin über die ID', () => {
  const old = [{ id: 'bfv-future', game_date: '2026-10-25', ends_at: '17:00:00' }];
  const moved = { id: 'bfv-future', game_date: '2026-10-26', ends_at: '19:00:00' };
  const plan = reconcileGames(old, [moved], '2026-10-23T18:00');
  assert.equal(plan.upserts.length, 1);
  assert.equal(plan.upserts[0], moved);
  assert.equal(plan.archived, 0);
  assert.equal(plan.missingFuture, 0);
});

test('nur fehlende künftige Spiele werden zur Klärung markiert', () => {
  const old = [
    { id: 'bfv-past', game_date: '2026-10-21', ends_at: '19:20:00' },
    { id: 'bfv-future', game_date: '2026-10-25', ends_at: '17:00:00' }
  ];
  const plan = reconcileGames(old, [], '2026-10-23T18:00');
  assert.deepEqual([...plan.retainedIds], ['bfv-past']);
  assert.deepEqual([...plan.futureMissingIds], ['bfv-future']);
  assert.equal(plan.missingFuture, 1);
});

test('ein am selben Tag bereits beendetes Spiel wird nicht mehr verändert', () => {
  const old = [{ id: 'bfv-today', game_date: '2026-10-23', ends_at: '16:30:00' }];
  const changed = { id: 'bfv-today', game_date: '2026-10-23', ends_at: '17:30:00' };
  const plan = reconcileGames(old, [changed], '2026-10-23T18:00');
  assert.equal(plan.upserts.length, 0);
  assert.deepEqual([...plan.retainedIds], ['bfv-today']);
});
