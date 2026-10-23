type StoredGame = { id: string; game_date: string; ends_at: string };
type FeedGame = StoredGame & Record<string, unknown>;

export function reconcileGames<T extends FeedGame>(existing: StoredGame[], incoming: T[], localNow: string) {
  const oldById = new Map(existing.map((game) => [game.id, game]));
  const incomingIds = new Set(incoming.map((game) => game.id));
  const completed = (game: StoredGame) => `${game.game_date}T${game.ends_at.slice(0, 5)}` <= localNow;
  const upserts = incoming.filter((game) => !oldById.has(game.id) || !completed(oldById.get(game.id)!));
  const retained = existing.filter((game) => completed(game));
  const futureMissing = existing.filter((game) => !completed(game) && !incomingIds.has(game.id));
  return {
    upserts,
    retainedIds: retained.map((game) => game.id),
    futureMissingIds: futureMissing.map((game) => game.id),
    archived: retained.filter((game) => !incomingIds.has(game.id)).length,
    missingFuture: futureMissing.length
  };
}
