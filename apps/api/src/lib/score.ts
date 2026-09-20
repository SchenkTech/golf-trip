import { allocateStrokes, holeResults, scoreMatch } from "@gc/scoring";
import type { MatchResult, PlayerHole, ScoringFormat, TeamFormat } from "@gc/scoring";

/**
 * The team formats where a stored hole score belongs to one person.
 * SINGLES and FOURBALL are the only ones where everybody plays their own
 * ball -- a scramble, foursomes or alternate-shot round has one ball per
 * side, so the rows sitting against a player are the team's ball, not a
 * card they personally shot. Anything that reads a hole score as a
 * statement about an individual (their round average, their birdies) has
 * to check this first, or a scramble quietly credits one player with
 * everyone's good shots.
 */
export const PERSONAL_CARD_FORMATS = new Set<TeamFormat>(["SINGLES", "FOURBALL"]);

export interface ScoredMatch extends MatchResult {
  matchId: string;
  players: { playerId: string; side: "RED" | "BLUE" }[];
}

/** Turns a round's tee_hole rows (unordered as loaded) into the 18-long,
 *  hole-number-ordered stroke-index array scoreMatchRows needs. Every call
 *  site that scores a match loads `teeSet: { with: { holes: true } }` and
 *  passes `strokeIndexesFor(round.teeSet.holes)` -- one place for this so
 *  the ordering logic can't drift between routes. */
export function strokeIndexesFor(holes: { number: number; strokeIndex: number }[]): number[] {
  const out = new Array(18).fill(0);
  for (const h of holes) out[h.number - 1] = h.strokeIndex;
  return out;
}

/** Parses round.segmentPoints (schema.ts) -- a JSON array like "[0.5,0.5,1]"
 *  -- or returns null for an unset round, malformed value, or non-array
 *  JSON. Centralized so a bad value degrades to "use pointsPerMatch's even
 *  scale instead" everywhere, rather than crashing one route and not
 *  another. */
export function segmentPointsFor(raw: string | null): number[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((n) => typeof n === "number") ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Score one match from its Drizzle rows (match_player + hole_score already
 * loaded via `with: { players: true, scores: true }`).
 *
 * Pulled out of routes/rounds.ts so events.ts can reuse the identical join +
 * scoring logic for the event-wide team totals -- there must be exactly one
 * place that turns D1 rows into points, or the two call sites will drift the
 * way the original inline version and a hand-rolled copy always eventually
 * do.
 *
 * `strokeIndexes` is the round's 18 stroke indexes, ordered by hole number
 * (index 0 = hole 1). match_player.strokesReceived (schema.ts) is a single
 * number resolved at match creation -- the player's full handicap
 * allowance for the round, not a per-hole figure -- so it has to be run
 * through @gc/scoring's allocateStrokes here to know which holes it
 * actually applies to, same as the Enter screen's own "gets a shot here"
 * dot does client-side. Subtracting the flat total on every hole instead
 * (the previous behavior) handed a high-handicap player the same enormous
 * net advantage on every single hole regardless of difficulty, which is
 * not how a stroke allowance works.
 */
export function scoreMatchRows(
  m: {
    id: string;
    players: { playerId: string; side: string; strokesReceived: number }[];
    scores: { playerId: string; holeNumber: number; gross: number | null }[];
  },
  teamFormat: TeamFormat,
  scoringFormat: ScoringFormat,
  strokeIndexes: number[],
  /** round.pointsPerMatch -- null/undefined means "use the format's
   *  natural point value," same as omitting it from scoreMatch() itself. */
  pointsPerMatch?: number | null,
  /** round.segmentPoints, already parsed (segmentPointsFor) -- when set,
   *  takes priority over pointsPerMatch's even scale, since it's a more
   *  specific answer to the same question (see schema.ts's note on
   *  round.segmentPoints for why an even scale isn't always right). */
  segmentPoints?: number[] | null,
): ScoredMatch {
  const bySide = new Map(m.players.map((p) => [p.playerId, p]));
  const allocated = new Map(m.players.map((p) => [p.playerId, allocateStrokes(p.strokesReceived, strokeIndexes)]));

  const byHole = new Map<number, PlayerHole[]>();
  for (const s of m.scores) {
    const mp = bySide.get(s.playerId);
    if (!mp) continue; // a score for a player not on this match -- ignore, don't crash
    const list = byHole.get(s.holeNumber) ?? [];
    list.push({
      playerId: s.playerId,
      side: mp.side as PlayerHole["side"],
      gross: s.gross,
      strokesReceived: allocated.get(s.playerId)?.[s.holeNumber - 1] ?? 0,
    });
    byHole.set(s.holeNumber, list);
  }

  const results = holeResults(byHole, teamFormat);
  const result = scoreMatch(results, scoringFormat, segmentPoints ?? pointsPerMatch ?? undefined);

  return {
    matchId: m.id,
    players: m.players.map((p) => ({ playerId: p.playerId, side: p.side as "RED" | "BLUE" })),
    ...result,
  };
}
