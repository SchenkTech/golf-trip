import { test } from "node:test";
import assert from "node:assert/strict";
import { pointsAvailable, scoreMatch } from "./formats.ts";
import { allocateStrokes, holeWinner } from "./holes.ts";
import type { HoleResult, PlayerHole } from "./types.ts";

/** Build hole results from a shorthand: R=red, B=blue, H=halved. */
const h = (s: string): HoleResult[] =>
  [...s].map((c) => (c === "R" ? "RED" : c === "B" ? "BLUE" : "HALVED"));

// ---------------------------------------------------------------- match play

test("match play: winning the match is worth one point", () => {
  const r = scoreMatch(h("RRRHHHHHHHHHHHHHHH"), "MATCH_PLAY");
  assert.deepEqual(r.points, { red: 1, blue: 0 });
});

test("match play: level after eighteen splits the point", () => {
  const r = scoreMatch(h("RBRBHHHHHHHHHHHHHH"), "MATCH_PLAY");
  assert.deepEqual(r.points, { red: 0.5, blue: 0.5 });
  assert.equal(r.standing, "AS");
});

test("match play: a closed-out match reads 4&3", () => {
  // Red four up with three to play: cannot be caught.
  const r = scoreMatch(h("RRRRHHHHHHHHHHH"), "MATCH_PLAY");
  assert.equal(r.standing, "4&3");
  assert.equal(r.decided, true);
});

// -------------------------------------------------------------------- nassau

test("nassau: a match is worth three points, not one", () => {
  assert.equal(pointsAvailable("NASSAU"), 3);
  const r = scoreMatch(h("RRRHHHHHH" + "RRRHHHHHH"), "NASSAU");
  assert.deepEqual(r.points, { red: 3, blue: 0 });
  assert.equal(r.segments.length, 3);
});

test("nassau: winning one nine each splits the overall", () => {
  // Red takes the front by three, Blue takes the back by three: level overall.
  const r = scoreMatch(h("RRRHHHHHH" + "BBBHHHHHH"), "NASSAU");
  assert.deepEqual(r.points, { red: 1.5, blue: 1.5 });
});

test("nassau: a closed-out match still scores the back nine", () => {
  // THE case this engine exists for. Red goes five up through nine and closes
  // the match on 14 -- but the back nine is its own bet, and Blue wins it.
  //   front: RRRRR HHHH  -> red by five
  //   back:  R HHHH BBBB -> blue by three
  //   overall: red 6, blue 4 -> red
  const results = h("RRRRRHHHH" + "RHHHHBBBB");
  const r = scoreMatch(results, "NASSAU");

  assert.deepEqual(r.points, { red: 2, blue: 1 });
  assert.equal(r.segments[0].points.red, 1, "front nine to red");
  assert.equal(r.segments[1].points.blue, 1, "back nine to blue");
  assert.equal(r.segments[2].points.red, 1, "overall to red");

  // Straight match play would have given Blue nothing at all.
  assert.deepEqual(scoreMatch(results, "MATCH_PLAY").points, { red: 1, blue: 0 });
});

test("nassau: an unplayed back nine is worth nothing, not a half", () => {
  // Nine holes in. The back nine has not started, so it must not pay out.
  const r = scoreMatch(h("RRRHHHHHH"), "NASSAU");
  assert.deepEqual(r.segments[1].points, { red: 0, blue: 0 }, "back nine unplayed");
  assert.deepEqual(r.points, { red: 2, blue: 0 }, "front + overall only");
});

test("nassau: a part-played back nine scores on what was played", () => {
  const r = scoreMatch(h("HHHHHHHHH" + "BB"), "NASSAU");
  // Front halved, back to blue so far, overall to blue.
  assert.deepEqual(r.points, { red: 0.5, blue: 2.5 });
});

test("nassau: nothing played scores nothing", () => {
  const r = scoreMatch([], "NASSAU");
  assert.deepEqual(r.points, { red: 0, blue: 0 });
});

test("nassau: every finished match awards exactly three points", () => {
  const cases = ["RRRHHHHHHBBHHHHHHH", "RBRBRBRBRBRBRBRBRB", "HHHHHHHHHHHHHHHHHH"];
  for (const c of cases) {
    const { red, blue } = scoreMatch(h(c), "NASSAU").points;
    assert.equal(red + blue, 3, c);
  }
});

