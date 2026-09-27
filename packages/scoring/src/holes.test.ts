import { test } from "node:test";
import assert from "node:assert/strict";
import { netByHole, netSum, bestNetByHole } from "./holes.ts";

// ---------------------------------------------------------------- netByHole

test("net is gross minus the shot allocateStrokes gives on that hole", () => {
  // 3 holes, stroke index 1/2/3 -- a 1-handicap gets one shot, on the
  // hardest hole only (index 0, stroke index 1).
  const net = netByHole([5, 4, 6], 1, [1, 2, 3]);
  assert.deepEqual(net, [4, 4, 6]);
});

test("an unentered hole is null, not a net zero", () => {
  const net = netByHole([5, null, 6], 0, [1, 2, 3]);
  assert.deepEqual(net, [5, null, 6]);
});

test("a scratch player's net equals their gross on every hole", () => {
  assert.deepEqual(netByHole([4, 5, 3], 0, [1, 2, 3]), [4, 5, 3]);
});

// -------------------------------------------------------------------- netSum

test("net sum adds a stretch of holes once every one of them is in", () => {
  assert.equal(netSum([4, 5, 3]), 12);
});

test("one unplayed hole in the stretch makes the whole sum null", () => {
  // Not "12 so far" -- a partial total must never read as a real,
  // comparable total, or a leader board could show someone as ahead for
  // having played fewer holes.
  assert.equal(netSum([4, null, 3]), null);
});

test("an all-null stretch is null, same as a partial one", () => {
  assert.equal(netSum([null, null, null]), null);
});

// -------------------------------------------------------------- bestNetByHole

test("best-ball net takes the lower of two partners' nets, hole by hole", () => {
  const best = bestNetByHole([
    [4, 6, 3],
    [5, 4, 3],
  ]);
  assert.deepEqual(best, [4, 4, 3]);
});

test("a hole only one partner has entered still has a best-ball net", () => {
  const best = bestNetByHole([
    [4, null],
    [null, 3],
  ]);
  assert.deepEqual(best, [4, 3]);
});

test("a hole nobody on the side has entered yet stays null", () => {
  const best = bestNetByHole([
    [null, 5],
    [null, 4],
  ]);
  assert.deepEqual(best, [null, 4]);
});

test("a three-a-side best ball takes the lowest of all three, not just a pair", () => {
  const best = bestNetByHole([
    [6],
    [4],
    [5],
  ]);
  assert.deepEqual(best, [4]);
});
