(function (root) {
  const normalized = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('de-DE');
  // BFV source is the first feed containing a game, not necessarily its home side.
  const homeTeam = (event) => event.displayHomeTeam || (event.type === 'game' || event.id?.startsWith('bfv-')
    ? String(event.team || '').split(/\s+-\s+|(?<=\S)-(?=\S)/, 1)[0].trim()
    : String(event.team || '').trim());
  const group = (event) => event.type === 'game' || event.id?.startsWith('bfv-') || ['league', 'cup', 'friendly'].includes(event.kind) ? 'game'
    : event.category === 'Training' || event.kind === 'training' ? 'training' : 'other';
  const active = (filter) => Boolean(filter.query || filter.team || filter.from || filter.to ||
    !filter.training || !filter.game || !filter.other);
  const matches = (event, date, filter) => {
    if (filter.from && date < filter.from || filter.to && date > filter.to) return false;
    if (!filter[group(event)]) return false;
    if (filter.team && homeTeam(event) !== filter.team) return false;
    return !filter.query || normalized(`${event.displayTeam || event.team} ${event.category || ''} ${event.place || ''}`)
      .includes(normalized(filter.query.trim()));
  };
  const api = { homeTeam, group, active, matches };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ScheduleFilter = api;
})(typeof window === 'undefined' ? globalThis : window);

