import { createClient } from 'npm:@supabase/supabase-js@2.117.0';
import { reconcileGames } from './reconcile.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const reply = (status: number, value: unknown) => new Response(JSON.stringify(value), {
  status, headers: { ...cors, 'Content-Type': 'application/json' }
});
const projectUrl = Deno.env.get('SUPABASE_URL') || '';
const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
const serviceKey = secretKeys.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const cronTokenSha256 = 'b358a69a1fac75e3553a5ff124bd61003a19af1ea61b18b90a01c459e38c4478';
const berlinNow = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
};
const homeLocation = (location: string) => {
  const cleaned = location.toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');
  return cleaned.startsWith('sportanlageerlangencampingstrasse38') &&
    cleaned.includes('91056erlangen');
};
const unescapeIcs = (value: string) => value.replace(/\\n/gi, '\n')
  .replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim();
function dateTime(value: string) {
  if (!/^\d{8}T\d{6}Z?$/.test(value)) return null;
  if (!value.endsWith('Z')) return {
    date: `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`,
    time: `${value.slice(9, 11)}:${value.slice(11, 13)}`
  };
  const instant = new Date(Date.UTC(Number(value.slice(0, 4)),
    Number(value.slice(4, 6)) - 1, Number(value.slice(6, 8)),
    Number(value.slice(9, 11)), Number(value.slice(11, 13)),
    Number(value.slice(13, 15))));
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(instant).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}` };
}
type Source = { id: string; team: string; url: string; active: boolean };
function parseIcs(text: string, source: Source) {
  const records: Record<string, string>[] = [];
  let record: Record<string, string> | null = null;
  for (const line of text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n')) {
    if (line === 'BEGIN:VEVENT') { record = {}; continue; }
    if (line === 'END:VEVENT') { if (record) records.push(record); record = null; continue; }
    if (!record) continue;
    const colon = line.indexOf(':');
    if (colon >= 0) record[line.slice(0, colon).split(';')[0]] =
      unescapeIcs(line.slice(colon + 1));
  }
  return records.flatMap((entry) => {
    const start = dateTime(entry.DTSTART || ''), end = dateTime(entry.DTEND || '');
    const summary = entry.SUMMARY || '';
    if (!start || !end || start.date !== end.date || end.time <= start.time ||
      !summary.trim() || /SPIELFREI/i.test(summary) || entry.STATUS === 'CANCELLED')
      return [];
    const location = entry.LOCATION || '';
    const home = homeLocation(location);
    if (!home && location.trim()) return [];
    const category = /Pokale|Pokal/i.test(summary) ? 'Pokal' :
      /Freundschaft/i.test(summary) ? 'Freundschaftsspiel' : 'Liga';
    const uid = entry.UID || '';
    return [{
      id: `bfv-${uid || `${start.date}-${start.time}-${summary}`}`,
      game_date: start.date, starts_at: start.time, ends_at: end.time,
      name: summary.split(/, (?:Meisterschaften|Pokale|Freundschaft)/i)[0],
      // Pflichtfeld im Datenmodell; A ist nur der Startpunkt unserer Platzverteilung.
      // Die BFV-Ortsangabe (auch „Platz 1/2/3“) steuert keinen Vereinsplatz.
      category, status: home ? 'Heimspiel' : 'Ort offen', place: 'A',
      location: location || 'Keine Ortsangabe im BFV-iCal',
      source: source.team, source_ids: [source.id], uid
    }];
  });
}
const validUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'service.bfv.de' &&
      url.pathname === '/rest/icsexport/Spielplan' &&
      url.searchParams.has('staffel') && url.searchParams.has('id');
  } catch { return false; }
};
async function authorized(request: Request, admin: ReturnType<typeof createClient>) {
  const cronToken = request.headers.get('x-cron-token');
  if (cronToken) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(cronToken));
    const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    return hex === cronTokenSha256;
  }
  const bearer = request.headers.get('Authorization') || '';
  if (!bearer.startsWith('Bearer ')) return false;
  const { data, error } = await admin.auth.getUser(bearer.slice(7));
  if (error || data.user?.app_metadata?.fcd_role !== 'admin') return false;
  const caller = createClient(projectUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: bearer } }
  });
  const current = await caller.rpc('protected_session_role');
  return !current.error && current.data === 'admin';
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return reply(200, {});
  if (request.method !== 'POST') return reply(405, { error: 'Methode nicht erlaubt.' });
  if (!projectUrl || !serviceKey) return reply(503, { error: 'Serverkonfiguration fehlt.' });
  const admin = createClient(projectUrl, serviceKey,
    { auth: { persistSession: false, autoRefreshToken: false } });
  if (!await authorized(request, admin)) return reply(403, { error: 'Nicht berechtigt.' });
  const { data: sources, error: sourceError } = await admin.from('bfv_sources')
    .select('id,team,url,active').eq('active', true);
  if (sourceError) return reply(502, { error: sourceError.message });
  if (!sources?.length || sources.some((source) => !validUrl(source.url)))
    return reply(400, { error: 'Keine gültigen aktiven BFV-Quellen.' });
  const urls = [...new Set(sources.map((source) => source.url))];
  const downloads = await Promise.all(urls.map(async (url) => {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      if (!text.includes('BEGIN:VCALENDAR')) throw new Error('Kein iCal-Kalender');
      return { url, text };
    } catch (error) { return { url, error: String(error) }; }
  }));
  const errors = downloads.filter((item) => 'error' in item);
  if (errors.length) return reply(502, {
    error: `${errors.length} BFV-Quelle(n) nicht erreichbar. Bisherige Daten bleiben erhalten.`
  });
  const games = new Map<string, ReturnType<typeof parseIcs>[number]>();
  for (const downloaded of downloads) {
    if (!('text' in downloaded)) continue;
    for (const source of sources.filter((item) => item.url === downloaded.url)) {
      for (const game of parseIcs(downloaded.text, source)) {
        const key = game.uid || `${game.game_date}|${game.starts_at}|${game.name}`;
        if (games.has(key)) games.get(key)!.source_ids.push(source.id);
        else games.set(key, game);
      }
    }
  }
  if (!games.size) return reply(502, { error: 'BFV liefert keine gültigen Termine; Daten bleiben erhalten.' });
  const { data: old, error: oldError } = await admin.from('bfv_games')
    .select('id,game_date,ends_at');
  if (oldError) return reply(502, { error: oldError.message });
  const importedAt = new Date().toISOString();
  const plan = reconcileGames(old || [], [...games.values()], berlinNow());
  const rows = plan.upserts.map((game) => ({ ...game, missing_from_feed: false, imported_at: importedAt }));
  for (let index = 0; index < rows.length; index += 100) {
    const { error } = await admin.from('bfv_games').upsert(rows.slice(index, index + 100));
    if (error) return reply(502, { error: error.message });
  }
  for (let index = 0; index < plan.retainedIds.length; index += 100) {
    const { error } = await admin.from('bfv_games')
      .update({ missing_from_feed: false, imported_at: importedAt })
      .in('id', plan.retainedIds.slice(index, index + 100));
    if (error) return reply(502, { error: error.message });
  }
  for (let index = 0; index < plan.futureMissingIds.length; index += 100) {
    const { error } = await admin.from('bfv_games')
      .update({ missing_from_feed: true, imported_at: importedAt })
      .in('id', plan.futureMissingIds.slice(index, index + 100));
    if (error) return reply(502, { error: error.message });
  }
  return reply(200, { importedAt, games: games.size, archived: plan.archived,
    missingFuture: plan.missingFuture });
});

