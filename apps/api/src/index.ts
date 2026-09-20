import { Hono } from "hono";
import { buildApi } from "./app.ts";
import { createD1Db } from "./db/client.ts";
import type { AppEnv } from "./types.ts";

const app = new Hono<AppEnv>();

// The one thing that's genuinely Cloudflare-specific: build a Drizzle
// instance from this request's D1 binding and hand it to every route via
// `c.get("db")`. Node's node.ts does the equivalent with a libSQL client
// built once at module scope instead of per-request -- see db/client.ts.
// Must run before buildApi()'s routes are mounted below -- Hono only wraps
// routes registered after a given `app.use()`.
app.use("*", async (c, next) => {
  c.set("db", createD1Db(c.env.DB));
  await next();
});

// The SPA has its own real routes at /matches, /matches/:id, etc. (see
// web/src/router.tsx), and those must not collide with this Worker's JSON
// routes of the same name -- hence the /api prefix.
app.route("/api", buildApi());

// No handler for "/" -- that path (and every other non-API one) is served
// by the built apps/web SPA instead, via wrangler.toml's [assets] block:
// run_worker_first scopes only /api/* to this Worker, everything else is a
// static asset. See wrangler.toml for the split.
export default app;
