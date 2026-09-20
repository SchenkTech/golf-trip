/**
 * Individual awards that work themselves out from play -- docs/SPEC.md's
 * "some are derived (first birdie in Hi-Lo or singles), some are set by an
 * admin, some fall out of the team state" -- and the requirement that came
 * back from the first pass: the names are the group's own in-jokes, but the
 * holder has to keep itself up to date as the trip is played.
 *
 * Nothing here is stored. A derived award's holder is worked out from the
 * event's own points every time the Board is loaded, the same way team
 * totals and match standings are (docs/SCORING.md) -- which is exactly what
 * "auto update as it's played" means: enter a hole, reload, the chip has
 * already moved.
 *
 * The *names* are the group's own in-jokes and get renamed in Admin. The
 * rule is what the award actually is; the name is just what the trip calls
 * it. Keep that split: a rename must never change who holds a thing.
 */

/** A player's tally for one event, as far as it's been played. */
export interface AwardPlayer {
  playerId: string;
  name: string;
  side: "RED" | "BLUE";
  points: number;
  /** Holes under par (birdies and better) across every match they've played. */
  birdies: number;
  /** True once they've played a hole that actually counts. Someone whose
   *  matches haven't teed off has no record yet -- crucially they are not
   *  "on zero points", or every fewest-points award would be theirs before
   *  the trip started. */
  played: boolean;
}

export interface AwardContext {
  players: AwardPlayer[];
  /** Team points as the Board shows them, by color, plus the team names --
   *  what "leading"/"trailing" mean. */
  teams: { color: "RED" | "BLUE"; name: string; points: number }[];
}

/** The vocabulary. Admin's picker labels these for a reader ("Most points
 *  on the leading team") in apps/web's api.ts -- the label is copy and
 *  lives with the screen that shows it; these values are the contract. */
export const AWARD_RULES = [
  "MANUAL",
  "LEAD_TEAM_MOST_POINTS",
  "TRAIL_TEAM_MOST_POINTS",
  "TRAIL_TEAM_FEWEST_POINTS",
  "MOST_POINTS",
  "FEWEST_POINTS",
  "MOST_BIRDIES",
] as const;

export type AwardRule = (typeof AWARD_RULES)[number];

export function isAwardRule(value: string): value is AwardRule {
  return (AWARD_RULES as readonly string[]).includes(value);
}

export interface ResolvedAward {
  holderName: string | null;
  reason: string | null;
}

/** Points shown the way the Board shows them -- 2 and 2.5, never 2.0. */
function pts(n: number): string {
  return `${Number(n.toFixed(1))} pt${n === 1 ? "" : "s"}`;
}

/** A tie is a real outcome here, not an error to break: two people genuinely
 *  hold the thing. Two names read fine on a chip; more than that doesn't, so
 *  it says so instead of overflowing. */
function holders(names: string[]): string {
  if (names.length <= 2) return names.join(" & ");
  return `${names.length}-way tie`;
}

/** Everyone tied at the extreme of `value`, from those who've actually
 *  played. Empty when nobody has. */
function extreme(players: AwardPlayer[], value: (p: AwardPlayer) => number, direction: "max" | "min"): AwardPlayer[] {
  const eligible = players.filter((p) => p.played);
  if (eligible.length === 0) return [];
  const best = eligible.reduce(
    (acc, p) => (direction === "max" ? Math.max(acc, value(p)) : Math.min(acc, value(p))),
    direction === "max" ? -Infinity : Infinity,
  );
  return eligible.filter((p) => value(p) === best);
}

/**
 * Who holds one derived award right now, and why. A null holder is a normal
 * state, not a failure -- docs/SPEC.md: an undecided award "reads as '—'
 * with an explanation before it is decided ('Hole not set yet', 'Teams are
 * level')". The explanation is the point; "—" on its own tells nobody
 * anything.
 */
export function resolveAward(rule: AwardRule, ctx: AwardContext): ResolvedAward {
  if (rule === "MANUAL") return { holderName: null, reason: null };

  const anyPlayed = ctx.players.some((p) => p.played);
  if (!anyPlayed) return { holderName: null, reason: "Nothing scored yet" };

  if (rule === "MOST_BIRDIES") {
    const top = extreme(ctx.players, (p) => p.birdies, "max");
    if (top.length === 0 || top[0].birdies === 0) return { holderName: null, reason: "No birdies yet" };
    const n = top[0].birdies;
    return { holderName: holders(top.map((p) => p.name)), reason: `${n} birdie${n === 1 ? "" : "s"}` };
  }

  if (rule === "MOST_POINTS" || rule === "FEWEST_POINTS") {
    const direction = rule === "MOST_POINTS" ? "max" : "min";
    const top = extreme(ctx.players, (p) => p.points, direction);
    if (top.length === 0) return { holderName: null, reason: "Nothing scored yet" };
    return {
      holderName: holders(top.map((p) => p.name)),
      reason: `${pts(top[0].points)}, ${direction === "max" ? "most" : "fewest"} on the trip`,
    };
  }

  // The three team-state awards. With the teams level there is no leading or
  // trailing side to pick from, and saying so is more useful than handing the
  // award to whoever happens to be ahead on a tiebreak nobody agreed to.
  const [red, blue] = [ctx.teams.find((t) => t.color === "RED"), ctx.teams.find((t) => t.color === "BLUE")];
  if (!red || !blue) return { holderName: null, reason: "Teams not set" };
  if (red.points === blue.points) return { holderName: null, reason: "Teams are level" };

  const leading = red.points > blue.points ? red : blue;
  const trailing = leading === red ? blue : red;
  const target = rule === "LEAD_TEAM_MOST_POINTS" ? leading : trailing;
  const direction = rule === "TRAIL_TEAM_FEWEST_POINTS" ? "min" : "max";

  const roster = ctx.players.filter((p) => p.side === target.color);
  const top = extreme(roster, (p) => p.points, direction);
  if (top.length === 0) return { holderName: null, reason: `Nobody on ${target.name} has played yet` };

  return {
    holderName: holders(top.map((p) => p.name)),
    reason: `${pts(top[0].points)}, ${direction === "max" ? "most" : "fewest"} on ${target.name}`,
  };
}
