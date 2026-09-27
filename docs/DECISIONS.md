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

## 9. Scorecard import is a photo reader, run entirely on the device

Checked whether the group's other scoring app exposes anything to connect
to: no public API, no CSV or PDF export, no structured share format --
confirmed against their own docs and app listing (which app, and the
research, is in docs/TRIP.md -- the finding generalizes to any such app,
so the reasoning stays here and the name doesn't). The only thing that
ever leaves it is a picture a human looks at, which is also literally how
its own "photo scorecard" feature gets a paper card in the other
direction. So a photo was always the whole integration surface, generic to
any scoring app's screenshot or a paper card -- never tied to one product.

The first version sent that photo to a hosted vision model (a hono route,
an `ANTHROPIC_API_KEY` secret) and asked it to read the whole grid
semantically -- which player, which hole, in one call. Reversed after it
shipped: that was this app's first metered, pay-per-use, account-requiring
dependency, in a codebase where every other integration (Google OAuth,
Turso/D1, Cloudflare Workers) is free at this scale by design (see
docs/HOSTING.md). A feature only a dozen friends use a few times a year
doesn't need an ongoing bill to exist.

So the reading runs entirely on the device instead (Tesseract, an
open-source OCR engine bundled into the PWA itself -- see
lib/tesseractRecognize.ts). No account, no cost, no photo ever leaves the
phone. The real cost: local OCR reads characters, not a scorecard -- it
has no idea a photo is a grid of players and holes, only text and where it
sits on the page. Turning that into "hole 4, this player, this score"
needs a person to say how many columns and rows the photo actually shows
(lib/scorecardOcr.ts's layout step, a known-count clustering of the raw
positions -- deliberately not an attempt to *guess* the grid shape, which
is a much harder problem than asking two numbers). What comes back is
still only ever a *proposal*: nothing is written until a person reviews
the grid and taps Apply, at which point it is the exact same batch write a
manual tap makes (`POST /:id/scores`) -- same offline queue, same
last-write-wins, same attribution.

## 10. Rules and Admin move behind a "More" tab

The bottom nav had grown to six tabs (Board, Matches, Teams, History, Rules,
Admin) as features were added one at a time, each grabbing its own icon.
Six is cramped on a phone held one-handed, and two of the six are pages most
visits never touch: Rules gets read once a year, before anyone's asked "wait,
so the back nine is separate?", and Admin is three screens for two or three
people (docs/SPEC.md).

Condensed to five: Matches, Teams, Board (centred, per docs/SPEC.md's
original "Board in the centre" line, which the six-tab bar had drifted away
from), History, More. More is a plain two-row list linking to Rules and
Admin — both keep their own route and screen, so a direct link to either
still works. Nothing about Rules or Admin's own access rules changed; only
how a tab bar reaches them did.

## 11. Photo albums, reversed — but off by default and admin-gated

docs/SPEC.md ruled out "photo galleries" outright, alongside chat and push
notifications, as things that don't belong in an app built to make the first
screen faster to understand, not slower. Reversed on request, but not by
dropping the reasoning — by keeping the feature entirely optional and
answering the actual complaint (random uploads showing up outside the trip)
with two separate switches on the event, not one:

- **`photosEnabled`** — whether the album (and its More-menu link) exists at
  all right now. Off by default. While it's off, nothing about photos is
  reachable: no screen, no list, no image link, even a saved direct URL
  404s. This is the one that makes it a real "no feature most of the year,"
  not a hidden-but-still-serving one.
- **`photosUploadEnabled`** — whether new photos can be added, independent
  of the switch above. The point of splitting these: an admin can leave a
  finished trip's album up to browse (`photosEnabled` on) without leaving it
  open to new uploads (`photosUploadEnabled` off) outside the weekend
  itself, then flip both on for the trip.

Storage is Cloudflare R2 (`routes/events.ts`'s photo routes, `apps/api/src/
types.ts`'s `PHOTOS` binding) — the first new piece of paid-capable
infrastructure since docs/DECISIONS.md #9 reversed course on a hosted OCR
API for exactly this reason. R2's free tier is generous enough for a dozen
friends' weekend photos, and the binding is optional: a deployment that
never enables R2 (the Node/self-host entrypoint has no equivalent, and
`wrangler.example.toml`'s block can just be deleted) gets a plain "not
configured" response from the upload route instead of a broken build, the
same graceful-absence pattern `ANTHROPIC_API_KEY` used to follow.

Uploading (not viewing) needs the same join code plus a name
docs/DECISIONS.md #6 already uses for scoring, reusing the same device
identity — no separate photos-specific auth to build or explain.

## 12. Payouts are declared, not derived — and admin-only

docs/SPEC.md's "explicitly out of scope" list also named "betting or
side-game ledgers." Reversed the same way #11 reversed photo galleries —
narrowly, with an admin-only switch — rather than dropped from the list:
this app still doesn't grow a public money screen just because one
group wanted an admin tool.

**Why declared, not derived.** Everywhere else in this app the rule is
docs/SCORING.md's "derive, don't store" — a standing, a point total, a
win-loss record is always computed fresh from hole scores, never typed
in. Side-bet payouts break that rule on purpose. A real pool's payout
doesn't scale by a fixed multiple of its buy-in — the group's own numbers
have a $2.25 buy-in paying $31.50 (14×, the whole field) sitting next to
an $18.50 buy-in paying $111 (6×, a smaller pot) on the same round — so
there is no formula to derive `payout` from `cost` and a player count.
Worse, *who won* a given side bet (front 9, back 9, best-ball) is a
question about a real-money side agreement the group made, not
necessarily the same thing the Cup's own front-9/back-9 segment winner
computes to. Rather than guess at rules nobody stated and risk attaching
real money to the wrong side, both `cost` and `payout` are plain numbers
an admin types in per line, and the app only ever does the one piece of
arithmetic it can vouch for: `total trip cost − sum of every round's
payout lines = what's left for the Cup's overall winner`.

**Why admin-only, not public.** Unlike the Cup's own score, a pool's cost
structure is closer to bookkeeping than to something everyone needs
propped on a phone. Kept inside Admin (`routes/admin.ts`'s `/payouts`
endpoints, `requireAdmin`-gated same as everything else there) rather
than adding a new public screen — if the group wants players to see the
breakdown too, that's a real ask to come back to, not a default to ship
speculatively.

Rounds with no side bets (most trips, most rounds) just have no
`payoutLine` rows — an empty section in Admin, not a set of zeroed-out
ones.

---

## Open

- **Stack.** Not yet chosen. The one hard requirement is that offline entry and
  the service worker are first-class, not retrofitted.
- **Hosting.** The k8s cluster, Postgres, Flux, GHCR and the Cloudflare tunnel
  are already running and proven — adding a second small app is now cheap.
- **Access control on the public URL.** Once real names, emails and handicaps
  are in, that is PII on the open internet. Cloudflare Access already fronts
  other services here and should front this one.
