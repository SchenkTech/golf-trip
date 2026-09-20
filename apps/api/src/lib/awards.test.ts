import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAward } from "./awards.ts";
import type { AwardContext, AwardPlayer } from "./awards.ts";

/** These are the rules the Board's award chips move by while the trip is
 *  being played, so the cases that matter most are the awkward ones: level
 *  teams, a tie for the award, and somebody who hasn't teed off yet being
 *  mistaken for somebody on zero points. */

function player(name: string, side: "RED" | "BLUE", points: number, extra: Partial<AwardPlayer> = {}): AwardPlayer {
  return { playerId: name.toLowerCase(), name, side, points, birdies: 0, played: true, ...extra };
}

function ctx(players: AwardPlayer[], red = 0, blue = 0): AwardContext {
  return {
    players,
    teams: [
      { color: "RED", name: "Team Fox", points: red },
      { color: "BLUE", name: "Team Wolf", points: blue },
    ],
  };
}

test("most points on the leading team picks from the leading side only", () => {
  const c = ctx([player("Ray", "RED", 3), player("Sam", "BLUE", 5), player("Fox", "RED", 4)], 7, 5);
  const r = resolveAward("LEAD_TEAM_MOST_POINTS", c);
  assert.equal(r.holderName, "Fox");
  assert.match(r.reason ?? "", /Team Fox/);
});

test("the trailing-team awards read the other side", () => {
  const c = ctx([player("Ray", "RED", 3), player("Sam", "BLUE", 4), player("Dale", "BLUE", 1)], 7, 5);
  assert.equal(resolveAward("TRAIL_TEAM_MOST_POINTS", c).holderName, "Sam");
  assert.equal(resolveAward("TRAIL_TEAM_FEWEST_POINTS", c).holderName, "Dale");
});

test("level teams have no leading or trailing side", () => {
  const c = ctx([player("Ray", "RED", 3), player("Sam", "BLUE", 3)], 5, 5);
  const r = resolveAward("LEAD_TEAM_MOST_POINTS", c);
  assert.equal(r.holderName, null);
  assert.equal(r.reason, "Teams are level");
});

test("nothing scored yet is not a zero-point tie", () => {
  const c = ctx([player("Ray", "RED", 0, { played: false }), player("Sam", "BLUE", 0, { played: false })], 0, 0);
  const r = resolveAward("FEWEST_POINTS", c);
  assert.equal(r.holderName, null);
  assert.equal(r.reason, "Nothing scored yet");
});

test("a player who hasn't teed off can't win fewest points", () => {
  const c = ctx(
    [player("Ray", "RED", 2), player("Sam", "BLUE", 1), player("Dale", "BLUE", 0, { played: false })],
    2,
    1,
  );
  assert.equal(resolveAward("FEWEST_POINTS", c).holderName, "Sam");
});

test("a two-way tie names both, a bigger one says so", () => {
  const two = ctx([player("Ray", "RED", 4), player("Fox", "RED", 4), player("Sam", "BLUE", 1)], 8, 1);
  assert.equal(resolveAward("MOST_POINTS", two).holderName, "Ray & Fox");

  const three = ctx(
    [player("Ray", "RED", 4), player("Fox", "RED", 4), player("Pete", "RED", 4), player("Sam", "BLUE", 1)],
    12,
    1,
  );
  assert.equal(resolveAward("MOST_POINTS", three).holderName, "3-way tie");
});

test("birdies are counted, and no birdies is its own answer", () => {
  const none = ctx([player("Ray", "RED", 2), player("Sam", "BLUE", 1)], 2, 1);
  assert.equal(resolveAward("MOST_BIRDIES", none).reason, "No birdies yet");

  const some = ctx(
    [player("Ray", "RED", 2, { birdies: 1 }), player("Sam", "BLUE", 1, { birdies: 3 })],
    2,
    1,
  );
  const r = resolveAward("MOST_BIRDIES", some);
  assert.equal(r.holderName, "Sam");
  assert.equal(r.reason, "3 birdies");
});

test("half points read as halves, not as 2.0", () => {
  const c = ctx([player("Ray", "RED", 2.5), player("Sam", "BLUE", 1)], 2.5, 1);
  assert.equal(resolveAward("MOST_POINTS", c).reason, "2.5 pts, most on the trip");
});

test("a manual award is left entirely alone", () => {
  const c = ctx([player("Ray", "RED", 4)], 4, 0);
  assert.deepEqual(resolveAward("MANUAL", c), { holderName: null, reason: null });
});
