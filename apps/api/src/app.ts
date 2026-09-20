import { Hono } from "hono";
import { rounds } from "./routes/rounds.ts";
import { events } from "./routes/events.ts";
import { matches } from "./routes/matches.ts";
import { admin } from "./routes/admin.ts";
import { auth } from "./routes/auth.ts";
import { history } from "./routes/history.ts";
import { rules } from "./routes/rules.ts";
import type { AppEnv } from "./types.ts";

/**
 * Every /api/* route, shared so Cloudflare's index.ts and Node's node.ts
 * can't drift apart on what the API exposes. Returns the unmounted router
 * rather than a fully assembled app: each entrypoint still owns its own
 * db-setting middleware (see db/client.ts), and that middleware has to run
 * *before* these routes are reachable -- in Hono, `app.use()` only wraps
 * routes registered after it, so the caller must install it first, then
 * mount this at "/api", not the other way around.
 */
export function buildApi() {
  const api = new Hono<AppEnv>();

  // Unauthenticated on purpose -- see docs/SPEC.md "Sign-in": checking the
  // board needs nothing at all, and a deploy health check is the same class
  // of read.
  api.get("/health", (c) => c.json({ ok: true }));

  api.route("/rounds", rounds);
  api.route("/events", events);
  api.route("/matches", matches);
  api.route("/admin", admin);
  api.route("/auth", auth);
  api.route("/history", history);
  api.route("/rules", rules);

  return api;
}
