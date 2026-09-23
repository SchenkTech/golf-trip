import { eq } from "drizzle-orm";
import type { ScoringFormat, TeamFormat } from "@gc/scoring";
import type { AppDb } from "../db/client.ts";
import * as schema from "../db/schema.ts";
import { scoreMatchRows, strokeIndexesFor, segmentPointsFor } from "./score.ts";
import { segmentValue, segmentWeightsFor } from "./segments.ts";

export interface PlayerRecord {
  w: number;
  l: number;
  h: number;
}

function bump(map: Map<string, PlayerRecord>, playerId: string, outcome: "w" | "l" | "h") {
  const r = map.get(playerId) ?? { w: 0, l: 0, h: 0 };
  r[outcome]++;
  map.set(playerId, r);
}

/**
 * Per-player match record -- wins/losses/halves, one tally per match, not
 * per Nassau segment: a match's three bets settle to a single outcome by
 * comparing each side's total points, same convention the Board's team
 * totals already use. Only a *decided* match counts -- a live in-progress
 * lead isn't a record yet, and letting it count would make the number
 * flicker as the match is played.
 *
 * `eventId` scopes this to one event's live rounds ("this weekend");
 * leave it out and pass `includeHistorical: true` for the all-time
 * version, which also folds in any historical year upgraded to real
 * historicalMatch rows (see schema.ts's note on historicalYear). A year
 * with only a bare declared winner has no per-player breakdown to derive
 * from and can't contribute here -- same "derive from what's real"
 * discipline as everywhere else in this app (docs/SCORING.md).
 */
export async function loadPlayerRecords(
  db: AppDb,
  opts: { eventId?: string; includeHistorical?: boolean } = {},
): Promise<Map<string, PlayerRecord>> {
  const out = new Map<string, PlayerRecord>();

  const roundRows = await db.query.round.findMany({
    where: opts.eventId ? eq(schema.round.eventId, opts.eventId) : undefined,
    with: {
      matches: { with: { players: true, scores: true } },
      teeSet: { with: { holes: true } },
    },
  });
  for (const r of roundRows) {
    const scoringFormat = r.scoringFormat as ScoringFormat;
    const teamFormat = r.teamFormat as TeamFormat;
    const strokeIndexes = strokeIndexesFor(r.teeSet.holes);
    const segmentPoints = segmentPointsFor(r.segmentPoints);
    for (const m of r.matches) {
      if (m.players.length === 0) continue;
      const scored = scoreMatchRows(m, teamFormat, scoringFormat, strokeIndexes, r.pointsPerMatch, segmentPoints);
      if (!scored.decided) continue;
      if (scored.points.red === scored.points.blue) {
        for (const p of m.players) bump(out, p.playerId, "h");
      } else {
        const winnerSide = scored.points.red > scored.points.blue ? "RED" : "BLUE";
        for (const p of m.players) bump(out, p.playerId, p.side === winnerSide ? "w" : "l");
      }
    }
  }

  if (opts.includeHistorical) {
    const hMatches = await db.query.historicalMatch.findMany();
    const hPlayers = await db.query.historicalMatchPlayer.findMany();
    const hRounds = await db.query.historicalRound.findMany();
    for (const hm of hMatches) {
      const roster = hPlayers.filter(
        (p) => p.year === hm.year && p.roundNumber === hm.roundNumber && p.matchNumber === hm.matchNumber,
      );
      const sides = [...new Set(roster.map((p) => p.side))];
      if (sides.length !== 2) continue; // can't call a winner without two named sides
      const round = hRounds.find((r) => r.year === hm.year && r.roundNumber === hm.roundNumber);
      const w = segmentWeightsFor(round ?? {});
      const total = (side: string) =>
        segmentValue(hm.front9Winner, side, w[0]) +
        segmentValue(hm.back9Winner, side, w[1]) +
        segmentValue(hm.overallWinner, side, w[2]);
      const [a, b] = sides;
      const pa = total(a);
      const pb = total(b);
      if (pa === pb) {
        for (const p of roster) bump(out, p.playerId, "h");
      } else {
        const winnerSide = pa > pb ? a : b;
        for (const p of roster) bump(out, p.playerId, p.side === winnerSide ? "w" : "l");
      }
    }
  }

  return out;
}
