import { sqliteTable, text, integer, real, primaryKey } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

/**
 * Eleven tables. `holeScore` is the only real data -- everything else a
 * reader sees (standings, points, the leaderboard, the all-time record) is
 * computed from it via @gc/scoring. See docs/DATA-MODEL.md and
 * docs/SCORING.md at the repo root before adding anything that looks like a
 * cached result: if a "points" or "standing" column shows up anywhere below,
 * something has gone wrong.
 */

// ---------------------------------------------------------------- player

/** A person, across every year. Not nested under an event -- that's what
 *  makes History and head-to-head records possible. */
export const player = sqliteTable("player", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** What shows on every screen -- a trip roster runs on nicknames, not
   *  legal names. */
  nickname: text("nickname"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// --------------------------------------------------------------- course

/** A venue. Loaded once from the BlueGolf-sourced data already validated for
 *  the 2027 courses -- see docs/DATA-MODEL.md. */
export const course = sqliteTable("course", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  location: text("location"),
});

/** One set of markers on a course, with its WHS rating and slope. A course
 *  with 27 holes gets one teeSet row per nine-combination actually played,
 *  not one per physical nine -- the combination is what has a rating. */
export const teeSet = sqliteTable("tee_set", {
  id: text("id").primaryKey(),
  courseId: text("course_id").notNull().references(() => course.id),
  color: text("color").notNull(),
  rating: real("rating").notNull(),
  slope: integer("slope").notNull(),
});

/** Par, stroke index and yardage for one hole of one tee set. Always 18 rows
 *  per teeSet -- enforced in the API layer, not by the schema, since SQLite
 *  has no clean way to say "exactly 18 children." */
export const teeHole = sqliteTable(
  "tee_hole",
  {
    teeSetId: text("tee_set_id").notNull().references(() => teeSet.id),
    number: integer("number").notNull(), // 1-18
    par: integer("par").notNull(),
    strokeIndex: integer("stroke_index").notNull(), // 1-18, difficulty rank
    yards: integer("yards"),
  },
  (t) => ({ pk: primaryKey({ columns: [t.teeSetId, t.number] }) }),
);

// ---------------------------------------------------------------- event

/** One trip, one year. "The Cup 2027". */
export const event = sqliteTable("event", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  year: integer("year").notNull(),
  startDate: text("start_date").notNull(), // ISO date, "2027-05-14"
  endDate: text("end_date").notNull(),
  /** Path under apps/web/public, e.g. "/logos/event.jpg". Per-event rather
   *  than a path hardcoded into frontend code, same reasoning as team.color:
   *  a future year's identity should not require a redeploy to change. */
  logoUrl: text("logo_url"),
  /** See docs/DECISIONS.md #6: "a join code plus a name to score." A shared
   *  word said out loud on the first tee, not a real credential -- the board
   *  itself stays public with no code at all. Null means no code is set yet,
   *  in which case scoring is open (matches this app's behaviour before this
   *  column existed, rather than locking out scoring for an event nobody
   *  has configured a code for). */
  joinCode: text("join_code"),
});

/** A side within one event. Names/colours are per-event, not global --
 *  "Red" this year need not mean the same roster next year. */
export const team = sqliteTable("team", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => event.id),
  name: text("name").notNull(),
  /** Literally "RED" or "BLUE" -- the same vocabulary as match_player.side,
   *  not a display colour. This is what lets a scored match's {red, blue}
   *  points be summed onto the right team row; it is not what the UI paints
   *  anything with. There is no separate hex column: team identity on screen
   *  comes from logoUrl and name (the group's own captain-named badges), and
   *  inventing a red/blue accent colour with no brief from him would be a
   *  made-up design decision, not a real one. */
  color: text("color").notNull(),
  /** Path under apps/web/public, e.g. "/logos/teams/red.jpg". Teams here are
   *  named for their captain ("Team <name>"), not a fixed Red/Blue -- the
   *  logo is the same idea. Nullable: cosmetic only, and a
   *  missing one falls back to plain team name, never a broken page. */
  logoUrl: text("logo_url"),
});

