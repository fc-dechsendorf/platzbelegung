import { createClient } from '@supabase/supabase-js';

const authFlow = typeof window !== 'undefined' && window.location
  ? new URLSearchParams(window.location.hash.slice(1)).get('type') ||
    new URLSearchParams(window.location.search).get('type')
  : null;
// Dieser Schlüssel ist ausdrücklich für öffentliche Browser-Clients bestimmt.
// Niemals einen Secret- oder Service-Role-Schlüssel hier ablegen.
const client = createClient(
  'https://jikxqjyslkqisxquzjku.supabase.co',
  'sb_publishable_O4z4UFGcx3NQhiLWT-AYwA_GUjhHdoX',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
);

const state = {
  'sg-requests': [],
  'sg-overrides': {},
  'sg-deletions': [],
  'sg-blocks': []
};
let session = null;
let loaded = false;
let sources = [];
let mowing = [];
let lastImport = null;
let needsPasswordSetup = false;
let authInitialized = false;
let setupCompleted = false;
const authError = typeof window !== 'undefined' && window.location
  ? new URLSearchParams(window.location.hash.slice(1)).get('error_code') ||
    new URLSearchParams(window.location.search).get('error_code')
  : null;
const shortTime = (value) => String(value || '').slice(0, 5);
const typeFromCapacity = (value) => value === '1/2' ? 'halb' : value === 'vorplatz' ? 'vorplatz' : 'voll';
const capacityFromType = (value) => value === 'halb' ? '1/2' : value === 'vorplatz' ? 'vorplatz' : '1/1';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = (value) => JSON.parse(JSON.stringify(value));
const check = ({ data, error }) => { if (error) throw error; return data; };

async function load() {
  const tables = ['training_rules', 'mowing_dates', 'bfv_sources', 'bfv_games',
    'schedule_requests', 'event_overrides', 'event_deletions', 'place_blocks'];
  const results = await Promise.all(tables.map((table) => client.from(table).select('*')));
  const rows = Object.fromEntries(tables.map((table, i) => [table, check(results[i])]));
  window.AppData.trainingRules.splice(0, window.AppData.trainingRules.length,
    ...rows.training_rules.filter((row) => row.active).map((row) => [
      row.team, ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'][row.weekday - 1],
      shortTime(row.starts_at), shortTime(row.ends_at), row.place, typeFromCapacity(row.capacity),
      row.event_key_template, row.valid_from, row.valid_until
    ]));
  window.AppData.mowingDates.clear();
  rows.mowing_dates.forEach((row) => window.AppData.mowingDates.add(row.mowing_date));
  mowing = rows.mowing_dates.map((row) => ({
    date: row.mowing_date, note: row.note
  })).sort((a, b) => a.date.localeCompare(b.date));
  sources = rows.bfv_sources.map((row) => ({
    id: row.id, team: row.team, url: row.url, active: row.active, row: row.excel_row,
    organization: row.organization || 'other'
  }));
  window.AppData.bfvGames.splice(0, window.AppData.bfvGames.length,
    ...rows.bfv_games.map((row) => ({
      id: row.id, date: row.game_date, from: shortTime(row.starts_at),
      to: shortTime(row.ends_at), name: row.name, category: row.category,
      status: row.status, place: row.place, location: row.location,
      source: row.source, sourceIds: row.source_ids, uid: row.uid
    })));
  lastImport = rows.bfv_games.reduce((latest, row) =>
    row.imported_at > latest ? row.imported_at : latest, '');
  state['sg-requests'] = rows.schedule_requests.map((row) => ({
    id: row.id, action: row.action, status: row.status, targetId: row.target_id,
    team: row.team, date: row.event_date, from: shortTime(row.starts_at),
    to: shortTime(row.ends_at), place: row.place, capacity: row.capacity, kind: row.kind,
    organization: row.organization || 'other',
    note: row.note
  }));
  state['sg-overrides'] = Object.fromEntries(rows.event_overrides.map((row) => [
    row.target_id, { team: row.team, date: row.event_date,
      from: shortTime(row.starts_at), to: shortTime(row.ends_at),
      place: row.place, type: typeFromCapacity(row.capacity), note: row.note }
  ]));
  state['sg-deletions'] = rows.event_deletions.map((row) => row.target_id);
  state['sg-blocks'] = rows.place_blocks.map((row) => ({
    id: row.id, place: row.place, scope: row.scope,
    fromDate: row.from_date, toDate: row.to_date, title: row.title
  }));
  loaded = true;
  return { games: window.AppData.bfvGames, importedAt: lastImport, sources };
}

