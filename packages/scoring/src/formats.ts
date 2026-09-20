import type {
  HoleResult,
  MatchResult,
  Points,
  ScoringFormat,
  Segment,
} from "./types.ts";

const HOLES = 18;

/** Score one run of holes as a single match-play bet: most holes won takes it. */
function segmentPoints(results: HoleResult[]): Points {
  // An empty segment is NOT a half. Holes nobody has played are absent from
  // `results`, so treating empty as level would hand out half a point each for
  // a back nine nobody has teed off on.
  if (results.length === 0) return { red: 0, blue: 0 };

  const red = results.filter((r) => r === "RED").length;
  const blue = results.filter((r) => r === "BLUE").length;
  if (red > blue) return { red: 1, blue: 0 };
  if (blue > red) return { red: 0, blue: 1 };
  return { red: 0.5, blue: 0.5 };
}

/**
 * How a bet reads: "3 UP", "AS", or "4&3" once it cannot be lost.
 *
 * `total` is how many holes the bet runs over (18 for a match, 9 for a nine),
 * which is what makes "holes remaining" -- and therefore a closeout -- meaningful.
 */
function standing(results: HoleResult[], total: number): string {
  const red = results.filter((r) => r === "RED").length;
  const blue = results.filter((r) => r === "BLUE").length;
  const lead = Math.abs(red - blue);
  const remaining = Math.max(0, total - results.length);

  if (lead === 0) return "AS";
  // Closed out: the lead is bigger than the holes left to play it back.
  if (lead > remaining && remaining > 0) return `${lead}&${remaining}`;
  return `${lead} UP`;
}

function add(a: Points, b: Points): Points {
  return { red: a.red + b.red, blue: a.blue + b.blue };
}

/** Straight match play: one point for the match, halved if level after 18. */
function matchPlay(results: HoleResult[]): Segment[] {
  return [
    {
      name: "Match",
      points: segmentPoints(results),
      standing: standing(results, HOLES),
      holesPlayed: results.length,
    },
  ];
}

/**
 * Nassau: three independent bets on one match -- front nine, back nine, and the
 * overall eighteen. Three points, not one.
 *
 * The trap this function exists to avoid: a match closed out 5&4 still has a
 * live back nine. Code that stops counting at the closeout -- which is the
 * natural thing to write, because stopping is exactly what produces the string
 * "5&4" -- silently deletes a bet that is still being played. So the *result*
 * truncates and the *points* never do. `results` must always be every judged
 * hole, in order.
 */
function nassau(results: HoleResult[]): Segment[] {
  const front = results.slice(0, 9);
  const back = results.slice(9, 18);
  return [
    {
      name: "Front 9",
      points: segmentPoints(front),
      standing: standing(front, 9),
      holesPlayed: front.length,
    },
    {
      name: "Back 9",
      points: segmentPoints(back),
      standing: standing(back, 9),
      holesPlayed: back.length,
    },
    {
      name: "Overall",
      points: segmentPoints(results),
      standing: standing(results, HOLES),
      holesPlayed: results.length,
    },
  ];
}

/**
 * Hi-Lo: the better ball and the worse ball are separate points on the match.
 *
 * Both are decided from the same hole results here, because `holeWinner`
 * already reduced each side to one figure. Scoring the low ball properly needs
 * per-player nets, so this is deliberately a placeholder that keeps the shape
 * right -- see the note in docs/SCORING.md before relying on it.
 */
function hiLo(results: HoleResult[]): Segment[] {
  return [
    {
      name: "High ball",
      points: segmentPoints(results),
      standing: standing(results, HOLES),
      holesPlayed: results.length,
    },
  ];
}

