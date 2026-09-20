import { Hono } from "hono";
import type { Context } from "hono";
import { eq, desc } from "drizzle-orm";
import { pointsAvailable } from "@gc/scoring";
import type { ScoringFormat, TeamFormat } from "@gc/scoring";
import { scoreMatchRows, strokeIndexesFor, segmentPointsFor, PERSONAL_CARD_FORMATS } from "../lib/score.ts";
import { loadPlayerLabels } from "../lib/players.ts";
import { loadPlayerRecords } from "../lib/records.ts";
import { isAwardRule, resolveAward } from "../lib/awards.ts";
import type { AwardContext } from "../lib/awards.ts";
import * as schema from "../db/schema.ts";
import type { AppEnv } from "../types.ts";

export const events = new Hono<AppEnv>();

/**
 * The Board screen's two calls: this route for the team score header,
 * /rounds below for the day-by-day matchups. Split rather than one giant
 * payload because the header barely changes shape while a round's matches
 * update on every hole entered -- no reason to make the client re-fetch and
 * re-render the header on every scoring poll.
 *
 * Registered before /:id so the literal path wins -- Hono matches route
 * definitions in registration order when two patterns could both match.
 */
events.get("/current", async (c) => {
  const db = c.get("db");
  const all = await db.query.event.findMany();
  if (all.length === 0) return c.json({ error: "no event configured" }, 404);
  return eventDetail(c, pickCurrentEvent(all).id);
});

/**
 * Which event Board/Matches/Teams open to when more than one exists: the
 * one happening right now if any, else the soonest one still ahead, else
 * (every event is in the past) the most recently finished one. "Highest
 * year" stopped being a safe proxy for this the moment Admin could create
 * next year's event ahead of the current one actually being played.
 */
function pickCurrentEvent(events: (typeof schema.event.$inferSelect)[]) {
  const today = new Date().toISOString().slice(0, 10);
  const inProgress = events.find((e) => e.startDate <= today && today <= e.endDate);
  if (inProgress) return inProgress;
  const upcoming = events.filter((e) => e.startDate > today).sort((a, b) => a.startDate.localeCompare(b.startDate));
  if (upcoming[0]) return upcoming[0];
  return [...events].sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
}

/** Every trip, newest first -- what the History screen lists before diving
 *  into any one year's detail. Just the header fields; a year's own score
 *  and match-by-match results come from GET /:id and /:id/rounds, the same
 *  routes the Board and Matches screens already use. */
events.get("/", async (c) => {
  const db = c.get("db");
  const all = await db.query.event.findMany({ orderBy: desc(schema.event.year) });
  return c.json({
    events: all.map((e) => ({
      id: e.id,
      name: e.name,
      year: e.year,
      startDate: e.startDate,
      endDate: e.endDate,
      logoUrl: e.logoUrl,
    })),
  });
});

events.get("/:id", async (c) => eventDetail(c, c.req.param("id")));

/** Checked once, client-side, before the "who are you" picker shows -- see
 *  docs/DECISIONS.md #6. The actual write-time gate lives in
 *  routes/matches.ts's POST /:id/scores; this route exists only so the UI
 *  can say "wrong code" immediately instead of failing on the first score. */
events.post("/:id/verify-code", async (c) => {
  const db = c.get("db");
  const event = await db.query.event.findFirst({ where: eq(schema.event.id, c.req.param("id")) });
  if (!event) return c.json({ error: "event not found" }, 404);
  const body = await c.req.json<{ code?: string }>();
  const ok = !event.joinCode || body?.code === event.joinCode;
  return c.json({ ok });
});

