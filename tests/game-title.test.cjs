const test = require('node:test');
const assert = require('node:assert/strict');
const { format, halfPitchEligible } = require('../scripts/game-title.js');

const sources = [
  { id: 'excel-5', team: 'Herren', organization: 'fcd' },
  { id: 'excel-7', team: 'A-Jugend', organization: 'fcd' },
  { id: 'excel-9', team: 'B-Jugend', organization: 'fcd' },
  { id: 'excel-11', team: 'C-Jugend 2', organization: 'fcd' },
  { id: 'excel-12', team: 'D-Jugend', organization: 'fcd' },
  { id: 'excel-13', team: 'E-Jugend', organization: 'fcd' },
  { id: 'excel-24', team: 'Atletico Ü32', organization: 'atletico' },
  { id: 'excel-25', team: 'Atletico Herren', organization: 'atletico' },
  { id: 'excel-26', team: 'Atletico II Herren', organization: 'atletico' },
  { id: 'excel-29', team: 'Atlético Frauen Freizeitsport', organization: 'atletico' }
];
const game = (name, sourceIds, status = 'Heimspiel') => ({ name, sourceIds, status });

test('FCD-Jugend erscheint mit Altersklasse vor dem Gegner', () => {
  assert.deepEqual(format(game('FC Dechsendorf-TSV Frauenaurach', ['excel-13']), sources),
    { title: 'FC Dechsendorf E-Jugend – TSV Frauenaurach', homeTeam: 'FC Dechsendorf E-Jugend' });
  assert.match(format(game('(SG) FC Dechsendorf-TSV Frauenaurach', ['excel-7']), sources).title,
    /^\(SG\) FC Dechsendorf A-Jugend – TSV Frauenaurach$/);
  assert.match(format(game('(SG) SpVgg Heßdorf-(SG) BSC Erlangen', ['excel-9']), sources).title,
    /^\(SG\) SpVgg Heßdorf B-Jugend – \(SG\) BSC Erlangen$/);
  assert.match(format(game('(SG) Großenseebach\/Hessdorf\/Dechsendorf 2-(SG) SC Aurachtal', ['excel-11']), sources).title,
    /C-Jugend 2 –/);
});

test('Doppelter BFV-Feed benennt nur die tatsächliche Heimmannschaft', () => {
  assert.equal(format(game('Atletico Erlangen II-FC Dechsendorf', ['excel-5', 'excel-26']), sources).title,
    'Atletico Erlangen II Herren – FC Dechsendorf');
  assert.equal(format(game('FC Dechsendorf-Atletico Erlangen II', ['excel-5', 'excel-26']), sources).title,
    'FC Dechsendorf Herren – Atletico Erlangen II');
  assert.equal(format(game('Atletico Erlangen-SV Tennenlohe', ['excel-24']), sources).title,
    'Atletico Erlangen Ü32 – SV Tennenlohe');
  assert.equal(format(game('Atletico Erlangen-ASV Herzogenaurach', ['excel-25']), sources).title,
    'Atletico Erlangen Herren – ASV Herzogenaurach');
  assert.equal(format(game('Atlético Erlangen-FC Wendelstein', ['excel-29']), sources).title,
    'Atlético Erlangen Frauen (Freizeitsport) – FC Wendelstein');
});

test('Ungeklärter Ort und fehlende Teamquelle führen zu keiner erfundenen Jugendzuordnung', () => {
  assert.equal(format(game('(SC Adelsdorf 2 zg.)-FC Dechsendorf', ['excel-13'], 'Ort offen'), sources).title,
    '(SC Adelsdorf 2 zg.)-FC Dechsendorf');
  assert.equal(format(game('Neues Team-SV Test', ['unbekannt']), sources).title,
    'Neues Team-SV Test');
});

test('halber Platz ist nur für eindeutig zugeordnete C- bis G-Jugendspiele wählbar', () => {
  assert.equal(halfPitchEligible(game('FC Dechsendorf-Gast', ['excel-11']), sources), true);
  assert.equal(halfPitchEligible(game('FC Dechsendorf-Gast', ['excel-12']), sources), true);
  assert.equal(halfPitchEligible(game('FC Dechsendorf-Gast', ['excel-13']), sources), true);
  assert.equal(halfPitchEligible(game('FC Dechsendorf-Gast', ['excel-f']), [...sources, { id: 'excel-f', team: 'F-Jugend', organization: 'fcd' }]), true);
  assert.equal(halfPitchEligible(game('FC Dechsendorf-Gast', ['excel-g']), [...sources, { id: 'excel-g', team: 'G-Jugend', organization: 'fcd' }]), true);
  assert.equal(halfPitchEligible(game('FC Dechsendorf-Gast', ['excel-7']), sources), false);
  assert.equal(halfPitchEligible(game('FC Dechsendorf-Gast', ['excel-9']), sources), false);
  assert.equal(halfPitchEligible(game('Atletico Erlangen-FC Dechsendorf', ['excel-13', 'excel-25']), sources), false);
  assert.equal(halfPitchEligible(game('Unbekannt-Gast', ['unbekannt']), sources), false);
});