function read(key, fallback) {
  return key in state ? clone(state[key]) : fallback;
}

const requestRow = (item) => ({
  ...(item.id ? { id: item.id } : {}),
  action: item.action || 'new', status: item.status || 'beantragt',
  target_id: item.targetId || null, team: item.team,
  event_date: item.date, starts_at: item.from, ends_at: item.to,
  place: item.place, capacity: item.capacity, kind: item.kind || 'other',
  organization: item.organization || 'other', note: item.note || ''
});
const overrideRow = (id, item) => ({
  target_id: id, team: item.team, event_date: item.date,
  starts_at: item.from, ends_at: item.to, place: item.place,
  capacity: capacityFromType(item.type), note: item.note || ''
});
const blockRow = (item) => ({
  ...(item.id ? { id: item.id } : {}),
  place: item.place, scope: item.scope, from_date: item.fromDate,
  to_date: item.toDate, title: item.title || ''
});

async function save(key, next) {
  if (!loaded) throw new Error('Daten sind noch nicht geladen.');
  if (!['admin', 'manager'].includes(role())) throw new Error('Bitte anmelden.');
  const previous = state[key];
  if (key === 'sg-requests') {
    const oldById = new Map(previous.filter((item) => item.id).map((item) => [item.id, item]));
    const newById = new Map(next.filter((item) => item.id).map((item) => [item.id, item]));
    for (const item of previous) if (item.id && !newById.has(item.id))
      check(await client.from('schedule_requests').delete().eq('id', item.id).select());
    for (const item of next) {
      if (!item.id) check(await client.from('schedule_requests').insert(requestRow(item)).select());
      else if (!same(item, oldById.get(item.id)))
        check(await client.from('schedule_requests').update(requestRow(item)).eq('id', item.id).select());
    }
  } else if (key === 'sg-overrides') {
    for (const id of Object.keys(previous)) if (!(id in next))
      check(await client.from('event_overrides').delete().eq('target_id', id).select());
    for (const [id, item] of Object.entries(next)) if (!same(item, previous[id]))
      check(await client.from('event_overrides').upsert(overrideRow(id, item)).select());
  } else if (key === 'sg-deletions') {
    for (const id of previous) if (!next.includes(id))
      check(await client.from('event_deletions').delete().eq('target_id', id).select());
    for (const id of next) if (!previous.includes(id))
      check(await client.from('event_deletions').insert({ target_id: id }).select());
  } else if (key === 'sg-blocks') {
    const oldIds = new Set(previous.map((item) => item.id));
    const newIds = new Set(next.map((item) => item.id).filter(Boolean));
    for (const id of oldIds) if (!newIds.has(id))
      check(await client.from('place_blocks').delete().eq('id', id).select());
    for (const item of next) if (!item.id)
      check(await client.from('place_blocks').insert(blockRow(item)).select());
    else if (!same(item, previous.find((old) => old.id === item.id)))
      check(await client.from('place_blocks').update(blockRow(item)).eq('id', item.id).select());
  } else throw new Error('Unbekannte Datenart.');
  await load();
}

async function approveRequest(id) {
  if (role() !== 'admin') throw new Error('Administratorrechte erforderlich.');
  check(await client.rpc('approve_schedule_request', { p_request_id: id }));
  await load();
}

