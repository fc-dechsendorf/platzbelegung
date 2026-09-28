const test = require('node:test');
const assert = require('node:assert/strict');
const filter = require('../scripts/schedule-filter.js');

const all = { query: '', team: '', from: '', to: '', training: true, game: true, other: true };
const crossFeedGame = { type: 'game', team: 'Atletico Erlangen II-FC Dechsendorf', source: 'BFV-iCal · Herren', category: 'Liga', place: 'B' };

test('Heimmannschaft stammt aus BFV-Spielbezeichnung, nicht aus zuerst gelesenem iCal-Feed', () => {
  assert.equal(filter.homeTeam(crossFeedGame), 'Atletico Erlangen II');
  assert.equal(filter.matches(crossFeedGame, '2026-10-04', { ...all, team: 'Atletico Erlangen II' }), true);
  assert.equal(filter.matches(crossFeedGame, '2026-10-04', { ...all, team: 'Herren' }), false);
});

test('Terminart, Suche und Datumsgrenzen wirken gemeinsam', () => {
  const training = { type: 'halb', team: 'D-Jugend', category: 'Training', place: 'C' };
  assert.equal(filter.matches(training, '2026-10-01', { ...all, query: 'd-jugend', from: '2026-10-01', to: '2026-10-01' }), true);
  assert.equal(filter.matches(training, '2026-10-02', { ...all, to: '2026-10-01' }), false);
  assert.equal(filter.matches(training, '2026-10-01', { ...all, training: false }), false);
  assert.equal(filter.matches(crossFeedGame, '2026-10-04', { ...all, game: false }), false);
});