/** A player's membership on a team for one event, with the handicap index
 *  they carried into the trip. Handicaps drift year to year, so this is not
 *  on `player` -- it is per (player, event). */
export const teamMember = sqliteTable(
  "team_member",
  {
    teamId: text("team_id").notNull().references(() => team.id),
    playerId: text("player_id").notNull().references(() => player.id),
    handicapIndex: real("handicap_index").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.teamId, t.playerId] }) }),
);

// ---------------------------------------------------------------- round

/** One day / one tee time. Carries its own scoring and team format -- see
 *  docs/SCORING.md for why those are two independent axes and why they live
 *  here rather than on the event. */
export const round = sqliteTable("round", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => event.id),
  teeSetId: text("tee_set_id").notNull().references(() => teeSet.id),
  date: text("date").notNull(), // ISO date
  teeTime: text("tee_time"), // "13:00", display only
  scoringFormat: text("scoring_format").notNull(), // MATCH_PLAY | NASSAU | HI_LO
  teamFormat: text("team_format").notNull(), // SINGLES | FOURBALL | FOURSOMES | SCRAMBLE | ALT_SHOT
  /** How many points one match in this round is worth in total, overriding
   *  @gc/scoring's format-default (NASSAU=3, MATCH_PLAY=1, HI_LO=1) when
   *  set. Exists because the real trip's own numbers don't match that
   *  default -- 2027's Friday/Saturday best-ball rounds are worth 2 points
   *  a match, not Nassau's 3. Null means "use the format default." Still
   *  used for the event's points-available total even when segmentPoints
   *  (below) is also set, so the two stay in sync -- keep them consistent
   *  when editing either. Editable in Admin; see routes/admin.ts. */
  pointsPerMatch: real("points_per_match"),
  /** How pointsPerMatch is actually split across the format's segments,
   *  when it isn't an even scale of the format default -- a JSON array,
   *  one entry per segment in the order @gc/scoring's format function
   *  returns them (Nassau: [front9, back9, overall]). 2027's Friday/
   *  Saturday rounds are 2 points as [0.5, 0.5, 1], not [0.667, 0.667,
   *  0.667] -- the overall bet is worth twice either nine, which a single
   *  pointsPerMatch scale can't express (that scales every segment by the
   *  same factor). Null means "scale pointsPerMatch evenly," the previous
   *  and still-default behavior (see @gc/scoring's scoreMatch). */
  segmentPoints: text("segment_points"),
});

// ---------------------------------------------------------------- match

/** One pairing within a round. `designatedScorerId` is the UI nudge
 *  docs/SPEC.md describes -- "a match may also have a designated scorer...
 *  that is a nudge on the UI, not a lock" -- so this is advisory only: it
 *  never gates POST /matches/:id/scores (see routes/matches.ts, docs/
 *  DECISIONS.md #4), it just tells the Enter screen who to suggest. */
export const match = sqliteTable("match", {
  id: text("id").primaryKey(),
  roundId: text("round_id").notNull().references(() => round.id),
  designatedScorerId: text("designated_scorer_id").references(() => player.id),
});

/** Who is in a match, which side, and the strokes they get.
 *
 * strokesReceived is resolved and stored AT MATCH CREATION, from the
 * player's handicapIndex on team_member and the tee's stroke indexes -- not
 * recomputed at read time. A handicap moves during the year; the shots
 * someone got on a Saturday in May must not move with it afterwards. */
export const matchPlayer = sqliteTable(
  "match_player",
  {
    matchId: text("match_id").notNull().references(() => match.id),
    playerId: text("player_id").notNull().references(() => player.id),
    side: text("side").notNull(), // RED | BLUE
    strokesReceived: integer("strokes_received").notNull().default(0),
  },
  (t) => ({ pk: primaryKey({ columns: [t.matchId, t.playerId] }) }),
);

/** One player's gross score on one hole of one match. The only table that
 *  matters -- see the module comment at the top of this file.
 *
 * entered_by / entered_at: every entry is attributed, so the UI can show
 * "4 — Bill, 2 min ago." Anyone can overwrite; last write wins; attribution
 * is what makes that safe (see docs/DECISIONS.md #4).
 *
 * client_id / queued_at: an entry made offline carries the id it was given
 * on the device, so a replayed sync queue is idempotent and cannot create a
 * duplicate row for the same hole after a flaky reconnect. */
