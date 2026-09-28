(function (root) {
  const clean = (value) => String(value || '').trim();
  const club = (name) => /^(?:\(SG\)\s*)?FC Dechsendorf\b/i.test(name) ? 'fcd'
    : /^Atl[eé]tico Erlangen\b/i.test(name) ? 'atletico' : '';
  const parts = (name) => {
    const match = clean(name).match(/^(.+?)(?:\s+-\s+|(?<=\S)-(?=\S))(.+)$/);
    return match ? [match[1].trim(), match[2].trim()] : null;
  };
  function sourceFor(game, sources, home) {
    const ids = Array.isArray(game.sourceIds) ? game.sourceIds : [];
    const candidates = ids.map((id) => sources.find((source) => source.id === id)).filter(Boolean);
    const homeClub = club(home);
    if (homeClub) return candidates.find((source) => source.organization === homeClub)
      || (candidates.length === 1 && (!candidates[0].organization || candidates[0].organization === homeClub) ? candidates[0] : null);
    // A Spielgemeinschaft can have another official home name; one feed is unambiguous.
    if (game.status === 'Heimspiel' && candidates.length === 1) return candidates[0];
    return null;
  }
  function labelFor(game, sources, home) {
    const source = sourceFor(game, sources, home);
    const sourceName = clean(source?.team || (!game.sourceIds?.length ? game.source : ''));
    if (/^[A-G]-Jugend(?:\s+\d+)?$/i.test(sourceName)) return sourceName;
    if (/^Herren(?:\s+\d+)?$/i.test(sourceName) && club(home) === 'fcd') return sourceName;
    if (/^Damen(?:\s+\d+)?$/i.test(sourceName) && club(home) === 'fcd') return sourceName;
    if (/^Atletico Ü32$/i.test(sourceName) && club(home) === 'atletico') return 'Ü32';
    if (/^Atletico(?: II)? Herren$/i.test(sourceName) && club(home) === 'atletico') return 'Herren';
    if (/^Atl[eé]tico Frauen Freizeitsport$/i.test(sourceName) && club(home) === 'atletico') return 'Frauen (Freizeitsport)';
    return '';
  }
  function format(game, sources = []) {
    const name = clean(game.name), pair = parts(name);
    if (!pair) return { title: name, homeTeam: name };
    const [home, away] = pair;
    const label = labelFor(game, sources, home);
    const heading = label && !home.toLocaleLowerCase('de-DE').endsWith(label.toLocaleLowerCase('de-DE'))
      ? `${home} ${label}` : home;
    return { title: label ? `${heading} – ${away}` : name, homeTeam: heading };
  }
  const api = { format };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GameTitle = api;
})(typeof window === 'undefined' ? globalThis : window);

