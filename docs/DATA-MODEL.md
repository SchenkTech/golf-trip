# Data model

Small on purpose. Eleven tables, and one of them is a join.

## Shape

```
event            one trip, one year          (The Cup 2027)
 └─ round        one day / one tee time      (Fri 1:00pm, Lakeside G&CC, FOURBALL, NASSAU)
     └─ match    one pairing                 (A1+A2 vs B1+B2)
         ├─ match_player   who is in it, which side, strokes given
         └─ hole_score     ONE ROW PER PLAYER PER HOLE   ← the only real data
team             a side within an event      (Team Red / Team Blue)
player           a person, across all years
course           a venue
tee              a set of markers, with rating/slope
tee_hole         par, stroke index, yardage  (18 rows per tee)
```

`hole_score` is the source of truth. Everything a reader sees — standings,
points, the leaderboard, the all-time record — is computed from it. Nothing
downstream of it is stored. See `SCORING.md` for why.

## Fields worth calling out

**`round.scoring_format`** — `MATCH_PLAY` / `NASSAU` / …, and separately
**`round.team_format`** — `SINGLES` / `FOURBALL` / `FOURSOMES` / `SCRAMBLE` /
`ALT_SHOT`. Two axes, not one. How the sides are arranged is independent of how
points are counted, and collapsing them into a single enum is what made Nassau
hard to add to the previous system.

**`hole_score.entered_by`** and **`entered_at`** — every entry is attributed so
the Match screen can show `4 — Bill, 2 min ago`. Last write wins; this is what
makes that safe.

**`hole_score.client_id`** and **`queued_at`** — an entry made offline carries
the id it was given on the device, so a replayed queue is idempotent and a
double-sync cannot create two rows for the same hole.

**`match_player.strokes_given`** — resolved and stored *at match creation*, not
computed at read time. A player's handicap index moves during the year; the
strokes they got on the Saturday must not move with it afterwards.

**`award.rule`** — what decides an award, as opposed to what the trip calls it
(`award.name`). `MANUAL` means an admin fills in the holder; every other value
names a rule in `apps/api/src/lib/awards.ts` that is recomputed from the event's
own points on every Board load, and then `holder_id` / `reason` are ignored
rather than written to. A derived award has no stored winner, for the same
reason nothing else here does.

**`historical_round.format`** — a display label ("Best Ball", "Scramble") for an
old year's round, not the live `team_format` enum. These years ran formats
nobody modeled at the time, and a label is the most that can honestly be claimed
about them. Null until the group tells us; History's all-time points-by-format
table buckets those under "Other" instead of guessing.

**`player`** spans events. That is what makes History and head-to-head records
possible, and it is why players are not nested under an event.

## Courses

Already collected and validated for the three 2027 venues: per tee, the WHS
course rating and slope, and all 18 holes with par, stroke index and yardage.
Scraped from BlueGolf and checked (stroke indexes exactly 1–18, par and yardage
totals reconciled against the published cards).

They can be imported directly rather than re-entered. Note the source stores
yardage; store yards, and do not repeat the previous system's mistake of
accepting metres only.

## What is deliberately absent

No `points` column anywhere. No `standings` table. No materialized results.
If one appears, the History page has started lying.
