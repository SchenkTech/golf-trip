# Product spec

Six screens a player sees, plus an admin area for the two or three people who
set the weekend up. If a screen is not on this list, it does not exist yet.

The shape comes from the apps groups like this already use on a trip, and two
things about it are settled:

**It is a bottom tab bar, not a top nav** — a handful of tabs with Board in the
centre and active by default. That is what "in app format" means here: a web app
wearing native clothes. Design for a thumb at the bottom of a phone, not a
cursor at the top of a page.

**It needs no login to read.** The board is public; the score is the first thing
you see. A "Welcome back" login wall in front of a scoreboard is almost always a
platform default rather than a decision, and it is exactly the friction this app
exists to remove.

## Board — the home screen

The one screen most people will ever open, and the one that is left up on a
phone propped against a beer.

- Team score, large: **Team Red 7½ — 4½ Team Blue**
- Points still on the table, so a comeback is legible
- Today's matches as a live list, each showing its current standing
  (`2 UP`, `AS`, `3&2` once closed out)
- Which round is in progress, on which course

Refreshes on its own. Nobody should have to pull down.

## Matches — today's matchups

Today's pairings grouped by round, each row tappable. Shows format
(fourball / foursomes / singles), tee time, and current standing.

A day selector reaches the other days of the weekend.

**Built:** a trip picker above the day selector reaches *other years* the same
way, rather than a History page that re-tells what happened somewhere else.
Picking a year is a real URL (`/trips/2026`), so a past trip can be linked and
shared like a match can. A finished trip is marked
with a lock in the list and its cards aren't tappable: there is no hole to enter
for 2026. Years from before the current model show what was actually recorded
for them (declared match results, round scores) rather than a shape the data
can't support.

## Match — the scoring screen

The screen that has to work with cold hands and one bar of signal.

- The four (or two) players, with strokes given shown against each name
- A hole-by-hole grid, current hole prominent
- Big touch targets for score entry — this is used outdoors, one-handed
- Running standing at the top, updated as holes land
- For Nassau: front / back / overall shown separately, because the whole point
  is that they are three different bets

**Entry is open by default.** Anyone playing in the match can enter a score.
A match may also have a designated scorer — that is a nudge on the UI, not a
lock, so the guys who want to keep score do, and the guys who won't, don't.

**Every entry is attributed.** A hole reads `4 — Bill, 2 min ago`. Anyone can
overwrite it, and the last write wins. The attribution is what makes that safe:
a disagreement becomes a conversation on the tee rather than a number that
silently changed. Entries that arrive from a queued offline device are marked
as such.

## The field, and other things only a specific trip can answer

How many players, whether that divides into pairs, which tee combination is
being played, what the awards are called: all of it is per-trip, and none of it
belongs in this spec or in the code. A copy of this app keeps those in its own
`docs/TRIP.md` (see `docs/PUBLISHING.md`).

Two that are worth flagging because they are *format* decisions wearing
scheduling clothes:

- **An odd number a side does not divide into pairs.** A fourball or
  alternate-shot round becomes N matches with someone sitting out, every time,
  and somebody has to own the sit-out rota.
- **Singles day can decide the cup on its own.** Three pairs matches at Nassau
  are 9 points; seven singles matches are 21. Some groups want exactly that. It
  should be a choice, not an accident of the roster size — which is why points
  per match are configurable per round (`docs/SCORING.md`).

## The one thing to change: entry on a phone

The obvious way to build a scoring screen is a full scorecard grid — hole, par,
stroke index, a column per player, result — all eighteen rows down the page. As
a way to *review* a match that is exactly right, and it survives here as the
desktop and after-the-round view.

As a way to *enter* a score standing on the 7th tee it is the weakest thing you
could ship. Seven columns on a 390px phone means horizontal scrolling and small
targets, one-handed, in sun, possibly after a beer.

So: **two views of the same match.**

- **Enter** — one hole at a time, filling the screen. Par and stroke index for
  that hole, each player's name, big +/− targets, swipe or tap to the next hole.
- **Card** — the grid, for reviewing the round and checking the maths.

Same data, same screen, a toggle between them. This is the single highest-value
decision on the scoring side.

## Individual awards

