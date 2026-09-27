import { Hono } from "hono";
import { env } from "hono/adapter";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema.ts";
import type { AppEnv } from "../types.ts";

export const players = new Hono<AppEnv>();

/** Same limit as routes/events.ts's trip photos -- generous for a phone
 *  photo, stingy enough that nobody fills the bucket with one upload. */
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/** One R2 object per player, always this same key -- a photo upload
 *  overwrites the previous one rather than versioning it (see schema.ts's
 *  note on player.photoUpdatedAt for how a replaced photo still busts
 *  caches without needing to track or clean up an old key). */
function r2KeyFor(playerId: string): string {
  return `players/${playerId}`;
}

/** A player's own photo, streamed from R2 -- public, same "reading needs
 *  nothing" rule as the Board and Teams themselves. 404s for a player
 *  with none set, or one that doesn't exist. */
players.get("/:id/photo", async (c) => {
  const db = c.get("db");
  const bucket = env(c).PHOTOS;
  if (!bucket) return c.json({ error: "photo storage isn't configured for this deployment" }, 501);

  const player = await db.query.player.findFirst({ where: eq(schema.player.id, c.req.param("id")) });
  if (!player || !player.photoUpdatedAt) return c.json({ error: "no photo set" }, 404);

  const object = await bucket.get(r2KeyFor(player.id));
  if (!object) return c.json({ error: "no photo set" }, 404);

  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "image/jpeg",
      // Not `immutable`: this URL's own key is reused on every re-upload
      // (see r2KeyFor above), so the bytes behind one exact URL genuinely
      // can change -- lib/players.ts's `?v=` cache-buster is what actually
      // guarantees a fresh fetch after a replacement, this header doesn't
      // need to overclaim on top of that.
      "Cache-Control": "public, max-age=31536000",
    },
  });
});

/** Upload or replace a player's own photo -- multipart/form-data, same
 *  shape as routes/events.ts's trip-photo upload. Deliberately no join-
 *  code gate and no attempt to verify "is this device really that
 *  player": same trust model as score entry (docs/DECISIONS.md #4/#6) --
 *  any device can already enter a score attributed to any roster name, and
 *  a photo is lower stakes than a score. The apps/web client only ever
 *  shows an upload control on the row matching the device's own picked
 *  identity (lib/identity.ts), or in Admin -- a UI convention, not a
 *  security boundary, exactly like the "who are you" picker it reuses. */
players.post("/:id/photo", async (c) => {
  const db = c.get("db");
  const bucket = env(c).PHOTOS;
  if (!bucket) return c.json({ error: "photo storage isn't configured for this deployment" }, 501);

  const playerId = c.req.param("id");
  const player = await db.query.player.findFirst({ where: eq(schema.player.id, playerId) });
  if (!player) return c.json({ error: "player not found" }, 404);

  const body = await c.req.parseBody();
  const file = body["photo"];
  if (!(file instanceof File)) return c.json({ error: "photo file required" }, 400);
  if (!file.type.startsWith("image/")) return c.json({ error: "file is not an image" }, 400);
  if (file.size > MAX_PHOTO_BYTES) return c.json({ error: "photo is too large" }, 413);

  await bucket.put(r2KeyFor(playerId), await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });

  const photoUpdatedAt = Date.now();
  await db.update(schema.player).set({ photoUpdatedAt }).where(eq(schema.player.id, playerId));

  return c.json({ photoUrl: `/api/players/${playerId}/photo?v=${photoUpdatedAt}` }, 201);
});
