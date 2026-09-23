import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { loadPlayerLabels } from "../lib/players.ts";
import { loadAllTimeStats } from "../lib/stats.ts";
import { segmentValue, segmentWeightsFor } from "../lib/segments.ts";
import * as schema from "../db/schema.ts";
import type { AppEnv } from "../types.ts";

export const history = new Hono<AppEnv>();

/**
 * Years that don't fit the event/round/match model -- see schema.ts's
 * module comment on historicalYear. Totals/averages are computed here, on
 * every request, from the same real per-round scores every time -- same
 * "derive, don't store" discipline as the live event's points, just for a
 * different kind of source data (round totals instead of hole scores).
 */
/**
 * Everyone's all-time line: record, points by format, and gross/net
 * averages. See lib/stats.ts for which year contributes what -- all of it
 * derived on the request, none of it stored.
 *
 * Registered before "/" so the literal path wins (Hono matches in
 * registration order), same reason events.ts puts /current first.
 */
history.get("/all-time", async (c) => {
  const db = c.get("db");
  return c.json(await loadAllTimeStats(db));
});

history.get("/", async (c) => {
  const db = c.get("db");

  const years = await db.query.historicalYear.findMany({
    with: { rounds: true, scores: true },
  });
  years.sort((a, b) => b.year - a.year);

  const labels = await loadPlayerLabels(db);

  const out = await Promise.all(
    years.map(async (y) => {
      const rounds = [...y.rounds].sort((a, b) => a.roundNumber - b.roundNumber);

      const byPlayer = new Map<string, { roundNumber: number; gross: number; net: number }[]>();
      for (const s of y.scores) {
        const list = byPlayer.get(s.playerId) ?? [];
        list.push({ roundNumber: s.roundNumber, gross: s.gross, net: s.net });
        byPlayer.set(s.playerId, list);
      }

      const players = [...byPlayer.entries()].map(([playerId, rows]) => {
        rows.sort((a, b) => a.roundNumber - b.roundNumber);
        const totalGross = rows.reduce((n, r) => n + r.gross, 0);
        const totalNet = rows.reduce((n, r) => n + r.net, 0);
        return {
          playerId,
          name: labels.get(playerId) ?? playerId,
          rounds: rows,
          avgGross: totalGross / rows.length,
          avgNet: totalNet / rows.length,
        };
      });
      players.sort((a, b) => a.avgNet - b.avgNet);

      // Real match results, where they exist (currently 2026 only -- see
      // Sheet7 in the trip spreadsheet). A year with none just gets an
      // empty array per round, same shape either way.
      const matchRows = await db.query.historicalMatch.findMany({ where: eq(schema.historicalMatch.year, y.year) });
      const matchPlayerRows = await db.query.historicalMatchPlayer.findMany({
        where: eq(schema.historicalMatchPlayer.year, y.year),
      });

      const roundsOut = rounds.map((r) => {
        const w = segmentWeightsFor(r);
        const matches = matchRows
          .filter((m) => m.roundNumber === r.roundNumber)
          .sort((a, b) => a.matchNumber - b.matchNumber)
          .map((m) => {
            const roster = matchPlayerRows.filter(
              (mp) => mp.roundNumber === m.roundNumber && mp.matchNumber === m.matchNumber,
            );
            const sides = [...new Set(roster.map((mp) => mp.side))];
            const [sideA, sideB] = sides;
            const pointsA =
              segmentValue(m.front9Winner, sideA, w[0]) +
              segmentValue(m.back9Winner, sideA, w[1]) +
              segmentValue(m.overallWinner, sideA, w[2]);
            const pointsB =
              segmentValue(m.front9Winner, sideB, w[0]) +
              segmentValue(m.back9Winner, sideB, w[1]) +
              segmentValue(m.overallWinner, sideB, w[2]);
            return {
              matchNumber: m.matchNumber,
              sides: sides.map((side) => ({
                side,
                players: roster.filter((mp) => mp.side === side).map((mp) => labels.get(mp.playerId) ?? mp.playerId),
                points: side === sideA ? pointsA : pointsB,
              })),
              front9Winner: m.front9Winner,
              back9Winner: m.back9Winner,
              overallWinner: m.overallWinner,
            };
          });
        return { roundNumber: r.roundNumber, courseName: r.courseName, matches };
      });

      return {
        year: y.year,
        name: y.name,
        rounds: roundsOut,
        players,
        // Only meaningful when no round has real match rows -- once a
        // year's real matches are seeded, the winner comes from those and
        // this goes back to null (see schema.ts's note on the column).
        winner: y.winner,
        // The declared final score, when the group remembers one and there
        // are no matches to derive it from. Sent as the winner's and
        // loser's totals rather than per side, because `winner` is what
        // says which side is which.
        winnerPoints: y.winnerPoints,
        loserPoints: y.loserPoints,
      };
    }),
  );

  return c.json({ years: out });
});
