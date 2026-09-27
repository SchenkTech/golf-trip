import { eq } from "drizzle-orm";
import { netByHole, netSum, bestNetByHole } from "@gc/scoring";
import { strokeIndexesFor } from "./score.ts";
import { loadPlayerLabels } from "./players.ts";
import * as schema from "../db/schema.ts";
import type { AppDb } from "../db/client.ts";

export interface NamedPlayer {
  playerId: string;
  name: string;
}

export interface NetLeaderGroup {
  net: number;
  /** More than one entry means a real tie -- see docs/DECISIONS.md #12:
   *  a payout pot with tied leaders is meant to be split evenly, same
   *  spirit as awards.ts's "two people genuinely hold the thing." */
  leaders: NamedPlayer[];
}

export interface BestBallSide {
  matchId: string;
  side: "RED" | "BLUE";
  players: NamedPlayer[];
}

export interface BestBallLeaderGroup {
  net: number;
  leaders: BestBallSide[];
}

export interface PayoutLeaders {
  /** Best individual net for holes 1-9 / 10-18 / all 18, across every
   *  player in the round regardless of which match they're in -- null
   *  until at least one player has finished that stretch. */
  front9: NetLeaderGroup | null;
  back9: NetLeaderGroup | null;
  overall: NetLeaderGroup | null;
  /** Best round-net best-ball side across every match in the round (per
   *  hole, the better of a side's players' nets, summed for the round) --
   *  null until at least one side has a full 18 in. A side only enters
   *  the running once every one of its players has finished all 18;
   *  see docs/DECISIONS.md #12 for why this compares every side in the
   *  round against every other, not just the two sides of one match. */
  bestBall: BestBallLeaderGroup | null;
}

const EMPTY: PayoutLeaders = { front9: null, back9: null, overall: null, bestBall: null };

/**
 * Who's currently leading each of the round's usual net-score side pots --
 * a read-only helper for Admin's Payouts section (routes/admin.ts), not a
 * stored fact. Nothing here is a Cup point: this is stroke-play net,
 * scored on total strokes rather than holes won, a different game from
 * what the Cup's own match-play segments judge even though both start
 * from the same gross scores and handicap allowance. See
 * docs/DECISIONS.md #12.
 */
export async function loadPayoutLeaders(db: AppDb, roundId: string): Promise<PayoutLeaders> {
  const round = await db.query.round.findFirst({
    where: eq(schema.round.id, roundId),
    with: { teeSet: { with: { holes: true } } },
  });
  if (!round) return EMPTY;
  const strokeIndexes = strokeIndexesFor(round.teeSet.holes);

  const matches = await db.query.match.findMany({
    where: eq(schema.match.roundId, roundId),
    with: { players: true, scores: true },
  });
  if (matches.length === 0) return EMPTY;

  const labels = await loadPlayerLabels(db);
  const name = (playerId: string) => labels.get(playerId) ?? playerId;

  // playerId -> 18-long net-by-hole array. A player is never on two
  // matches in the same round, so this is safe to key on playerId alone.
  const netByPlayer = new Map<string, (number | null)[]>();
  for (const m of matches) {
    const grossByPlayer = new Map<string, (number | null)[]>();
    for (const p of m.players) grossByPlayer.set(p.playerId, new Array(18).fill(null));
    for (const s of m.scores) {
      const arr = grossByPlayer.get(s.playerId);
      if (arr) arr[s.holeNumber - 1] = s.gross;
    }
    for (const p of m.players) {
      netByPlayer.set(p.playerId, netByHole(grossByPlayer.get(p.playerId) ?? [], p.strokesReceived, strokeIndexes));
    }
  }

  const individualSegment = (start: number, end: number): NetLeaderGroup | null => {
    let best: number | null = null;
    let leaders: string[] = [];
    for (const [playerId, net] of netByPlayer) {
      const total = netSum(net.slice(start, end));
      if (total === null) continue;
      if (best === null || total < best) {
        best = total;
        leaders = [playerId];
      } else if (total === best) {
        leaders.push(playerId);
      }
    }
    return best === null ? null : { net: best, leaders: leaders.map((id) => ({ playerId: id, name: name(id) })) };
  };

  let bbBest: number | null = null;
  let bbLeaders: BestBallSide[] = [];
  for (const m of matches) {
    for (const side of ["RED", "BLUE"] as const) {
      const sidePlayers = m.players.filter((p) => p.side === side);
      if (sidePlayers.length === 0) continue;
      const nets = sidePlayers.map((p) => netByPlayer.get(p.playerId) ?? []);
      const total = netSum(bestNetByHole(nets));
      if (total === null) continue;
      const entry: BestBallSide = { matchId: m.id, side, players: sidePlayers.map((p) => ({ playerId: p.playerId, name: name(p.playerId) })) };
      if (bbBest === null || total < bbBest) {
        bbBest = total;
        bbLeaders = [entry];
      } else if (total === bbBest) {
        bbLeaders.push(entry);
      }
    }
  }

  return {
    front9: individualSegment(0, 9),
    back9: individualSegment(9, 18),
    overall: individualSegment(0, 18),
    bestBall: bbBest === null ? null : { net: bbBest, leaders: bbLeaders },
  };
}