/**
 * Stroke play: a side game, not a Cup format -- see docs/SCORING.md's
 * "Points: —". Every other format here receives hole-by-hole RED/BLUE
 * winners, already reduced from raw scores by `holeWinner` before this
 * package sees them -- there is no total-strokes figure in a
 * `HoleResult[]` to rank players by, and adding one would mean a second,
 * differently-shaped input just for this format. Registered honestly
 * instead: zero points, always, so a round can be marked STROKE without
 * it silently affecting the Cup or faking a ranking this function cannot
 * actually compute from what it's given.
 */
function strokePlay(results: HoleResult[]): Segment[] {
  return [
    {
      name: "Stroke Play",
      points: { red: 0, blue: 0 },
      standing: "Side game -- not scored toward the Cup",
      holesPlayed: results.length,
    },
  ];
}

const FORMATS: Record<ScoringFormat, (r: HoleResult[]) => Segment[]> = {
  MATCH_PLAY: matchPlay,
  NASSAU: nassau,
  HI_LO: hiLo,
  STROKE: strokePlay,
};

/** Total points a match is worth when every hole has been played. */
export function pointsAvailable(format: ScoringFormat): number {
  return { MATCH_PLAY: 1, NASSAU: 3, HI_LO: 1, STROKE: 0 }[format];
}

/**
 * Score a match.
 *
 * `results` is every hole that can be judged, in hole order, and never
 * truncated at a closeout -- see `nassau` above for why that matters.
 *
 * `pointsOverride`, when given, is what the match is actually worth --
 * this exists because a real trip's own rules don't always match a
 * format's natural point value or its natural even split. Two shapes:
 *
 * - A single number scales every segment by the same factor, so they sum
 *   to it instead of `pointsAvailable(format)` -- e.g. Sunday's singles
 *   staying Nassau's natural 3, front/back/overall each still worth 1.
 * - An array gives each segment its own absolute point value, in the same
 *   order the format's own function returns its segments (Nassau:
 *   [front9, back9, overall]). Every raw segment's natural total is
 *   exactly 1 (a plain win/halve/loss), so the array entry *is* that
 *   segment's new total, not a further scale of it -- this is how 2027's
 *   Friday/Saturday best-ball rounds are worth 2 points as [0.5, 0.5, 1],
 *   not the [0.667, 0.667, 0.667] a single-number scale would produce.
 *   (See round.pointsPerMatch/segmentPoints in the API's schema, which is
 *   where either shape comes from -- this package stays pure and just
 *   takes the numbers.)
 *
 * Each segment still resolves its own winner exactly as before (a tie is
 * still a tie); only the point value attached to that result changes.
 */
export function scoreMatch(
  results: HoleResult[],
  format: ScoringFormat,
  pointsOverride?: number | number[],
): MatchResult {
  const rawSegments = FORMATS[format](results);
  // STROKE's pointsAvailable is 0 (a side game, never a Cup format -- see
  // strokePlay above), so a single-number override for it would divide by
  // zero. There's nothing to scale in that case; every segment is already
  // {red:0,blue:0}.
  const available = pointsAvailable(format);

  let segments: Segment[];
  if (pointsOverride === undefined || available === 0) {
    segments = rawSegments;
  } else if (Array.isArray(pointsOverride)) {
    segments = rawSegments.map((s, i) => {
      const value = pointsOverride[i] ?? 1;
      return { ...s, points: { red: s.points.red * value, blue: s.points.blue * value } };
    });
  } else {
    const scale = pointsOverride / available;
    segments = rawSegments.map((s) => ({ ...s, points: { red: s.points.red * scale, blue: s.points.blue * scale } }));
  }
  const points = segments.reduce((acc, s) => add(acc, s.points), { red: 0, blue: 0 });

  const red = results.filter((r) => r === "RED").length;
  const blue = results.filter((r) => r === "BLUE").length;
  const lead = Math.abs(red - blue);
  const remaining = Math.max(0, HOLES - results.length);

  return {
    points,
    segments,
    standing: standing(results, HOLES),
    decided: lead > remaining,
    holesPlayed: results.length,
  };
}
