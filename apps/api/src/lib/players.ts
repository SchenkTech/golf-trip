import type { AppDb } from "../db/client.ts";

/**
 * playerId -> display label (nickname if set, else name), for enriching a
 * match's player list. One query, reused across every match in a response,
 * rather than N+1 per match -- the roster is 14 people, cheap to load whole.
 */
export async function loadPlayerLabels(db: AppDb): Promise<Map<string, string>> {
  const all = await db.query.player.findMany();
  return new Map(all.map((p) => [p.id, p.nickname ?? p.name]));
}

/**
 * playerId -> the URL a player's own photo is currently served at, for
 * every player who has one. Same one-query-reused-everywhere shape as
 * loadPlayerLabels above; a player with no photo just has no entry, rather
 * than a null placeholder every call site would have to check for.
 *
 * The URL bakes in photoUpdatedAt as a `?v=` cache-buster (schema.ts's note
 * on player.photoUpdatedAt) -- callers just drop this straight into JSON,
 * never construct a players/:id/photo URL themselves.
 */
export async function loadPlayerPhotoUrls(db: AppDb): Promise<Map<string, string>> {
  const all = await db.query.player.findMany();
  const out = new Map<string, string>();
  for (const p of all) {
    if (p.photoUpdatedAt) out.set(p.id, `/api/players/${p.id}/photo?v=${p.photoUpdatedAt}`);
  }
  return out;
}
