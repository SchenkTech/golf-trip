import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { ScoringFormat, TeamFormat } from "@gc/scoring";
import { scoreMatchRows, strokeIndexesFor, segmentPointsFor } from "../lib/score.ts";
import { loadPlayerLabels } from "../lib/players.ts";
import * as schema from "../db/schema.ts";
import type { AppEnv } from "../types.ts";

export const matches = new Hono<AppEnv>();

/**
 * Everything the Match/Enter screen needs in one load: the round's 18 holes
 * (par, stroke index, yards -- not returned by any other endpoint, since
 * /rounds and /events/.../rounds only ever return match-level aggregates),
 * the players on each side with the strokes they're getting, and every
 * hole_score already entered so a screen opened mid-round shows real state
 * rather than starting blank.
 */
matches.get("/:id", async (c) => {
  const db = c.get("db");
  const matchId = c.req.param("id");

  const full = await db.query.match.findFirst({
    where: eq(schema.match.id, matchId),
    with: {
      players: true,
      scores: true,
      round: { with: { teeSet: { with: { course: true, holes: true } }, event: true } },
    },
  });
  if (!full) return c.json({ error: "match not found" }, 404);

  const labels = await loadPlayerLabels(db);
  const scoringFormat = full.round.scoringFormat as ScoringFormat;
  const teamFormat = full.round.teamFormat as TeamFormat;
  const strokeIndexes = strokeIndexesFor(full.round.teeSet.holes);
  const scored = scoreMatchRows(
    full,
    teamFormat,
    scoringFormat,
    strokeIndexes,
    full.round.pointsPerMatch,
    segmentPointsFor(full.round.segmentPoints),
  );

  const holes = [...full.round.teeSet.holes]
    .sort((a, b) => a.number - b.number)
    .map((h) => ({ number: h.number, par: h.par, strokeIndex: h.strokeIndex, yards: h.yards }));

  return c.json({
    matchId,
    roundId: full.round.id,
    eventId: full.round.event.id,
    requiresCode: full.round.event.joinCode !== null,
    courseName: full.round.teeSet.course.name,
    teeColor: full.round.teeSet.color,
    teamFormat,
    scoringFormat,
    holes,
    // A UI nudge (docs/SPEC.md), not a lock -- see schema.ts's note on
    // match.designatedScorerId. Null means nobody's been nominated.
    designatedScorerId: full.designatedScorerId,
    designatedScorerName: full.designatedScorerId ? labels.get(full.designatedScorerId) ?? full.designatedScorerId : null,
    players: full.players.map((p) => ({
      playerId: p.playerId,
      side: p.side,
      name: labels.get(p.playerId) ?? p.playerId,
      strokesReceived: p.strokesReceived,
    })),
    scores: full.scores.map((s) => ({
      playerId: s.playerId,
      holeNumber: s.holeNumber,
      gross: s.gross,
      enteredBy: labels.get(s.enteredBy) ?? s.enteredBy,
      enteredAt: s.enteredAt,
    })),
    points: scored.points,
    segments: scored.segments,
    standing: scored.standing,
    decided: scored.decided,
    holesPlayed: scored.holesPlayed,
  });
});

interface ScoreEntry {
  playerId: string;
  holeNumber: number;
  gross: number | null;
  enteredBy: string;
  clientId: string;
  queuedAt?: number;
}

interface ScorePostBody {
  scores: ScoreEntry[];
  /** See docs/DECISIONS.md #6 -- required only when the event actually has
   *  one configured (event.joinCode is null by default). */
  code?: string;
}

/**
 * Submit one or more hole scores. Accepts a batch, not just one entry, even
 * though nothing sends a batch yet -- the offline queue (next piece of work)
 * will replay several queued entries in one request once signal returns,
 * and shaping this endpoint for that now avoids a breaking change later for
 * a cost of essentially nothing (a loop instead of one row).
 *
 * Last write wins, per docs/DECISIONS.md #4: hole_score's primary key is
 * (match, player, hole), so resubmitting the same hole always lands on the
 * same row via upsert. That composite key is what actually makes a replayed
 * offline entry safe -- client_id is stored for audit/attribution display
 * ("4 -- Bill, 2 min ago"), not as a separate dedup mechanism, because the
 * natural key already prevents a duplicate row from existing at all.
 */
