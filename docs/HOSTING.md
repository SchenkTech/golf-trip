# Hosting

## The constraint that decides it

This app has a hard three-day window, once a year, during which it must work —
and during those three days everyone who depends on it is in Ocean City, 100
miles from the rack.

That inverts the usual homelab calculus. For 362 days a year, uptime does not
matter at all. For three, it matters completely, and nobody is home to fix
anything. Self-hosting this means the home internet connection, the Cloudflare
tunnel, the k8s cluster, a Longhorn volume and a Postgres pod all have to stay
up, unattended, while you are on a golf course with one bar of signal.

The other services on that cluster can wait until Sunday night. This one cannot.

## Recommendation: Cloudflare (Workers + D1 + Pages)

Already the platform this setup leans on — DNS, the tunnel, and Access all run
there — so it is one fewer vendor, not one more.

- **Free at this scale.** Twelve players, three days, a few thousand writes. The
  free tier is not a trial that runs out; it is simply larger than this app.
- **Nothing to keep running.** No node, no pod, no volume, no certificate.
- **D1 has point-in-time recovery** (Time Travel, 30 days) built in — durability
  without a backup pipeline to build and then forget to test.
- **Access already fronts other services here**, so putting the admin area
  behind it is a config change rather than a project.
- **Global edge** — the app is fast from the course, not routed back through a
  home connection in another state.

The trade is SQLite semantics rather than Postgres, and Workers rather than a
long-running process. For eleven tables and a scoreboard, neither costs anything.

## The alternatives, honestly

**AWS, cheaply.** Genuinely possible: Lambda + DynamoDB + S3/CloudFront lands
near a dollar or two a month at this volume, with real durability. But it is
noticeably more assembly than Cloudflare for the same outcome, and the pieces
that feel more familiar — RDS, Fargate, Aurora Serverless — are the expensive
ones ($15–45/month for something idle 362 days a year). Aurora Serverless v2 in
particular has a minimum spend that makes no sense here.

**Fly.io / Render / Railway.** Around $5–10/month with a small managed Postgres.
Closest to "just deploy the container", keeps Postgres, and is a reasonable pick
if the stack ends up wanting a long-running server.

**Self-host on the existing cluster.** The pipeline is already proven — Flux,
GHCR, the tunnel, TLS — so the marginal cost is nearly zero and it is the
fastest path to a running thing. It is the right home for **dev and staging**.
It is the wrong home for the live event, for the reason above. And note the
cluster currently has **no Longhorn backup target configured and no pg_dump
job** — so "run it myself with robust backups" is work that does not exist yet,
not a switch to flip.

## So

Build and iterate on the homelab if that is comfortable. Put the live event on
managed hosting. The data is small enough that moving it either way is a file,
not a migration — which is another argument for keeping the schema boring.

Either way: **export the finished event to a file after each trip.** Three days
of hole scores is a few hundred kilobytes, and it is the only copy of a year
that cannot be replayed.
