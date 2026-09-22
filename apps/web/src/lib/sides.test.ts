import { test } from "node:test";
import assert from "node:assert/strict";
import { declaredScore, sideLabel, sideLabelsFor, sideKeyFor } from "./sides.ts";

/** The all-time record depends entirely on this mapping: get it wrong and
 *  a year's points land on the wrong side, or the year disappears from the
 *  tally without saying so. These used to be two hardcoded strings. */

const teams = (redName: string, blueName: string) => [
  { id: "t1", name: redName, color: "RED", logoUrl: null, points: 0, playerCount: 6 },
  { id: "t2", name: blueName, color: "BLUE", logoUrl: null, points: 0, playerCount: 6 },
];

test("a team's side label is its name without the leading 'Team'", () => {
  assert.equal(sideLabel("Team Fox"), "FOX");
  assert.equal(sideLabel("team wolf"), "WOLF");
  assert.equal(sideLabel("Red"), "RED");
  assert.equal(sideLabel("  Team  Blue  "), "BLUE");
});

test("a name that is only 'Team' keeps itself rather than becoming empty", () => {
  assert.equal(sideLabel("Team"), "TEAM");
});

test("an old year's sides match this event's teams by name", () => {
  const labels = sideLabelsFor(teams("Team Fox", "Team Wolf"));
  assert.deepEqual(labels, { RED: "FOX", BLUE: "WOLF" });
  assert.equal(sideKeyFor("FOX", labels), "RED");
  assert.equal(sideKeyFor("wolf", labels), "BLUE");
});

test("a side belonging to neither team counts for neither", () => {
  const labels = sideLabelsFor(teams("Team Fox", "Team Wolf"));
  assert.equal(sideKeyFor("WOLVES", labels), null);
  assert.equal(sideKeyFor("", labels), null);
  assert.equal(sideKeyFor(null, labels), null);
});

test("two teams that reduce to the same label can't tell sides apart", () => {
  // Better to count nothing than to put a year's points on a coin flip.
  assert.equal(sideLabelsFor(teams("Team Red", "Red")), null);
  assert.equal(sideLabelsFor(teams("Team", "Team ")), null);
});

test("an event without both colours has no labels to match against", () => {
  assert.equal(sideLabelsFor([]), null);
  assert.equal(sideLabelsFor(teams("Team Fox", "Team Wolf").slice(0, 1)), null);
});

test("no labels means nothing matches, rather than everything matching", () => {
  assert.equal(sideKeyFor("FOX", null), null);
});

/** A remembered final score, for the years that have one and no matches. */

const year = (winner: string | null, w: number | null = null, l: number | null = null) => ({
  winner,
  winnerPoints: w,
  loserPoints: l,
});

test("a declared score names both sides, like a derived one", () => {
  const labels = sideLabelsFor(teams("Team Fox", "Team Wolf"));
  assert.equal(declaredScore(year("FOX", 10, 7), labels), "FOX 10 \u2013 7 WOLF");
});

test("without a score, it still says who won", () => {
  const labels = sideLabelsFor(teams("Team Fox", "Team Wolf"));
  assert.equal(declaredScore(year("FOX"), labels), "FOX won");
  assert.equal(declaredScore(year("FOX", 10, null), labels), "FOX won");
});

test("a winner this event's teams don't match still reports the score", () => {
  // The loser can't be named -- nothing says who it was -- but the numbers
  // are still real and shouldn't be swallowed.
  const labels = sideLabelsFor(teams("Team Fox", "Team Wolf"));
  assert.equal(declaredScore(year("BADGERS", 12, 5), labels), "BADGERS won 12\u20135");
  assert.equal(declaredScore(year("FOX", 12, 5), null), "FOX won 12\u20135");
});

test("no winner at all is no result, not a half-written one", () => {
  const labels = sideLabelsFor(teams("Team Fox", "Team Wolf"));
  assert.equal(declaredScore(year(null, 10, 7), labels), null);
});
