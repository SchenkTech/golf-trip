/** Front9/back9/overall are declared winners for historical years, not
 *  derived from hole scores (see schema.ts's historicalMatch) -- this is
 *  the same 1-point-per-segment, 0.5-on-a-tie idea @gc/scoring's
 *  segmentPoints uses, just working from a discrete label instead of a
 *  hole array. Scale is pointsPerMatch/3 so the three segments sum to
 *  what the round actually declared, same convention as round.
 *  pointsPerMatch. Shared by routes/history.ts (the year-by-year detail)
 *  and lib/records.ts (all-time per-player win/loss) so the two can't
 *  disagree about the same declared result. */
export function segmentValue(winner: string, side: string, scale: number): number {
  if (winner === "TIE") return 0.5 * scale;
  return winner === side ? scale : 0;
}
