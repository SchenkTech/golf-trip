# Decisions

Why things are the way they are, so the next person — including us in April —
does not have to re-litigate them.

## 1. Rebuild rather than simplify the existing app

The first attempt forked an existing tournament-management system, deployed it,
and added Nassau scoring to it. The verdict from the people who would actually
use it: too complicated, and it needs to be user friendly for *this* audience —
a dozen friends on a golf trip, not tournament administrators.

That is right, and it is not a UI problem. That system is built to *manage*
tournaments — enrollment requests, approvals, a five-state competition machine,
136 endpoints. This needs to *show a scoreboard*. Simplifying the first into the
second means deleting most of it.

Carried over: the Nassau and WHS handicap maths, and the course data.
Left behind: everything else.

## 2. PWA, not native iOS/Android

Rejected native on distribution, not capability.

- TestFlight builds **expire after 90 days**. The event is annual. Every year
  would begin by walking twelve people through installing a beta client.
- The App Store means review for an app twelve people can use.
- A scoreboard bug on Saturday morning is a five-minute deploy on the web and a
  day of review on native.
- One codebase covers both platforms immediately, rather than "Android later".

Revisit if we ever need background push or true background sync. Neither is on
the list.

## 3. Points derived, never stored

See `SCORING.md`. The short version: the rules will change, and stored points
cannot be recomputed.

## 4. Anyone can score, with attribution; last write wins

Three options were considered:

- *Last write wins, silently* — someone's correct entry disappears and nobody
  knows. This is how a scoreboard loses trust.
- *Last write wins, attributed* ✅ — anyone can overwrite, everyone can see who
  entered what and when. Disagreements surface as conversations.
- *Dual entry and verification* — rigorous, and exactly the friction this app
  exists to remove. This is what the old system does.

A designated scorer is a UI nudge, not a lock, so both requirements — everyone
able to enter, and the option for particular people to own it — hold at the same
time.

## 5. Admin lives in the same app, role-gated

Not a separate app (doubles deployment for three screens), and not the old
system (two databases, a permanent sync problem, and the friction we are
leaving). Admin is a tab in the nav, gated by who you are.

## 6. Sign-in calibrated to twelve friends

Public read, a join code plus a name to score, real logins only for admins.
An email round-trip on the first tee is a failure.

## 7. Offline-first

The courses have dead patches. Entries queue on the device and sync later,
idempotently, and the UI is honest about what has not yet been sent.

## 8. Two views of a match: Enter and Card

The obvious scoring screen is a full scorecard grid — 18 rows, a column per
player. Correct for reviewing a round, wrong for entering a score one-handed on
a tee: seven columns on a phone forces horizontal scrolling and small targets.

Rather than pick, ship both against the same data. `Enter` is one hole filling
the screen; `Card` is the grid. A toggle, not a setting.

---

## Open

- **Stack.** Not yet chosen. The one hard requirement is that offline entry and
  the service worker are first-class, not retrofitted.
- **Hosting.** The k8s cluster, Postgres, Flux, GHCR and the Cloudflare tunnel
  are already running and proven — adding a second small app is now cheap.
- **Access control on the public URL.** Once real names, emails and handicaps
  are in, that is PII on the open internet. Cloudflare Access already fronts
  other services here and should front this one.