export const holeScore = sqliteTable(
  "hole_score",
  {
    // No surrogate id: (matchId, playerId, holeNumber) already identifies a
    // hole score completely -- one player has exactly one current score for
    // one hole of one match, by definition of the game. A second primary key
    // alongside that composite one is not just redundant, SQLite rejects it
    // outright ("more than one primary key").
    matchId: text("match_id").notNull().references(() => match.id),
    playerId: text("player_id").notNull().references(() => player.id),
    holeNumber: integer("hole_number").notNull(), // 1-18
    gross: integer("gross"), // null = not entered, not a pickup
    enteredBy: text("entered_by").notNull().references(() => player.id),
    enteredAt: integer("entered_at", { mode: "timestamp" }).notNull(),
    clientId: text("client_id").notNull(), // idempotency key from the device
    queuedAt: integer("queued_at", { mode: "timestamp" }), // set if entered offline
  },
  (t) => ({
    // One score per player per hole per match -- a resync replays the same
    // row rather than duplicating it.
    uniq: primaryKey({ columns: [t.matchId, t.playerId, t.holeNumber] }),
  }),
);

// ------------------------------------------------------- historical years

/**
 * 2024-2026 don't fit the event/round/match model above at all: 2024 was
 * five ad-hoc pairs rather than the two standing teams, 2025 ran three
 * different formats on three different days, and none of the three years
 * have hole-by-hole scores anywhere -- only each player's gross/net total per round. Rather
 * than force them into match_player/hole_score with invented pairings and
 * fabricated holes, History shows these years as what the data actually
 * is: a round-by-round score table. See docs/DATA-MODEL.md.
 *
 * Real 2027-onward events (the live, current model) never use these
 * tables -- they earn full match detail from actual entered hole scores.
 */
export const historicalYear = sqliteTable("historical_year", {
  year: integer("year").primaryKey(),
  name: text("name").notNull(), // "1st Annual Cup"
  /** A side value (whatever that year called its sides, same free-text vocabulary as
   *  historicalMatch.side) or null. For a year with no seeded
   *  historicalMatch rows -- no match-by-match detail available -- this
   *  is the coarsest fact there is: who actually won, known directly
   *  (from the group, not derived from anything stored), before the real
   *  final score is known. Once a year's real matches get seeded
   *  (historicalMatch), the winner is derived from those instead and this
   *  goes back to null rather than risk disagreeing with the real detail. */
  winner: text("winner"),
  /** The declared final score of a year with no match detail, as the group
   *  remembers it -- winnerPoints to whichever side `winner` names. Same
   *  class of fact as `winner` itself: told to us, not derived from
   *  anything, and only read when there are no historicalMatch rows to
   *  derive a real score from. Both null until someone says what it was.
   *
   *  This is the one place a points total is stored rather than computed,
   *  and it is not an exception to docs/SCORING.md: there is no hole
   *  score, no match record, nothing to compute it FROM. A remembered
   *  score is better than a blank, as long as the app is clear about
   *  which it is showing. */
  winnerPoints: real("winner_points"),
  loserPoints: real("loser_points"),
});

/** One of the three rounds in a historical year, just enough to label the
 *  score table's columns -- no format/team-shape modeling, since none of
 *  these years fit the current one uniformly (see module comment above).
 *
 *  pointsPerMatch is the same idea as round.pointsPerMatch (see that
 *  column's comment) but for a round that only has declared segment
 *  winners, not real hole scores, to derive points from -- some years
 *  never get this set at all (2024/2025 have no match records, just
 *  round-score stats), and it's null until a year's matches are actually
 *  seeded (historicalMatch). */
