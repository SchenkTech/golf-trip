import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { buildApi } from "./app.ts";
import { createLibsqlDb } from "./db/client.ts";
import type { AppEnv } from "./types.ts";

/**
 * Node entrypoint for self-hosting off Cloudflare (Railway, Render, Fly.io+
 * Turso, or a bare VM) -- see docs/DEPLOY.md. Mirrors index.ts's Worker
 * entrypoint route-for-route via app.ts's shared buildApi(); the two things
 * that differ per runtime are how `db` gets built (below, once at module
 * scope, vs. per-request from the D1 binding) and how the SPA gets served
 * (Workers' [assets] block vs. serveStatic here).
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required env var: ${name}`);
  return value;
}

const db = createLibsqlDb(requireEnv("DATABASE_URL"), process.env.DATABASE_AUTH_TOKEN);

const app = new Hono<AppEnv>();

app.use("*", async (c, next) => {
  c.set("db", db);
  await next();
});

app.route("/api", buildApi());

// Everything outside /api is the built SPA -- apps/web/dist, same build
// Cloudflare's [assets] block serves, just handed to a Node static-file
// middleware instead of Workers' native asset handling. Falls back to
// index.html for anything not on disk so client-side routes like
// /matches/abc resolve the same way they do on Cloudflare's
// single-page-application asset config.
const webDist = process.env.WEB_DIST_DIR ?? "../web/dist";
app.use("*", serveStatic({ root: webDist }));
app.use("*", serveStatic({ path: `${webDist}/index.html` }));

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`golfclassic-api listening on http://localhost:${info.port}`);
});
