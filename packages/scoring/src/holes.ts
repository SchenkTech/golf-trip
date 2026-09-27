import type { HoleResult, PlayerHole, Side, TeamFormat } from "./types.ts";

/**
 * Who won one hole, from the players' gross scores and the shots they get there.
 *
 * Net score is gross minus shots received. Which net score represents a side
 * depends on the team format:
 *
 *   FOURBALL   both play their own ball, the better one counts
 *   SCRAMBLE   } one ball per side, so there is only one score to take
 *   ALT_SHOT   }
 *   FOURSOMES  }
 *   SINGLES    one player a side
 *
 * In every case that is "the lowest net score a side produced", so one rule
 * covers all of them. The formats differ in how many scores get entered, not
 * in how they are compared -- which is why this takes the format but barely
 * uses it.
 *
 * Returns null when the hole cannot be judged yet because a side has entered
 * nothing. An unjudged hole is absent from the results list rather than
 * halved; Nassau's segment rules depend on that difference.
 */
export function holeWinner(
  players: PlayerHole[],
  _format: TeamFormat,
): HoleResult | null {
  const best = (side: Side): number | null => {
    const nets = players
      .filter((p) => p.side === side && p.gross !== null)
      .map((p) => (p.gross as number) - p.strokesReceived);
    return nets.length ? Math.min(...nets) : null;
  };

  const red = best("RED");
  const blue = best("BLUE");
  if (red === null || blue === null) return null;

  if (red < blue) return "RED";
  if (blue < red) return "BLUE";
  return "HALVED";
}

/**
 * Hole-by-hole results for a whole match, in hole order, skipping holes that
 * cannot be judged yet.
 *
 * `byHole` maps hole number (1-18) to the entries for that hole.
 */
export function holeResults(
  byHole: Map<number, PlayerHole[]>,
  format: TeamFormat,
): HoleResult[] {
  const out: HoleResult[] = [];
  for (const hole of [...byHole.keys()].sort((a, b) => a - b)) {
    const winner = holeWinner(byHole.get(hole) as PlayerHole[], format);
    if (winner) out.push(winner);
  }
  return out;
}

/**
 * Shots a player receives on each hole, allocated against stroke index.
 *
 * `strokeIndex[i]` is the difficulty rank (1-18) of hole i+1. A playing
 * handicap of 18 gives a shot on every hole; 20 gives two shots on the two
 * hardest and one on the rest; a negative handicap takes shots away from the
 * easiest holes first.
 */
export function allocateStrokes(
  playingHandicap: number,
  strokeIndex: number[],
): number[] {
  const holes = strokeIndex.length;
  const out = new Array(holes).fill(0);
  if (playingHandicap === 0) return out;

  const give = playingHandicap > 0;
  let left = Math.abs(playingHandicap);

  // Hardest hole first when giving shots, easiest first when taking them away.
  const order = strokeIndex
    .map((si, i) => ({ si, i }))
    .sort((a, b) => (give ? a.si - b.si : b.si - a.si));

  while (left > 0) {
    for (const { i } of order) {
      if (left === 0) break;
      out[i] += give ? 1 : -1;
      left--;
    }
  }
  return out;
}

/**
 * One player's net score on each hole, in hole order -- gross minus the
 * shots allocateStrokes gave them there. Stroke-play net, not match play:
 * for a real-money side pool scored on total strokes rather than holes
 * won, which is a different game from what holeWinner/scoreMatch judge a
 * Nassau match on, even though both start from the same gross scores and
 * the same handicap allowance.
 *
 * null for a hole with no gross entered yet -- never zero, since a zero
 * would look like the best possible net score on a hole nobody has played.
 */
export function netByHole(
  gross: (number | null)[],
  playingHandicap: number,
  strokeIndex: number[],
): (number | null)[] {
  const shots = allocateStrokes(playingHandicap, strokeIndex);
  return gross.map((g, i) => (g === null ? null : g - shots[i]));
}

/**
 * Total of a stretch of net-by-hole values (a front nine, a back nine, an
 * eighteen), or null if any hole in that stretch hasn't been scored yet --
 * a partial nine has no real total, not a lower one than someone who
 * finished.
 */
export function netSum(net: (number | null)[]): number | null {
  return net.some((n) => n === null) ? null : (net as number[]).reduce((a, b) => a + b, 0);
}

/**
 * Per-hole best (lowest) net among several players' net-by-hole arrays --
 * the same "take the better ball" comparison holeWinner makes per hole for
 * match play, just returning the value a best-ball side actually carded
 * instead of who won the hole. null for a hole where nobody in the group
 * has a net yet.
 */
export function bestNetByHole(nets: (number | null)[][]): (number | null)[] {
  const holes = nets[0]?.length ?? 0;
  return Array.from({ length: holes }, (_, i) => {
    const vals = nets.map((n) => n[i]).filter((v): v is number => v !== null);
    return vals.length ? Math.min(...vals) : null;
  });
}