export const historicalRound = sqliteTable(
  "historical_round",
  {
    year: integer("year").notNull().references(() => historicalYear.year),
    roundNumber: integer("round_number").notNull(), // 1-3, tournament order
    courseName: text("course_name").notNull(),
    pointsPerMatch: real("points_per_match"),
    /** What was played that day, as a display label ("Best Ball",
     *  "Scramble") rather than the live schema's teamFormat enum -- these
     *  years ran formats nobody modeled at the time, and a label is the
     *  most that can honestly be claimed about them. Null where the group
     *  hasn't told us yet; History's all-time points-by-format table
     *  buckets those under "Other" rather than guessing. */
    format: text("format"),
  },
  (t) => ({ pk: primaryKey({ columns: [t.year, t.roundNumber] }) }),
);

/**
 * A real match result for a historical year, where the source data is a
 * declared front9/back9/overall winner (e.g. "the blue side won the front nine")
 * rather than hole-by-hole gross scores -- there's no hole_score to derive
 * a result from for these years, so the declared result IS the primary
 * fact here, same role hole_score plays for a live event. Points are still
 * derived, never stored: 1 per segment won (0.5 each on a tie), scaled by
 * historicalRound.pointsPerMatch -- computed in routes/history.ts, the
 * same "derive, don't store" discipline as everywhere else, just working
 * from a coarser input.
 *
 * side is free text -- whatever the source actually called the two sides --
 * not the live schema's RED/BLUE, because there's no `team` row backing
 * these years to give that vocabulary meaning. The all-time record matches
 * these labels back to today's teams by name (apps/web's lib/sides.ts).
 */
export const historicalMatch = sqliteTable(
  "historical_match",
  {
    year: integer("year").notNull().references(() => historicalYear.year),
    roundNumber: integer("round_number").notNull(),
    matchNumber: integer("match_number").notNull(), // order within the round
    front9Winner: text("front9_winner").notNull(), // a side value, or "TIE"
    back9Winner: text("back9_winner").notNull(),
    overallWinner: text("overall_winner").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.year, t.roundNumber, t.matchNumber] }) }),
);

/** Who played one historicalMatch, and which of its two (free-text) sides
 *  they were on. No strokesReceived -- unlike a live match_player, nothing
 *  here derives a net score from a handicap, so there's nothing for it to
 *  do. */
export const historicalMatchPlayer = sqliteTable(
  "historical_match_player",
  {
    year: integer("year").notNull(),
    roundNumber: integer("round_number").notNull(),
    matchNumber: integer("match_number").notNull(),
    playerId: text("player_id").notNull().references(() => player.id),
    side: text("side").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.year, t.roundNumber, t.matchNumber, t.playerId] }) }),
);

/** One player's gross/net total for one round of one historical year. Only
 *  rows with a real recorded score exist -- a player who was on the trip
 *  but has no score here genuinely has none in the source data, not a
 *  zero. */
export const historicalScore = sqliteTable(
  "historical_score",
  {
    year: integer("year").notNull().references(() => historicalYear.year),
    roundNumber: integer("round_number").notNull(),
    playerId: text("player_id").notNull().references(() => player.id),
    gross: real("gross").notNull(),
    net: real("net").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.year, t.roundNumber, t.playerId] }) }),
);

// -------------------------------------------------------------- awards

/**
 * One individual award for one event -- "Closest to Pin", "Queen Bee". See
 * docs/SPEC.md's "Individual awards" section: some are admin-set (a
 * nominated hole's winner, which nothing in this app can observe on its
 * own -- there's no shot-tracking data, only hole scores), some are
 * derived from play, some fall out of team state.
 *
 * `rule` is which of those this award is. "MANUAL" means holderId/reason
 * are plain fields an admin fills in (the only kind that existed before);
 * every other value names a rule in lib/awards.ts that works the holder
 * out from the event's own points as they're entered, and then holderId/
 * reason are ignored -- a derived award has no stored holder, same
 * "derive, don't store" discipline as the points themselves
 * (docs/SCORING.md): an award keeps itself up to date as the trip is
 * played.
 *
 * `enabled` lets an admin turn an award off for a year without losing its
 * name/history. Names are the group's own in-jokes and are meant to be
 * renamed in Admin -- the rule is what the award actually *is*, the name
 * is just what the trip calls it.
 */
