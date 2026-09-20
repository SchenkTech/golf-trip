import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { env } from "hono/adapter";
import { verifySession } from "./session.ts";
import type { AppEnv } from "../types.ts";

const SESSION_COOKIE = "gc_session";

/**
 * Real auth: a signed session cookie set by routes/auth.ts's Google OAuth
 * callback, checked on every /api/admin/* request. The email allowlist is
 * enforced once, at sign-in (auth.ts refuses to issue a session for an
 * email not in ADMIN_EMAILS) -- this middleware trusts a valid session,
 * not the allowlist directly, since a signed session already proves that
 * check already happened.
 */
export async function requireAdmin(c: Context<AppEnv>, next: Next) {
  const token = getCookie(c, SESSION_COOKIE);
  const email = token ? await verifySession(token, env(c).SESSION_SECRET) : null;

  if (!email) return c.json({ error: "not signed in" }, 401);

  await next();
}