async function eventDetail(c: Context<AppEnv>, eventId: string) {
  const db = c.get("db");

  const event = await db.query.event.findFirst({ where: eq(schema.event.id, eventId) });
  if (!event) return c.json({ error: "event not found" }, 404);

  const teams = await db.query.team.findMany({
    where: eq(schema.team.eventId, eventId),
    with: { members: true },
  });

  const roundRows = await db.query.round.findMany({
    where: eq(schema.round.eventId, eventId),
    with: { matches: { with: { players: true, scores: true } }, teeSet: { with: { holes: true } } },
  });

  // Every match across every round, scored once, then summed per team --
  // the same derivation get /rounds/:id/matches does per round, just not
  // thrown away afterwards. Still nothing stored: a fresh sum on every
  // request, per docs/SCORING.md.
  const totals = new Map<string, number>(teams.map((t) => [t.color, 0]));
  // Every rostered player, whether or not they've teed off -- the derived
  // awards need to tell "nothing yet" apart from "zero points" (see
  // lib/awards.ts), which a map built only from played matches can't do.
  const tally = new Map<string, { points: number; birdies: number; played: boolean }>();
  for (const t of teams) {
    for (const m of t.members) tally.set(m.playerId, { points: 0, birdies: 0, played: false });
  }
  const bump = (playerId: string, fn: (row: { points: number; birdies: number; played: boolean }) => void) => {
    const row = tally.get(playerId) ?? { points: 0, birdies: 0, played: false };
    fn(row);
    tally.set(playerId, row);
  };

  let available = 0;
  let undecided = 0;
  for (const round of roundRows) {
    const scoringFormat = round.scoringFormat as ScoringFormat;
    const teamFormat = round.teamFormat as TeamFormat;
    const strokeIndexes = strokeIndexesFor(round.teeSet.holes);
    const segmentPoints = segmentPointsFor(round.segmentPoints);
    const pars = new Map(round.teeSet.holes.map((h) => [h.number, h.par]));
    for (const m of round.matches) {
      const scored = scoreMatchRows(m, teamFormat, scoringFormat, strokeIndexes, round.pointsPerMatch, segmentPoints);
      totals.set("RED", (totals.get("RED") ?? 0) + scored.points.red);
      totals.set("BLUE", (totals.get("BLUE") ?? 0) + scored.points.blue);

      // A match's points belong to everyone on the winning side of it --
      // that's what a team format means, and it's the same number the Board
      // already credits to their team. Partners don't split it.
      for (const p of scored.players) {
        bump(p.playerId, (row) => {
          row.points += p.side === "RED" ? scored.points.red : scored.points.blue;
          if (scored.holesPlayed > 0) row.played = true;
        });
      }
      // Gross birdies (and better), counted per player from their own card
      // -- the one award that comes off the scores themselves rather than
      // off who won what. Only where the player actually has a card of
      // their own (PERSONAL_CARD_FORMATS): in a scramble the birdie is the
      // team's, and handing it to whoever's name the shared ball was
      // entered under would be inventing a fact. A hole with no par on
      // file can't be judged either.
      if (PERSONAL_CARD_FORMATS.has(teamFormat)) {
        for (const s of m.scores) {
          const par = pars.get(s.holeNumber);
          if (s.gross === null || par === undefined || s.gross >= par) continue;
          bump(s.playerId, (row) => {
            row.birdies++;
          });
        }
      }
      const matchPoints = round.pointsPerMatch ?? pointsAvailable(scoringFormat);
      available += matchPoints;
      // Points already decided (won outright by one side) don't count as
      // "still on the table" -- a halved segment's points are both spent,
      // and points from a segment/match still being played remain live.
      // Nassau's own points already never truncate at a closeout (see
      // @gc/scoring's nassau()), so this only ever shrinks as real result
      // is settled, never as a match merely progresses.
      undecided += matchPoints - (scored.points.red + scored.points.blue);
    }
  }

  // Enabled awards only -- see schema.ts's note on `award`. A holder with
  // no name reads as "—" client-side; the reason (e.g. "Hole not set yet")
  // is admin-supplied for a MANUAL award and computed for every other rule.
  const awardRows = await db.query.award.findMany({ where: eq(schema.award.eventId, eventId) });
  const enabledAwards = awardRows.filter((a) => a.enabled).sort((a, b) => a.sortOrder - b.sortOrder);
  const needsLabels = enabledAwards.some((a) => a.holderId || a.rule !== "MANUAL");
  const labels = needsLabels ? await loadPlayerLabels(db) : new Map<string, string>();

  // One context for every derived award on the event, built from the tally
  // above -- no extra query and no second scoring pass, so an award can
  // never disagree with the team score it's sitting under.
  const awardContext: AwardContext = {
    players: teams.flatMap((t) =>
      t.members.map((m) => {
        const row = tally.get(m.playerId) ?? { points: 0, birdies: 0, played: false };
        return {
          playerId: m.playerId,
          name: labels.get(m.playerId) ?? m.playerId,
          side: t.color as "RED" | "BLUE",
          ...row,
        };
      }),
    ),
    teams: teams.map((t) => ({
      color: t.color as "RED" | "BLUE",
      name: t.name,
      points: totals.get(t.color) ?? 0,
    })),
  };

  return c.json({
    id: event.id,
    name: event.name,
    year: event.year,
    startDate: event.startDate,
    endDate: event.endDate,
    logoUrl: event.logoUrl,
    pointsAvailable: available,
    // Points no decided segment/match has already claimed -- what a
    // comeback is still playing for (see docs/SPEC.md's Board section).
    // Distinct from pointsAvailable, which never shrinks.
    pointsRemaining: undecided,
    // Whether scoring on this event needs docs/DECISIONS.md #6's join code
    // -- never the code itself, which this response never includes.
    requiresCode: event.joinCode !== null,
    teams: teams.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
      logoUrl: t.logoUrl,
      points: totals.get(t.color) ?? 0,
      playerCount: t.members.length,
    })),
    awards: enabledAwards.map((a) => {
      const rule = isAwardRule(a.rule) ? a.rule : "MANUAL";
      if (rule === "MANUAL") {
        return {
          id: a.id,
          name: a.name,
          rule,
          holderName: a.holderId ? labels.get(a.holderId) ?? a.holderId : null,
          reason: a.reason,
        };
      }
      return { id: a.id, name: a.name, rule, ...resolveAward(rule, awardContext) };
    }),
  });
}

