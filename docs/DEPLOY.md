# Deploy

Four ways to run this, in the order the codebase actually supports them.
Cloudflare is what the original trip runs today and is the only one of the
four validated against a real deploy.

**Railway and Render are the two being tested next**, chosen on popularity
and on taking this repo as-is: both run `npm ci && npm run build` then
`npm start` against `apps/api/src/node.ts`, with no Dockerfile and no code
changes. Each has a committed config so the dashboard has nothing to guess
at — `railway.json` and `render.yaml`, both at the repo root.

What has actually been verified for that path, locally: the web build, the
migrations applied to a file-backed libSQL database, the example seed, the
Node server booting, `/api/health`, the API returning a seeded event, and
the SPA serving both `/` and a deep link like `/trips/2026`. What has *not*
been verified is either platform's own build environment, or Turso as the
database rather than a local file.

Fly.io stays documented but untested — it wants a Dockerfile, which is a
different shape of work.

Expect a wrinkle or two the first time through; this doc gets corrected once
that happens, not treated as gospel before it does.

## The shape of it, once

Every target here runs on the SQLite family — Cloudflare D1, or
[Turso](https://turso.tech) (managed libSQL) for everywhere else — never
Postgres. That's deliberate: `apps/api/src/db/schema.ts` never changes
between targets, because Drizzle's D1 and libSQL drivers share the same
SQLite-dialect query builder. The only thing that differs per target is
which client builds the `db` handle (`apps/api/src/db/client.ts`) and how
that handle reaches each request (`index.ts`'s per-request Cloudflare
middleware vs. `node.ts`'s one built at boot).

Every non-Cloudflare target is the same Node app
(`apps/api/src/node.ts`), so their setup is identical except for how each
platform wants the process started and its env vars entered:

- **Build**: `npm run build` (repo root) — builds `apps/web` to
  `apps/web/dist`, which `node.ts` serves for every non-`/api` route.
- **Start**: `npm start` (repo root) — runs `apps/api`'s Node entrypoint via
  `tsx`, no separate compile step.
- **Migrate**: `npm run migrate` (repo root, needs `DATABASE_URL` set first)
  — applies `apps/api/drizzle/*.sql` to whatever `DATABASE_URL` points at.
  Run once per deploy of a schema change, same as the Cloudflare workflow
  runs `wrangler d1 migrations apply` before every deploy.

Env vars every non-Cloudflare target needs (Cloudflare's equivalents are in
its own section below):

| Var | What |
|---|---|
| `DATABASE_URL` | `libsql://<db>.turso.io` (Turso) or `file:./data.sqlite` (local/single-instance disk) |
| `DATABASE_AUTH_TOKEN` | Turso auth token. Omit for a local file. |
| `GOOGLE_CLIENT_ID` | Same OAuth client as Cloudflare's, or a second one — see below. |
| `GOOGLE_CLIENT_SECRET` | Paired secret. Never commit this. |
| `GOOGLE_REDIRECT_URI` | `https://<this-deployment's-public-url>/api/auth/google/callback` — must be added to the OAuth client's allowed redirect URIs in Google Cloud Console, exactly, or every sign-in fails at Google's own consent screen. |
| `SESSION_SECRET` | Any long random string, unique per deployment (`openssl rand -hex 32`). Signs the session cookie — rotating it logs everyone out, nothing worse. |
| `ADMIN_EMAILS` | Comma-separated allow-list for `/admin`. |
| `PORT` | Most platforms inject this themselves; `node.ts` reads it and falls back to `8787`. |

One Google OAuth client can list more than one redirect URI, so a single
OAuth client can cover Cloudflare
and a second self-hosted copy at once — add each deployment's callback URL
to the same client rather than making a new one per target, unless you
genuinely want them to be separate apps with separate consent screens.

## Cloudflare (Workers + D1) — canonical, live

What the live copy actually runs. See `docs/HOSTING.md` for why.

1. `npx wrangler d1 create <your-db-name>` — note the `database_id` it
   prints.
2. In `apps/api/wrangler.toml`: set `database_id` to that id, and update
   `[vars]` — `GOOGLE_CLIENT_ID`, `ADMIN_EMAILS`, and `GOOGLE_REDIRECT_URI`
   (`https://<your-domain>/api/auth/google/callback`) to your own. Update or
   remove the `[[routes]]` custom-domain blocks for your own domain(s), or
   delete them entirely to fall back to the default `*.workers.dev` URL.
3. Secrets, never in `wrangler.toml`:
   ```
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   npx wrangler secret put SESSION_SECRET
   ```
4. `npm run build --workspace=apps/web` (wrangler's `[assets]` block serves
   this directly — no separate deploy step for the frontend).
5. `npx wrangler d1 migrations apply <your-db-name> --remote`
6. `npx wrangler deploy` (from `apps/api`)

Local dev needs none of the above except a `.dev.vars` file in `apps/api`
(gitignored) with `GOOGLE_CLIENT_SECRET` and `SESSION_SECRET` — `wrangler
dev` runs the real Workers runtime against a local D1 file automatically.

CI reference: `.github/workflows/deploy-api.yml` runs steps 4–6 on every
push to `main` that touches `apps/api`, `apps/web`, or
`packages/scoring`, using `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`
repo secrets.

## Turso (needed by every target below)

1. Install the CLI and sign in: see
   [docs.turso.tech](https://docs.turso.tech/cli/installation).
2. `turso db create golfclassic`
3. `turso db show golfclassic --url` → `DATABASE_URL`
4. `turso db tokens create golfclassic` → `DATABASE_AUTH_TOKEN`
5. With both set locally: `DATABASE_URL=... DATABASE_AUTH_TOKEN=... npm run migrate`

Turso's free tier (as of writing) comfortably covers this app's scale — a
dozen players, a few thousand writes over one weekend a year.

## Railway

`.railway/railway.ts` already declares the build command, start command,
health check and the GitHub source, so step 2 is usually just confirming
what Railway read. (Railway's older `railway.json` format is deprecated and
stops being read on 2026-12-01; this repo has already moved off it.)

**IaC is declarative — read the plan before applying.** `railway config
plan` on a config that omits something Railway already has will offer to
*remove* it. The first version of this file listed only the build and start
commands, and the plan offered to disconnect the GitHub repo and delete
every environment variable on the service. Variables are listed with
`preserve()` for exactly that reason: declared so they survive, with no
values in source control.

Evaluating the config needs the `railway` npm package (a devDependency
here) and CLI 5.42.1+.

**Two things that will bite you**, both learned the hard way on a real
deploy:

- Let Railway do the install. The build command is the *build* step only.
  Add `npm ci` to it and the build dies with `EBUSY: resource busy or
  locked, rmdir '/app/node_modules/.cache'` — the builder mounts a cache
  inside `node_modules` and `npm ci` deletes `node_modules` out from under
  it.
- Railway has no way to declare environment variables in config, unlike
  Render's blueprint. Nothing prompts you, and the app exits at boot on the
  first missing one, so the deploy fails a healthcheck with no obvious
  cause. Set them before the first deploy, or right after it fails.

1. New project → Deploy from GitHub repo (your fork).
2. Settings → confirm **Build Command** `npm run build` and
   **Start Command** `npm start` at the repo root — both scripts already
   know to reach into `apps/web`/`apps/api` themselves (see "The shape of
   it, once" above), so nothing needs a working-directory override.
3. Variables tab: add every var from the table above, `DATABASE_URL`/
   `DATABASE_AUTH_TOKEN` from Turso.
4. Before the first deploy actually serves traffic, run the migration once
   — either a one-off Railway shell (`railway run npm run migrate`) or
   locally with the same `DATABASE_URL`.
5. Generate a public domain (Settings → Networking), then set
   `GOOGLE_REDIRECT_URI` to that domain's `/api/auth/google/callback` and
   add it to the OAuth client in Google Cloud Console.

## Render

`render.yaml` at the repo root is a Blueprint: **New → Blueprint**, point it
at the repo, and Render reads the service, plan, commands, health check and
the list of env vars it should ask you for, instead of you filling in a
form. Steps 1–2 collapse into that.

1. New → Blueprint → connect your fork (or New → Web Service, and set
   **Build Command** `npm ci && npm run build`, **Start Command**
   `npm start`, root directory unchanged).
2. Render prompts for every var marked `sync: false` in the blueprint —
   that's deliberate, so no secret is ever read out of the repo.
3. Note the free plan spins down when idle, and the first request after that
   takes roughly 50 seconds. For an app used three days a year that is
   mostly fine, but it is the wrong shape for the first tee on a Friday
   morning — take the paid plan for the trip itself, or keep Cloudflare for
   the live copy.
4. Render assigns `<service>.onrender.com` before first deploy — set
   `GOOGLE_REDIRECT_URI` to that plus `/api/auth/google/callback` up front,
   register it with Google, then deploy.
5. Run the migration once against the same `DATABASE_URL`, same as
   Railway's step 4 (Render's shell: `render exec` from the dashboard, or
   just run it locally).

## Fly.io + Turso

Fly wants either a `Dockerfile` or its own generated one; neither exists in
this repo yet, so `fly launch` from `apps/api`'s perspective needs a
`fly.toml` created at deploy time (`fly launch --no-deploy` will offer to
generate both — accept its Node detection, but double check the generated
start command matches `npm start` from the repo root, not `apps/api`
alone, since the build needs to see `apps/web` and `packages/scoring` too).

1. `flyctl launch --no-deploy` from the repo root — pick a region close to
   Ocean City, MD (`iad` is Fly's Virginia region) if latency for the actual
   event matters more than for everyday admin use.
2. Confirm/edit the generated `Dockerfile` so its final `CMD` is
   `npm start` and its build stage runs `npm ci && npm run build` — Fly's
   Node buildpack detection sometimes assumes a single-package app and
   misses the `npm run build --workspaces` shape.
3. `fly secrets set GOOGLE_CLIENT_SECRET=... SESSION_SECRET=... DATABASE_AUTH_TOKEN=...`
4. `fly deploy` sets the public URL — set `GOOGLE_REDIRECT_URI` (as a
   regular `fly secrets set`, or `[env]` in `fly.toml` since it isn't
   sensitive) to `https://<app>.fly.dev/api/auth/google/callback`, register
   it with Google, redeploy.
5. Run the migration once against `DATABASE_URL` before the first real
   deploy takes traffic, same as the other Node targets.

This is the one target most likely to need a real `Dockerfile` committed to
the repo once validated — worth adding then rather than guessing its exact
contents now.

## After any of these

Whichever you pick, come back and update this file with what actually
happened — the exact command that didn't work as written, the flag that
was missing, the env var name the platform wanted differently. This doc is
supposed to get more true over time, not less.