matches.post("/:id/scores", async (c) => {
  const db = c.get("db");
  const matchId = c.req.param("id");
  const body = await c.req.json<ScorePostBody>();

  if (!body?.scores?.length) return c.json({ error: "scores array required" }, 400);

  const full = await db.query.match.findFirst({
    where: eq(schema.match.id, matchId),
    with: { players: true, scores: true, round: { with: { event: true, teeSet: { with: { holes: true } } } } },
  });
  if (!full) return c.json({ error: "match not found" }, 404);

  // A speed bump, not a security boundary -- see docs/DECISIONS.md #6. The
  // board itself stays fully public; this only gates writes, and only once
  // an event actually has a code configured.
  const requiredCode = full.round.event.joinCode;
  if (requiredCode && body.code !== requiredCode) {
    return c.json({ error: "wrong or missing join code" }, 403);
  }

  const validPlayerIds = new Set(full.players.map((p) => p.playerId));

  for (const entry of body.scores) {
    if (!Number.isInteger(entry.holeNumber) || entry.holeNumber < 1 || entry.holeNumber > 18) {
      return c.json({ error: `invalid hole_number: ${entry.holeNumber}` }, 400);
    }
    if (entry.gross !== null && (!Number.isInteger(entry.gross) || entry.gross < 1 || entry.gross > 20)) {
      return c.json({ error: `invalid gross for hole ${entry.holeNumber}: ${entry.gross}` }, 400);
    }
    // Scoring a player who isn't actually in this match would silently
    // vanish at read time (scoreMatchRows skips any hole_score whose
    // playerId isn't in match_player) -- reject it here instead, where the
    // mistake is visible, rather than let it disappear later.
    if (!validPlayerIds.has(entry.playerId)) {
      return c.json({ error: `player ${entry.playerId} is not in this match` }, 400);
    }
  }

  const now = Date.now();
  for (const entry of body.scores) {
    await db
      .insert(schema.holeScore)
      .values({
        matchId,
        playerId: entry.playerId,
        holeNumber: entry.holeNumber,
        gross: entry.gross,
        enteredBy: entry.enteredBy,
        enteredAt: new Date(now),
        clientId: entry.clientId,
        queuedAt: entry.queuedAt ? new Date(entry.queuedAt) : null,
      })
      .onConflictDoUpdate({
        target: [schema.holeScore.matchId, schema.holeScore.playerId, schema.holeScore.holeNumber],
        set: {
          gross: entry.gross,
          enteredBy: entry.enteredBy,
          enteredAt: new Date(now),
          clientId: entry.clientId,
          queuedAt: entry.queuedAt ? new Date(entry.queuedAt) : null,
        },
      });
  }

  // Re-read rather than patch the in-memory rows: cheap (one match, up to
  // 18 holes) and it is the only way to be sure the response reflects what
  // actually landed, not what we assumed would.
  const refreshed = await db.query.match.findFirst({
    where: eq(schema.match.id, matchId),
    with: { players: true, scores: true },
  });
  const labels = await loadPlayerLabels(db);
  const scoringFormat = full.round.scoringFormat as ScoringFormat;
  const teamFormat = full.round.teamFormat as TeamFormat;
  const strokeIndexes = strokeIndexesFor(full.round.teeSet.holes);
  const scored = scoreMatchRows(
    refreshed!,
    teamFormat,
    scoringFormat,
    strokeIndexes,
    full.round.pointsPerMatch,
    segmentPointsFor(full.round.segmentPoints),
  );

  return c.json({
    ...scored,
    players: scored.players.map((p) => ({ ...p, name: labels.get(p.playerId) ?? p.playerId })),
  });
});
