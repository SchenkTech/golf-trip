/** Which side won a hole. HALVED is a played hole that was tied; a hole nobody
 *  has finished is simply absent from the list, which is a distinction the
 *  Nassau segment rules lean on. */
export type HoleResult = "RED" | "BLUE" | "HALVED";

export type Side = "RED" | "BLUE";

/** How the sides are arranged. Independent of how points are counted --
 *  a scramble scored at match play is still match play. */
export type TeamFormat =
  | "SINGLES"
  | "FOURBALL"
  | "FOURSOMES"
  | "SCRAMBLE"
  | "ALT_SHOT";

/** How points are counted. The other axis. */
export type ScoringFormat = "MATCH_PLAY" | "NASSAU" | "HI_LO" | "STROKE";

export interface Points {
  red: number;
  blue: number;
}

/** A named bet inside a match. Match play has one ("Match"); Nassau has three. */
export interface Segment {
  name: string;
  points: Points;
  /** Standing within this segment: "3 UP", "AS", or a closed-out "4&3". */
  standing: string;
  /** Holes belonging to this segment that have actually been played. */
  holesPlayed: number;
}

export interface MatchResult {
  points: Points;
  segments: Segment[];
  /** What the match reads on the board: "2 UP", "AS", "4&3". Reflects the
   *  overall eighteen, and stops at the closeout hole -- unlike the points,
   *  which never do. */
  standing: string;
  /** True once no remaining hole can change the overall result. */
  decided: boolean;
  holesPlayed: number;
}

/** One player's gross strokes on one hole, plus the shots they receive there. */
export interface PlayerHole {
  playerId: string;
  side: Side;
  /** Gross strokes. null means "not entered yet" -- not zero, and not a pickup. */
  gross: number | null;
  /** Shots received on this hole, from handicap allocation against stroke index. */
  strokesReceived: number;
}
