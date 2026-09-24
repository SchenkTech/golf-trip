import type { AppDb } from "./db/client.ts";

/** The env vars every runtime provides, one way or another -- Cloudflare
 *  via wrangler.toml `[vars]`/secrets, Node via `process.env` (see
 *  src/node.ts). `DB` is Cloudflare-only (the raw D1 binding; Node's
 *  entrypoint builds its own db and never reads this), kept here rather
 *  than split into a separate type so every route file still imports one
 *  `Env`. */
export interface Env {
  DB: D1Database;
  /** Not secret -- Google's own docs say the client ID is fine to expose,
   *  it goes out in every OAuth redirect URL anyway. See wrangler.toml. */
  GOOGLE_CLIENT_ID: string;
  /** Real secret -- set via `wrangler secret put GOOGLE_CLIENT_SECRET`
   *  (or your host's equivalent), never in wrangler.toml or the repo. A
   *  dedicated OAuth client per deployment -- see docs/DEPLOY.md. */
  GOOGLE_CLIENT_SECRET: string;
  /** Must exactly match a redirect URI registered on that OAuth client in
   *  Google Cloud Console -- Google rejects anything that doesn't, so this
   *  has to be set per deployment rather than derived from the incoming
   *  request. See routes/auth.ts and docs/DEPLOY.md. */
  GOOGLE_REDIRECT_URI: string;
  /** Real secret -- set via `wrangler secret put SESSION_SECRET` (or your
   *  host's equivalent). Signs the admin session cookie
   *  (src/lib/session.ts); a random value with no meaning of its own, not
   *  shared with any other app. */
  SESSION_SECRET: string;
  /** Comma-separated allowlist for /api/admin/* and the Google sign-in
   *  callback (src/routes/auth.ts) -- anyone can complete Google OAuth,
   *  but only these emails actually get a session. */
  ADMIN_EMAILS: string;
  /** Real secret -- set via `wrangler secret put ANTHROPIC_API_KEY` (or
   *  your host's equivalent). Powers the scorecard-photo import
   *  (routes/matches.ts's POST /:id/scorecard-ocr, lib/scorecardOcr.ts).
   *  Optional: a deployment with no key set simply has that one feature
   *  return 501, same as any other config-gated endpoint -- see
   *  docs/DEPLOY.md. */
  ANTHROPIC_API_KEY?: string;
}

/** Every route's Hono generic: env bindings plus the one request-scoped
 *  variable every route actually reads -- `db`, set once by whichever
 *  entrypoint's middleware is running (see db/client.ts). `new Hono<AppEnv>()`
 *  everywhere instead of retyping `{ Bindings: Env; Variables: {...} }`. */
export interface AppEnv {
  Bindings: Env;
  Variables: { db: AppDb };
}
