import { test } from "node:test";
import assert from "node:assert/strict";
import { segmentValue, segmentWeightsFor } from "./segments.ts";

/** The group plays the overall eighteen for twice what either nine is
 *  worth. Assuming the three bets were equal is what got 2026's scores
 *  wrong, so the weighting has tests of its own. */

test("an explicit split is used as written", () => {
  assert.deepEqual(segmentWeightsFor({ pointsPerMatch: 2, segmentPoints: "[0.5,0.5,1]" }), [0.5, 0.5, 1]);
});

test("without a split, points per match divide evenly", () => {
  assert.deepEqual(segmentWeightsFor({ pointsPerMatch: 3 }), [1, 1, 1]);
  assert.deepEqual(segmentWeightsFor({ pointsPerMatch: 2 }), [2 / 3, 2 / 3, 2 / 3]);
});

test("a round that says nothing is worth three points, one a bet", () => {
  assert.deepEqual(segmentWeightsFor({}), [1, 1, 1]);
});

test("a malformed or wrong-length split falls back rather than throwing", () => {
  assert.deepEqual(segmentWeightsFor({ pointsPerMatch: 3, segmentPoints: "not json" }), [1, 1, 1]);
  assert.deepEqual(segmentWeightsFor({ pointsPerMatch: 3, segmentPoints: "[0.5,1]" }), [1, 1, 1]);
  assert.deepEqual(segmentWeightsFor({ pointsPerMatch: 3, segmentPoints: '["a","b","c"]' }), [1, 1, 1]);
});

test("a segment pays its weight to the winner, half to each on a tie", () => {
  assert.equal(segmentValue("FOX", "FOX", 1), 1);
  assert.equal(segmentValue("FOX", "WOLF", 1), 0);
  assert.equal(segmentValue("TIE", "FOX", 1), 0.5);
  assert.equal(segmentValue("TIE", "FOX", 0.5), 0.25);
});

test("a full match under the group's split is worth two points", () => {
  const w = segmentWeightsFor({ pointsPerMatch: 2, segmentPoints: "[0.5,0.5,1]" });
  const swept = segmentValue("FOX", "FOX", w[0]) + segmentValue("FOX", "FOX", w[1]) + segmentValue("FOX", "FOX", w[2]);
  assert.equal(swept, 2);
  // Losing both nines but taking the eighteen is still a winning match.
  const split = segmentValue("WOLF", "FOX", w[0]) + segmentValue("WOLF", "FOX", w[1]) + segmentValue("FOX", "FOX", w[2]);
  assert.equal(split, 1);
});
