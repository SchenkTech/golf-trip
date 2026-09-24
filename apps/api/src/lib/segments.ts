/** Front9/back9/overall are declared winners for historical years, not
 *  derived from hole scores (see schema.ts's historicalMatch) -- this is
 *  the same idea @gc/scoring's segmentPoints uses, just working from a
 *  discrete label instead of a hole array. Shared by routes/history.ts
 *  (the year-by-year detail), lib/records.ts (all-time per-player
 *  win/loss) and lib/stats.ts (points by format) so the three can't
 *  disagree about the same declared result. */

/** What one segment is worth to one side: the whole thing for a win,
 *  nothing for a loss. A tie is flat 0.5 to each side, not half of
 *  `weight` -- these aren't proportional bets, they're Ryder Cup points,
 *  and a halved session pays 0.5 regardless of what a decisive one is
 *  worth. Caught live: a front-nine tie on a 0.5/0.5/1 match was paying
 *  0.25 each instead of 0.5, throwing off the final total.
 *
 *  This does mean a tied segment can pay out MORE total than a decisive
 *  one on the same match (0.5+0.5 versus a 0.5-weight segment's own 0.5),
 *  so a match's points no longer have to sum to its nominal weight. That
 *  is the accepted trade -- a halved segment is its own flat half-point,
 *  not a fraction of one. */
export function segmentValue(winner: string, side: string, weight: number): number {
  if (winner === "TIE") return 0.5;
  return winner === side ? weight : 0;
}

/**
 * What each of the three bets is worth in a historical round, in
 * front/back/overall order.
 *
 * The three are NOT always equal, and assuming they were is how this got
 * a year's scores wrong: the group plays the overall eighteen for twice
 * what either nine is worth -- 0.5 / 0.5 / 1, two points a match -- which
 * is the same split live rounds carry in round.segmentPoints. Scaling one
 * pointsPerMatch evenly across three bets can't express that, and quietly
 * produces 0.67 / 0.67 / 0.67 instead.
 *
 * Falls back to an even split of pointsPerMatch (default 3, one point a
 * bet) when a round doesn't say, which is what every round did before this
 * column existed.
 */
export function segmentWeightsFor(round: {
  pointsPerMatch?: number | null;
  segmentPoints?: string | null;
}): [number, number, number] {
  if (round.segmentPoints) {
    try {
      const parsed = JSON.parse(round.segmentPoints);
      if (Array.isArray(parsed) && parsed.length === 3 && parsed.every((n) => typeof n === "number")) {
        return [parsed[0], parsed[1], parsed[2]];
      }
    } catch {
      // Malformed JSON falls through to the even split below, the same way
      // a live round's does (see lib/score.ts's segmentPointsFor).
    }
  }
  const each = (round.pointsPerMatch ?? 3) / 3;
  return [each, each, each];
}