export const award = sqliteTable("award", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => event.id),
  name: text("name").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  /** "MANUAL", or an AwardRule from lib/awards.ts. Defaults to MANUAL so
   *  every award that existed before this column keeps behaving exactly as
   *  it did. */
  rule: text("rule").notNull().default("MANUAL"),
  /** Null until decided -- the Board shows "—" with a reason in that case
   *  (see docs/SPEC.md: "reads as '—' with an explanation before it is
   *  decided"). Only read for a MANUAL award. */
  holderId: text("holder_id").references(() => player.id),
  reason: text("reason"),
  sortOrder: integer("sort_order").notNull(),
});

// ----------------------------------------------------------- quick rules

/** One of the group's local rules -- "Max Score", "Breakfast Ball", etc.
 *  Club-wide, not per-event: a local rule doesn't reset when the calendar
 *  turns over the way a round's format does, so this isn't scoped to
 *  `event` the way team/round/match are. Editable from Admin; the
 *  Nassau/Formats/Handicaps/Entering/Winning prose on the same Rules page
 *  is NOT here on purpose -- that describes actual @gc/scoring behavior,
 *  and letting it drift from the code it's describing would make the page
 *  actively misleading. sortOrder is a plain integer, not a linked list --
 *  Admin's up/down buttons just swap two rows' values. */
export const quickRule = sqliteTable("quick_rule", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  sortOrder: integer("sort_order").notNull(),
});

// -------------------------------------------------------------- relations

export const eventRelations = relations(event, ({ many }) => ({
  teams: many(team),
  rounds: many(round),
}));

export const teamRelations = relations(team, ({ one, many }) => ({
  event: one(event, { fields: [team.eventId], references: [event.id] }),
  members: many(teamMember),
}));

export const roundRelations = relations(round, ({ one, many }) => ({
  event: one(event, { fields: [round.eventId], references: [event.id] }),
  teeSet: one(teeSet, { fields: [round.teeSetId], references: [teeSet.id] }),
  matches: many(match),
}));

export const matchRelations = relations(match, ({ one, many }) => ({
  round: one(round, { fields: [match.roundId], references: [round.id] }),
  players: many(matchPlayer),
  scores: many(holeScore),
}));

export const teeSetRelations = relations(teeSet, ({ one, many }) => ({
  course: one(course, { fields: [teeSet.courseId], references: [course.id] }),
  holes: many(teeHole),
}));

// Both sides needed: Drizzle's relational query builder (db.query.X.findMany
// with `with: {...}`) infers a join from a matching pair of relations, not
// from the one() many() declaration alone -- a many() with no corresponding
// one() on the other table left match.players/match.scores unresolvable
// ("There is not enough information to infer relation"), caught by actually
// running the query rather than by anything that type-checks.
export const matchPlayerRelations = relations(matchPlayer, ({ one }) => ({
  match: one(match, { fields: [matchPlayer.matchId], references: [match.id] }),
}));

export const holeScoreRelations = relations(holeScore, ({ one }) => ({
  match: one(match, { fields: [holeScore.matchId], references: [match.id] }),
}));

// team.members (many teamMember) needs this inverse for the same reason as
// match.players/match.scores above.
export const teamMemberRelations = relations(teamMember, ({ one }) => ({
  team: one(team, { fields: [teamMember.teamId], references: [team.id] }),
}));

// teeSet.holes (many teeHole) needs this inverse for the same reason.
export const teeHoleRelations = relations(teeHole, ({ one }) => ({
  teeSet: one(teeSet, { fields: [teeHole.teeSetId], references: [teeSet.id] }),
}));

export const historicalYearRelations = relations(historicalYear, ({ many }) => ({
  rounds: many(historicalRound),
  scores: many(historicalScore),
}));

export const historicalRoundRelations = relations(historicalRound, ({ one }) => ({
  year: one(historicalYear, { fields: [historicalRound.year], references: [historicalYear.year] }),
}));

export const historicalScoreRelations = relations(historicalScore, ({ one }) => ({
  year: one(historicalYear, { fields: [historicalScore.year], references: [historicalYear.year] }),
  player: one(player, { fields: [historicalScore.playerId], references: [player.id] }),
}));
