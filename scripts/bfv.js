(function () {
  const base = 'https://service.bfv.de/rest/icsexport/Spielplan?staffel=';
  const club = '00ES8GNKSG00000CVV0AG08LVUPGND5I';
  const otherClub = '01VQC82JH8000000VS54898FVUOCROKJ';
  const source = (row, team, staffel, id) => ({ id: `excel-${row}`, team, url: `${base}${staffel}&id=${id}`, active: true, row });
  const defaults = [
    source(5, 'Herren', '03170DLLLS000006VS5489BUVSBBVPEU-G', club),
    source(7, 'A-Jugend', '031NDIRUTO000004VS5489BUVT2M8LCU-G', club),
    source(9, 'B-Jugend', '031NENIVU0000004VS5489BUVT2M8LCU-G', '00ES8GNKSG00000NVV0AG08LVUPGND5I'),
    source(10, 'C-Jugend', '031NPJQ0MC000004VS5489BUVT2M8LCU-G', '00ES8GNKSG00000DVV0AG08LVUPGND5I'),
    source(11, 'C-Jugend 2', '031NPRM8D0000004VS5489BUVT2M8LCU-G', '00ES8GNKSG00000DVV0AG08LVUPGND5I'),
    source(12, 'D-Jugend', '031NRDK19S000005VS5489BUVT2M8LCU-G', club),
    source(13, 'E-Jugend', '031S6E4KIO000005VS5489BTVTPHHFPR-G', club),
    source(24, 'Atletico Ü32', '02VPA7UUJO000006VS5489BTVTG66ASV-G', otherClub),
    source(25, 'Atletico', '03170DHMDC000006VS5489BUVSBBVPEU-G', otherClub),
    source(26, 'Atletico', '03170DLLLS000006VS5489BUVSBBVPEU-G', otherClub),
    source(27, 'Atletico / A-Jugend', '031NDIRUTO000004VS5489BUVT2M8LCU-G', club),
    source(28, 'Atletico', '02TRS60ADS000009VS5489BUVVJ8R9DS-G', otherClub),
    source(29, 'Atletico', '031PVQEDD8000004VS5489BUVSV0FPBG-G', otherClub),
    source(30, 'Atletico', '03011IFQOO000004VS5489BTVTLR7B3N-G', otherClub)
  ];
  const key = 'sg-bfv-sources-v1';
  const cacheKey = 'sg-bfv-cache-v2';
  const store = typeof localStorage === 'undefined' ? null : localStorage;
  function sources() {
    if (window.Cloud) return window.Cloud.sources;
    try {
      const saved = JSON.parse(store.getItem(key));
      if (Array.isArray(saved)) return saved.map((item) => item.id === 'excel-24' && item.team === 'Atletico' ? { ...item, team: 'Atletico Ü32' } : item);
    } catch {}
    return defaults.map((item) => ({ ...item }));
  }
  function saveSources(items) {
    if (window.Cloud) return window.Cloud.saveSources(items);
    store.setItem(key, JSON.stringify(items));
  }
  function cached() {
    if (window.Cloud) return { games: window.AppData.bfvGames, importedAt: window.Cloud.lastImport };
    try { return JSON.parse(store.getItem(cacheKey)); } catch { return null; }
  }
  function saveCache(value) { store.setItem(cacheKey, JSON.stringify(value)); }
  const unescapeIcs = (value) => value.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim();
  function dateTime(value) {
    if (!/^\d{8}T\d{6}Z?$/.test(value)) return null;
    const y = Number(value.slice(0, 4)), m = Number(value.slice(4, 6)) - 1, d = Number(value.slice(6, 8));
    const h = Number(value.slice(9, 11)), min = Number(value.slice(11, 13)), sec = Number(value.slice(13, 15));
    // BFV-Zeiten mit Z sind UTC; Zeiten ohne Z sind lokale Stadionzeit.
    if (!value.endsWith('Z')) return { date: `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`, time: `${value.slice(9, 11)}:${value.slice(11, 13)}` };
    const instant = new Date(Date.UTC(y, m, d, h, min, sec));
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(instant).map((part) => [part.type, part.value]));
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
  }
  function homeLocation(location) {
    const cleaned = location.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '');
    return cleaned.startsWith('sportanlageerlangencampingstrasse38') && cleaned.includes('91056erlangen');
  }
  function parse(text, sourceItem) {
    const lines = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
    const records = []; let record = null;
    for (const line of lines) {
      if (line === 'BEGIN:VEVENT') { record = {}; continue; }
      if (line === 'END:VEVENT') { if (record) records.push(record); record = null; continue; }
      if (!record) continue;
      const colon = line.indexOf(':'); if (colon < 0) continue;
      record[line.slice(0, colon).split(';')[0]] = unescapeIcs(line.slice(colon + 1));
    }
    return records.map((record) => {
      const begin = dateTime(record.DTSTART || ''), end = dateTime(record.DTEND || '');
      const summary = record.SUMMARY || '';
      if (!begin || !end || begin.date !== end.date || !summary.trim() ||
        end.time <= begin.time || /SPIELFREI/i.test(summary) ||
        record.STATUS === 'CANCELLED') return null;
      const location = record.LOCATION || '', home = homeLocation(location);
      if (!home && location.trim()) return null;
      const category = /Pokale|Pokal/i.test(summary) ? 'Pokal' : /Freundschaft/i.test(summary) ? 'Freundschaftsspiel' : 'Liga';
      // A ist nur der neutrale Startpunkt unserer Verteilung, keine BFV-Platzzuweisung.
      return { id: `bfv-${record.UID || `${begin.date}-${begin.time}-${summary}`}`, date: begin.date, from: begin.time, to: end.time, name: summary.split(/, (?:Meisterschaften|Pokale|Freundschaft)/i)[0], category, status: home ? 'Heimspiel' : 'Ort offen', place: 'A', location: location || 'Keine Ortsangabe im BFV-iCal', source: sourceItem.team, sourceIds: [sourceItem.id], uid: record.UID || '' };
    }).filter(Boolean);
  }
  async function refresh(options = {}) {
    const items = sources().filter((item) => item.active);
    const unique = [...new Set(items.map((item) => item.url))];
    const results = await Promise.all(unique.map(async (url) => {
      try { const response = await fetch(url, { cache: 'no-store' }); if (!response.ok) throw new Error(`HTTP ${response.status}`); return { url, text: await response.text() }; }
      catch (error) { return { url, error: String(error.message || error) }; }
    }));
    const errors = results.filter((result) => result.error).map((result) => ({ url: result.url, error: result.error }));
    if (errors.length && !options.allowPartial) return { ok: false, errors, retained: cached() };
    const gamesById = new Map();
    for (const result of results) {
      if (result.error) continue;
      const associated = items.filter((item) => item.url === result.url);
      for (const item of associated) for (const game of parse(result.text, item)) {
        const key = game.uid || `${game.date}|${game.from}|${game.name}`;
        if (gamesById.has(key)) gamesById.get(key).sourceIds.push(item.id);
        else gamesById.set(key, game);
      }
    }
    const snapshot = { importedAt: new Date().toISOString(), sourceCount: unique.length, games: [...gamesById.values()].sort((a, b) => a.date.localeCompare(b.date) || a.from.localeCompare(b.from)), errors };
    saveCache(snapshot);
    return { ok: true, snapshot };
  }
  window.BfvData = { defaults, sources, saveSources, cached, refresh, parse, homeLocation };
}());