/**
 * Every round of the event, each with its matches already scored -- what
 * the Board's day-by-day list and the Matches screen both render from.
 */
events.get("/:id/rounds", async (c) => {
  const db = c.get("db");
  const eventId = c.req.param("id");

  const event = await db.query.event.findFirst({ where: eq(schema.event.id, eventId) });
  if (!event) return c.json({ error: "event not found" }, 404);

  const roundRows = await db.query.round.findMany({
    where: eq(schema.round.eventId, eventId),
    with: {
      matches: { with: { players: true, scores: true } },
      teeSet: { with: { course: true, holes: true } },
    },
  });

  const labels = await loadPlayerLabels(db);

  const out = roundRows.map((round) => {
    const scoringFormat = round.scoringFormat as ScoringFormat;
    const teamFormat = round.teamFormat as TeamFormat;
    const strokeIndexes = strokeIndexesFor(round.teeSet.holes);
    return {
      id: round.id,
      date: round.date,
      teeTime: round.teeTime,
      scoringFormat,
      teamFormat,
      courseName: round.teeSet.course.name,
      teeColor: round.teeSet.color,
      matches: round.matches.map((m) => {
        const s = scoreMatchRows(m, teamFormat, scoringFormat, strokeIndexes, round.pointsPerMatch, segmentPointsFor(round.segmentPoints));
        return { ...s, players: s.players.map((p) => ({ ...p, name: labels.get(p.playerId) ?? p.playerId })) };
      }),
    };
  });

  out.sort((a, b) => a.date.localeCompare(b.date));

  return c.json({ eventId, rounds: out });
});

/**
 * Full rosters for the Teams screen. Captain is derived, not stored: teams
 * here are named for their captain ("Team <name>" -- see docs/SPEC.md), so
 * the captain is whichever member's nickname matches the team name once
 * "Team " is stripped. Same reasoning as every derived value
 * in this codebase (docs/SCORING.md) -- a captain column would just be a
 * second place this fact could go stale against the team name.
 *
 * `record` on each member is docs/SPEC.md's "each player's record for the
 * weekend, and their all-time record against the other side" -- see
 * lib/records.ts for how a match settles to a single win/loss/halve.
 */
events.get("/:id/teams", async (c) => {
  const db = c.get("db");
  const eventId = c.req.param("id");

  const event = await db.query.event.findFirst({ where: eq(schema.event.id, eventId) });
  if (!event) return c.json({ error: "event not found" }, 404);

  const teams = await db.query.team.findMany({
    where: eq(schema.team.eventId, eventId),
    with: { members: true },
  });
  const labels = await loadPlayerLabels(db);
  const [weekend, allTime] = await Promise.all([
    loadPlayerRecords(db, { eventId }),
    loadPlayerRecords(db, { includeHistorical: true }),
  ]);
  const zero = { w: 0, l: 0, h: 0 };

  const out = teams.map((t) => {
    const captainName = t.name.replace(/^Team\s+/i, "").trim().toLowerCase();
    return {
      id: t.id,
      name: t.name,
      color: t.color,
      logoUrl: t.logoUrl,
      members: t.members
        .map((m) => ({
          playerId: m.playerId,
          name: labels.get(m.playerId) ?? m.playerId,
          handicapIndex: m.handicapIndex,
          isCaptain: (labels.get(m.playerId) ?? "").toLowerCase() === captainName,
          record: {
            weekend: weekend.get(m.playerId) ?? zero,
            allTime: allTime.get(m.playerId) ?? zero,
          },
        }))
        .sort((a, b) => (b.isCaptain ? 1 : 0) - (a.isCaptain ? 1 : 0) || a.name.localeCompare(b.name)),
    };
  });

  return c.json({ eventId, teams: out });
});