async function saveSources(items) {
  if (role() !== 'admin') throw new Error('Nur Administratoren dürfen iCal-Quellen ändern.');
  const before = new Map(sources.map((item) => [item.id, item]));
  for (const item of items) if (!same(item, before.get(item.id))) {
    check(await client.from('bfv_sources').upsert({
      id: item.id, team: item.team, url: item.url, active: item.active,
      organization: item.organization || 'other',
      excel_row: item.row || null
    }).select());
  }
  for (const item of sources) if (!items.some((next) => next.id === item.id))
    check(await client.from('bfv_sources').delete().eq('id', item.id).select());
  await load();
}

async function importGames(snapshot) {
  if (role() !== 'admin') throw new Error('Nur Administratoren dürfen BFV-Daten importieren.');
  if (snapshot.errors?.length) throw new Error('Mindestens eine BFV-Quelle ist nicht erreichbar.');
  const rows = snapshot.games.map((game) => ({
    id: game.id, game_date: game.date, starts_at: game.from, ends_at: game.to,
    name: game.name, category: game.category, status: game.status,
    place: game.place, location: game.location, source: game.source,
    source_ids: game.sourceIds, uid: game.uid, imported_at: snapshot.importedAt
  }));
  for (let i = 0; i < rows.length; i += 100)
    check(await client.from('bfv_games').upsert(rows.slice(i, i + 100)).select());
  const existing = check(await client.from('bfv_games').select('id')).map((row) => row.id);
  const current = new Set(rows.map((row) => row.id));
  const stale = existing.filter((id) => !current.has(id));
  for (let i = 0; i < stale.length; i += 100)
    check(await client.from('bfv_games').delete().in('id', stale.slice(i, i + 100)).select());
  await load();
}

async function initializeAuth() {
  const result = await client.auth.getSession();
  check(result);
  session = result.data.session;
  needsPasswordSetup = Boolean(session && !setupCompleted && (
    session.user?.user_metadata?.fcd_password_setup_pending === true ||
    (session.user?.user_metadata?.fcd_password_setup_pending !== false &&
      (authFlow === 'invite' || authFlow === 'recovery'))));
  if (!authInitialized) {
    client.auth.onAuthStateChange((_event, current) => { session = current; });
    authInitialized = true;
  }
  return session;
}
async function initialize() {
  await initializeAuth();
  return load();
}
function role() {
  const value = session?.user?.app_metadata?.fcd_role;
  return value === 'admin' || value === 'manager' ? value : '';
}
async function login(email, password) {
  const result = await client.auth.signInWithPassword({ email, password });
  check(result);
  session = result.data.session;
  if (!role()) {
    await client.auth.signOut();
    session = null;
    throw new Error('Für dieses Konto ist noch keine Berechtigung eingerichtet.');
  }
  return role();
}
async function logout() {
  check(await client.auth.signOut());
  session = null;
}
async function updatePassword(password) {
  if (!session) throw new Error('Einladungslink oder Anmeldung erforderlich.');
  const result = await client.auth.updateUser({ password, data: {
    ...session.user.user_metadata, fcd_password_setup_pending: false
  } });
  check(result);
  if (result.user) session.user = result.user;
  setupCompleted = true;
  needsPasswordSetup = false;
}