On the Board, under the team score. Apps in this space carry half a dozen of
them and they are clearly part of the fun, not an afterthought — closest to pin,
long drive, most birdies, and whatever in-jokes the group already has.

Some are derived (first birdie in Hi-Lo or singles), some are set by an admin
(closest to pin on a nominated hole), some fall out of the team state. Each shows
a holder and a one-line reason, and reads as "—" with an explanation before it is
decided ("Hole not set yet", "Teams are level").

They should be the group's own awards, not a copy of anyone else's. Ask the trip
what it already jokes about — those names are half the point.

**Built:** an award carries a *rule*, and the name is only what the trip calls
it. Renaming one never changes what decides it. The rules that work themselves
out from play — most points on the leading team, most and fewest on the trailing
team, most points overall, fewest overall, most birdies — are recomputed on every
Board load from the same hole scores as the team score, so a chip moves as soon
as a hole is entered — an award should keep itself up to date as the trip is
played. "Set by hand" stays for the ones nothing in the app can observe, like
closest to pin. See `apps/api/src/lib/awards.ts`.

## Teams

Two rosters, captains marked, handicaps shown. Each player's record for the
weekend, and their all-time record against the other side.

## History

Past years. Per event: the final score, who won, the match-by-match results,
which courses were played, which formats were used.

**Built:** the per-year match detail lives on Matches now, behind that screen's
trip picker (above) — one place where a match is a match, whatever year it is.
What stays here is the part that isn't a list of matches: the all-time record,
every trip on one line (each year a link through to its matches), everyone's
all-time numbers, and the trips still to come.

An all-time summary across every event: trips played, each side's win-loss
record, cumulative points.

Then everyone's own all-time line: individual records, points earned per match
type and in total, and career averages for gross and net. Two tables — record
and points (split by format, plus the total), and scoring averages.
A year contributes whatever it actually has: an old year with only round scores
moves the averages and not the points. Averages only count rounds where a player
has a full eighteen of their own on record — a scramble has one ball per side, so
there is no personal card to average.

All of it derived from stored hole scores — see `SCORING.md`. Nothing on this
page is a number somebody maintains.

## Rules

A static page. Formats in plain English, how handicaps are applied, what the
points are worth, and the local rules the group argues about every year.

Worth real writing: if Nassau is in play, this page is what stops the "wait,
so the back nine is separate?" conversation happening on the first tee.

## Admin — in the same app, role-gated

Three screens, for two or three people:

1. **Set up the event** — name, dates, courses, rounds and their formats
2. **Teams** — drag players onto a side, name a captain
3. **Matchups** — build the pairings for each round

Deliberately *not* a separate app and *not* the old system. A separate admin app
doubles the deployment for three screens. Keeping the old one means the data
lives in its database while this app reads from another — two schemas and a
sync problem forever, and the setup friction that got us here in the first place.

## Sign-in

Calibrated to twelve friends once a year, not to a SaaS.

- **Reading the board needs nothing.** Anyone with the link sees the score.
  This is the majority of all usage.
- **Scoring needs a join code and a name.** Enter the code once, pick yourself
  off the roster, and the phone remembers. No password, no email round-trip.
- **Admin needs a real login.** Two or three people.

## Offline

Score entry works with no signal. Entries queue on the device and sync when it
comes back; the UI says plainly when something is queued rather than sent.
This is not a nice-to-have — the courses have dead patches, and a scoreboard
that loses a hole is a scoreboard nobody trusts by Saturday.

## Explicitly out of scope

Chat. Photo galleries. Betting or side-game ledgers. Push notifications.
Live GPS. Anything that makes the first screen take longer to understand.

## Branding assets

A real identity, not placeholder green. Whatever the trip already has — a badge,
a crest, an in-joke on a beer can — beats anything invented here.

- `apps/web/public/logos/event.jpg` — the site logo.
- `apps/web/public/logos/teams/*.jpg` — team logos. Teams are named for their
  captains rather than a fixed Red/Blue, so `team.logoUrl` is where these live,
  not a per-player field — there is no per-person badge in this app. Nullable: a
  missing logo falls back to the team's plain name and colour, never a broken
  page.

A published copy of this repo ships neither (see `docs/PUBLISHING.md`); the app
runs without them.
