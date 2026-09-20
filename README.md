# Golf Trip

A live scoreboard and scoring app for a Ryder-Cup-style buddies golf trip — two
teams, a few days, matches worth points, and an all-time record across the years.

Six screens a player sees: **Board**, **Matches**, **Match**, **Teams**,
**History**, **Rules** — plus an admin area for the two or three people who set
the weekend up.

- Points are **derived from hole scores, never stored**. See
  [`docs/SCORING.md`](docs/SCORING.md) — that rule is the spine of the codebase.
- **Offline-first score entry**, because courses have dead patches.
- **Public to read, light auth to score, real auth to admin** — nobody needs a
  password to look at the board.
- Installs to a phone's home screen as a PWA. One codebase, iOS and Android.

Formats: match play, Nassau (front/back/overall as three separate bets), Hi-Lo
and stroke play, crossed with singles, fourball, foursomes, scramble and
alternate shot — configured **per round**, because one weekend runs different
formats on different days.

## Docs

- Product spec: [`docs/SPEC.md`](docs/SPEC.md)
- Scoring formats and the derive-don't-store rule: [`docs/SCORING.md`](docs/SCORING.md)
- Data model: [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md)
- Decisions and their reasons: [`docs/DECISIONS.md`](docs/DECISIONS.md)
- Where it runs: [`docs/HOSTING.md`](docs/HOSTING.md)
- Deploying your own copy: [`docs/DEPLOY.md`](docs/DEPLOY.md)
- Running it for your own trip, and keeping your roster private: [`docs/PUBLISHING.md`](docs/PUBLISHING.md)

## Running it

```
npm install
npm test                       # scoring engine, award rules, side mapping
npm run dev --workspace=apps/api    # the Worker + a local D1, on :8787
npm run dev --workspace=apps/web    # the PWA, on :5173, proxying /api
```

`apps/api/seed-example.sql` sets up an example event — two teams, a fictional
roster, three rounds on one course — so the app has something to show on the
first run. Everything in it is made up.

## Where it runs

Verified on **Cloudflare Workers** (D1), **Railway** and **Render** (both on
[Turso](https://turso.tech)) — same code, same schema, no Dockerfile.
`scripts/smoke-test.sh <url>` checks a deployment end to end. See
[`docs/DEPLOY.md`](docs/DEPLOY.md), which also documents the two build
failures worth knowing about before your first deploy.

MIT licensed — see [`LICENSE`](LICENSE). Fork it and run your own trip's copy.