async function listTrainingRules() {
  if (role() !== 'admin') throw new Error('Administratorrechte erforderlich.');
  return check(await client.from('training_rules').select('*'));
}
async function saveTrainingRule(item) {
  if (role() !== 'admin') throw new Error('Administratorrechte erforderlich.');
  const row = {
    team: String(item.team || '').trim(), weekday: Number(item.weekday),
    starts_at: item.starts_at, ends_at: item.ends_at,
    place: item.place, capacity: item.capacity,
    organization: item.organization, active: Boolean(item.active),
    valid_from: item.valid_from || null, valid_until: item.valid_until || null
  };
  if (!row.team || !Number.isInteger(row.weekday) || row.weekday < 1 || row.weekday > 7 ||
      !['A', 'B', 'C'].includes(row.place) ||
      !['1/1', '1/2', 'vorplatz'].includes(row.capacity) ||
      (row.capacity === 'vorplatz' && row.place !== 'A') ||
      !['fcd', 'atletico', 'other'].includes(row.organization) ||
      !/^\d{2}:(00|15|30|45)$/.test(row.starts_at) ||
      !/^\d{2}:(00|15|30|45)$/.test(row.ends_at) ||
      row.starts_at >= row.ends_at ||
      (row.valid_from && row.valid_until && row.valid_from > row.valid_until))
    throw new Error('Bitte Mannschaft, Zeiten, Platz und Gültigkeit prüfen.');
  const result = item.id
    ? await client.from('training_rules').update(row).eq('id', item.id).select()
    : await client.from('training_rules').insert(row).select();
  const saved = check(result);
  if (saved.length !== 1) throw new Error('Eintrag wurde nicht gespeichert. Bitte die Seite neu laden.');
  return saved[0];
}
async function setTrainingRuleActive(id, active) {
  if (role() !== 'admin') throw new Error('Administratorrechte erforderlich.');
  const rows = check(await client.from('training_rules').update({ active }).eq('id', id).select());
  if (rows.length !== 1) throw new Error('Eintrag wurde nicht geändert. Bitte die Seite neu laden.');
  return rows[0];
}

async function listManagers() {
  return (await manageUsers('list')).users.filter((user) => user.role === 'manager');
}
async function listBoardMembers() {
  return (await manageUsers('list')).users.filter((user) => user.role === 'board');
}
async function manageUsers(action, payload = {}) {
  if (role() !== 'admin') throw new Error('Administratorrechte erforderlich.');
  const { data, error } = await client.functions.invoke('manage-users', {
    body: { action, ...payload }
  });
  if (error || data?.error) throw new Error(data?.error || error.message);
  return data;
}
async function inviteManager(email) {
  if (role() !== 'admin') throw new Error('Administratorrechte erforderlich.');
  const { data, error } = await client.functions.invoke('manage-users', {
    body: { action: 'invite', email, role: 'manager' }
  });
  if (error || data?.error) throw new Error(data?.error || error.message);
  return data;
}
async function inviteBoardMember(email) {
  if (role() !== 'admin') throw new Error('Administratorrechte erforderlich.');
  const { data, error } = await client.functions.invoke('manage-users', {
    body: { action: 'invite', email, role: 'board' }
  });
  if (error || data?.error) throw new Error(data?.error || error.message);
  return data;
}
async function refreshBfv() {
  if (role() !== 'admin') throw new Error('Administratorrechte erforderlich.');
  const { data, error } = await client.functions.invoke('refresh-bfv', { body: {} });
  if (error || data?.error) throw new Error(data?.error || error.message);
  await load();
  return { games: window.AppData.bfvGames, importedAt: data.importedAt };
}
async function addMowing(date, note) {
  if (role() !== 'admin') throw new Error('Administratorrechte erforderlich.');
  check(await client.from('mowing_dates').upsert({
    mowing_date: date, note: note || ''
  }).select());
  await load();
}
async function removeMowing(date) {
  if (role() !== 'admin') throw new Error('Administratorrechte erforderlich.');
  check(await client.from('mowing_dates').delete().eq('mowing_date', date).select());
  await load();
}

window.Cloud = { client, initialize, initializeAuth, load, read, save, role, login, logout,
  get needsPasswordSetup() { return needsPasswordSetup; },
  get authError() { return authError || (authInitialized && authFlow && !session ? 'invalid_link' : null); },
  updatePassword,
  listTrainingRules, saveTrainingRule, setTrainingRuleActive,
  get sources() { return clone(sources); },
  get mowing() { return clone(mowing); },
  get lastImport() { return lastImport; },
  saveSources, importGames, approveRequest, listManagers, listBoardMembers,
  inviteManager, inviteBoardMember, manageUsers, refreshBfv,
  addMowing, removeMowing };
