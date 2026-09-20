import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { ScoringFormat, TeamFormat } from "@gc/scoring";
import { scoreMatchRows, strokeIndexesFor, segmentPointsFor } from "../lib/score.ts";
import { loadPlayerLabels } from "../lib/players.ts";
import * as schema from "../db/schema.ts";
import type { AppEnv } from "../types.ts";

export const rounds = new Hono<AppEnv>();

/**
 * Every match in a round, scored.
 *
 * This is the one route that proves the whole chain: D1 rows -> Drizzle ->
 * @gc/scoring -> JSON. Everything downstream of hole_score is computed here,
 * on every request, never cached -- see docs/SCORING.md. That is a
 * deliberate cost, not an oversight: for a dozen matches over three days it
 * is nothing, and it is what keeps History honest forever.
 */
rounds.get("/:id/matches", async (c) => {
  const db = c.get("db");
  const roundId = c.req.param("id");

  const round = await db.query.round.findFirst({
    where: eq(schema.round.id, roundId),
    with: { teeSet: { with: { holes: true } } },
  });
  if (!round) return c.json({ error: "round not found" }, 404);

  const matches = await db.query.match.findMany({
    where: eq(schema.match.roundId, roundId),
    with: { players: true, scores: true },
  });

  const scoringFormat = round.scoringFormat as ScoringFormat;
  const teamFormat = round.teamFormat as TeamFormat;
  const strokeIndexes = strokeIndexesFor(round.teeSet.holes);
  const labels = await loadPlayerLabels(db);

  const segmentPoints = segmentPointsFor(round.segmentPoints);
  const scored = matches.map((m) => {
    const s = scoreMatchRows(m, teamFormat, scoringFormat, strokeIndexes, round.pointsPerMatch, segmentPoints);
    return { ...s, players: s.players.map((p) => ({ ...p, name: labels.get(p.playerId) ?? p.playerId })) };
  });

  return c.json({
    roundId,
    scoringFormat,
    teamFormat,
    matches: scored,
  });
});
