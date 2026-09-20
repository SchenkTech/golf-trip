import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { env } from "hono/adapter";
import { createSession } from "../lib/session.ts";
import type { AppEnv } from "../types.ts";

export const auth = new Hono<AppEnv>();

const STATE_COOKIE = "gc_oauth_state";
const SESSION_COOKIE = "gc_session";

/** Step 1: send the browser to Google. `state` is a CSRF token, not an
 *  identity of any kind -- it just proves the browser that lands on the
 *  callback is the same one this redirect went out to. */
auth.get("/google/start", (c) => {
  const state = crypto.randomUUID();
  setCookie(c, STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: 600, // the whole round trip through Google should take seconds, not minutes
    path: "/",
  });

  const { GOOGLE_CLIENT_ID, GOOGLE_REDIRECT_URI } = env(c);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", GOOGLE_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email");
  url.searchParams.set("state", state);
  // No refresh token, no offline access -- this only ever needs to know
  // who's signed in right now, never to act as them later.
  url.searchParams.set("prompt", "select_account");

  return c.redirect(url.toString());
});

/** Step 2: Google sends the browser back here with a one-time code. This
 *  Worker exchanges it directly with Google (server to server, over TLS,
 *  authenticated with GOOGLE_CLIENT_SECRET) for an id_token -- because
 *  that exchange is itself authenticated and TLS-protected, the id_token
 *  in the response can be trusted and decoded directly. Re-verifying its
 *  JWT signature would only re-prove what the authenticated HTTPS request
 *  that fetched it already proved. */
auth.get("/google/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const expectedState = getCookie(c, STATE_COOKIE);
  deleteCookie(c, STATE_COOKIE, { path: "/" });

  if (!code || !state || !expectedState || state !== expectedState) {
    return c.redirect("/admin?error=state");
  }

  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, ADMIN_EMAILS, SESSION_SECRET } = env(c);
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return c.redirect("/admin?error=google");

  const { id_token } = await tokenRes.json<{ id_token: string }>();
  const payloadB64 = id_token.split(".")[1];
  const claims = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"))) as {
    email?: string;
    email_verified?: boolean;
  };

  const allowed = ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase());
  if (!claims.email || !claims.email_verified || !allowed.includes(claims.email.toLowerCase())) {
    return c.redirect("/admin?error=not_admin");
  }

  const session = await createSession(claims.email, SESSION_SECRET);
  setCookie(c, SESSION_COOKIE, session, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
  });

  return c.redirect("/admin");
});

auth.post("/logout", (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});
