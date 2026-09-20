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