test("nassau: each nine reads its own standing", () => {
  const r = scoreMatch(h("RRRRRHHHH" + "RHHHHBBBB"), "NASSAU");
  assert.equal(r.segments[0].standing, "5 UP", "front, all nine played");
  assert.equal(r.segments[1].standing, "3 UP", "back, all nine played");
  assert.equal(r.segments[2].standing, "2 UP", "overall after eighteen");
});

// ------------------------------------------------------- pointsOverride

test("pointsOverride: a real trip's own point value replaces the format default", () => {
  // 2027's Friday/Saturday best-ball rounds are worth 2 points a match, not
  // Nassau's default 3 -- see round.pointsPerMatch in the API schema.
  const r = scoreMatch(h("RRRHHHHHH" + "RRRHHHHHH"), "NASSAU", 2);
  assert.deepEqual(r.points, { red: 2, blue: 0 });
});

test("pointsOverride: scales each segment, not just the total", () => {
  // Front and back split 1-1, overall to red -- with the format default
  // that's {front: 0/1, back: 1/0, overall: 1/0} = {red: 1, blue: 1}.
  // Scaled to a 2-point match, each of those becomes worth 2/3.
  const r = scoreMatch(h("BBBHHHHHH" + "RRRHHHHHH"), "NASSAU", 2);
  const total = r.segments.reduce((n, s) => n + s.points.red + s.points.blue, 0);
  assert.ok(Math.abs(total - 2) < 1e-9, `segments should still sum to the override: got ${total}`);
});

test("pointsOverride: omitted leaves the format default untouched", () => {
  const withDefault = scoreMatch(h("RRRHHHHHH" + "RRRHHHHHH"), "NASSAU");
  assert.deepEqual(withDefault.points, { red: 3, blue: 0 });
});

test("pointsOverride: a tie is still a tie, just worth less", () => {
  const r = scoreMatch(h("RBRBHHHHHHHHHHHHHH"), "MATCH_PLAY", 2);
  assert.deepEqual(r.points, { red: 1, blue: 1 });
  assert.equal(r.standing, "AS");
});

// ---------------------------------------------------------------- stroke play

test("STROKE never awards Cup points, whatever the holes say", () => {
  const r = scoreMatch(h("RRRRRRRRR" + "RRRRRRRRR"), "STROKE");
  assert.deepEqual(r.points, { red: 0, blue: 0 });
  assert.equal(pointsAvailable("STROKE"), 0);
});

test("STROKE ignores a pointsOverride instead of dividing by its own zero", () => {
  const r = scoreMatch(h("RRRHHHHHH" + "RRRHHHHHH"), "STROKE", 2);
  assert.deepEqual(r.points, { red: 0, blue: 0 });
  assert.ok(Number.isFinite(r.segments[0].points.red), "must not be NaN/Infinity");
});

// --------------------------------------------------- pointsOverride as an array

test("array pointsOverride: 2027's Friday/Saturday split -- overall worth double either nine", () => {
  // Red takes the front and the overall, back is halved -- with the real
  // trip's own [0.5, 0.5, 1] rule that's 0.5 (front) + 0.25 (half of the
  // back's 0.5) + 1 (overall) = 1.75 for red, 0.25 for blue.
  const r = scoreMatch(h("RRRHHHHHH" + "BRHHHHHHH"), "NASSAU", [0.5, 0.5, 1]);
  assert.deepEqual(r.segments.map((s) => s.points), [
    { red: 0.5, blue: 0 }, // front9, red by 3
    { red: 0.25, blue: 0.25 }, // back9, 1-1 halved
    { red: 1, blue: 0 }, // overall, red still ahead
  ]);
  assert.deepEqual(r.points, { red: 1.75, blue: 0.25 });
});

test("array pointsOverride: a match worth 2 sums to 2, not Nassau's natural 3", () => {
  const r = scoreMatch(h("RRRRRRRRR" + "RRRRRRRRR"), "NASSAU", [0.5, 0.5, 1]);
  assert.deepEqual(r.points, { red: 2, blue: 0 });
});

// ------------------------------------------------------------- hole outcomes

const ph = (
  playerId: string,
  side: "RED" | "BLUE",
  gross: number | null,
  strokesReceived = 0,
): PlayerHole => ({ playerId, side, gross, strokesReceived });

test("fourball takes each side's better ball", () => {
  const winner = holeWinner(
    [ph("a", "RED", 5), ph("b", "RED", 4), ph("c", "BLUE", 5), ph("d", "BLUE", 6)],
    "FOURBALL",
  );
  assert.equal(winner, "RED");
});

test("a shot received can win the hole", () => {
  // Blue is a stroke worse gross but gets a shot here: 5-1 = 4 beats 4.
  const winner = holeWinner(
    [ph("a", "RED", 4), ph("b", "BLUE", 5, 1)],
    "SINGLES",
  );
  assert.equal(winner, "HALVED");

  const winner2 = holeWinner(
    [ph("a", "RED", 5), ph("b", "BLUE", 5, 1)],
    "SINGLES",
  );
  assert.equal(winner2, "BLUE");
});

test("a hole nobody has finished is not a half", () => {
  const winner = holeWinner(
    [ph("a", "RED", 4), ph("b", "BLUE", null)],
    "SINGLES",
  );
  assert.equal(winner, null, "unjudged, so it must not enter the results");
});

// ------------------------------------------------------------------- strokes

test("strokes fall on the hardest holes first", () => {
  // Stroke index 1 is hole 3 here, index 2 is hole 1.
  const si = [2, 5, 1, 4, 3, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
  const got = allocateStrokes(3, si);
  assert.equal(got[2], 1, "SI 1 (hole 3)");
  assert.equal(got[0], 1, "SI 2 (hole 1)");
  assert.equal(got[4], 1, "SI 3 (hole 5)");
  assert.equal(got[1], 0, "SI 5 gets nothing at a handicap of three");
  assert.equal(got.reduce((a, b) => a + b, 0), 3);
});

test("a handicap of eighteen gives a shot on every hole", () => {
  const si = Array.from({ length: 18 }, (_, i) => i + 1);
  const got = allocateStrokes(18, si);
  assert.deepEqual(got, new Array(18).fill(1));
});

test("above eighteen gives a second shot on the hardest holes", () => {
  const si = Array.from({ length: 18 }, (_, i) => i + 1);
  const got = allocateStrokes(20, si);
  assert.equal(got[0], 2, "SI 1 gets two");
  assert.equal(got[1], 2, "SI 2 gets two");
  assert.equal(got[2], 1, "SI 3 gets one");
  assert.equal(got.reduce((a, b) => a + b, 0), 20);
});

test("a plus handicap takes shots from the easiest holes", () => {
  const si = Array.from({ length: 18 }, (_, i) => i + 1);
  const got = allocateStrokes(-2, si);
  assert.equal(got[17], -1, "SI 18, the easiest");
  assert.equal(got[16], -1, "SI 17");
  assert.equal(got[0], 0, "SI 1 untouched");
});

// ------------------------------------- a whole four-ball, end to end

test("a four-ball with real-shaped handicaps scores end to end", () => {
  // A 12 and an 8 against two scratch players. Low handicaps giving away a
  // lot of shots is the normal shape of a trip like this, and it's where
  // allocation and hole-winner have to agree.
  const si = Array.from({ length: 18 }, (_, i) => i + 1);
  const twelve = allocateStrokes(12, si);
  const eight = allocateStrokes(8, si);

  assert.equal(twelve[0], 1, "a 12 gets a shot on the hardest hole");
  assert.equal(twelve[12], 0, "and none on SI 13");
  assert.equal(eight[8], 0, "an 8's shots run out after SI 8");

  // Everyone makes par on the hardest hole; the shots decide it.
  const winner = holeWinner(
    [
      ph("p12", "RED", 4, twelve[0]),
      ph("p8", "RED", 4, eight[0]),
      ph("scratch-a", "BLUE", 4, 0),
      ph("scratch-b", "BLUE", 4, 0),
    ],
    "FOURBALL",
  );
  assert.equal(winner, "RED", "net 3 beats net 4");
});
