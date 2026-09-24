import { test } from "node:test";
import assert from "node:assert/strict";
import { clusterByPosition, layoutReadings, matchPlayerName } from "./scorecardOcr.ts";
import type { OcrWord } from "./scorecardOcr.ts";

/** Builds a synthetic OCR word at a given center point -- tests work in
 *  centers, not raw bboxes, since that's all clusterByPosition and
 *  layoutReadings actually look at. */
function w(text: string, x: number, y: number, confidence = 90): OcrWord {
  return { text, confidence, x0: x - 5, x1: x + 5, y0: y - 5, y1: y + 5 };
}

test("clusterByPosition groups by proximity into exactly k clusters, left to right", () => {
  const clusters = clusterByPosition([100, 102, 98, 500, 505, 495], 2);
  assert.equal(clusters.length, 2);
  assert.deepEqual(new Set(clusters[0]), new Set([0, 1, 2]));
  assert.deepEqual(new Set(clusters[1]), new Set([3, 4, 5]));
});

test("clusterByPosition orders clusters by position, not input order", () => {
  // The high-value points come first in the array; cluster 0 must still
  // be the low-value (leftmost/topmost) group.
  const clusters = clusterByPosition([900, 910, 10, 20], 2);
  assert.deepEqual(new Set(clusters[0]), new Set([2, 3]));
  assert.deepEqual(new Set(clusters[1]), new Set([0, 1]));
});

test("clusterByPosition pads to k clusters without losing or duplicating a point", () => {
  // Two points, four columns asked for: it cannot invent two more real
  // clusters, so it pads with empty ones rather than fabricating a
  // position nothing was found at. What it must NOT do is merge the two
  // real points into one cluster just because there are more slots than
  // points -- a genuinely close pair of columns still has to read as two
  // columns if that's what was asked for; see the note on
  // clusterByPosition for why "how close counts as one column" isn't
  // this function's problem to solve.
  const clusters = clusterByPosition([100, 105], 4);
  assert.equal(clusters.length, 4);
  const seen = clusters.flat().sort((a, b) => a - b);
  assert.deepEqual(seen, [0, 1]); // both points accounted for, exactly once
  assert.ok(clusters.filter((c) => c.length > 0).length <= 2, "at most one cluster per point");
});

test("clusterByPosition on no points returns k empty clusters", () => {
  assert.deepEqual(clusterByPosition([], 3), [[], [], []]);
});

test("clusterByPosition on k=0 returns nothing", () => {
  assert.deepEqual(clusterByPosition([1, 2, 3], 0), []);
});

test("layoutReadings assembles a clean 2-player, 3-hole grid", () => {
  // Two columns (x~100, x~400), three rows (y~50, y~150, y~250).
  const words: OcrWord[] = [
    w("4", 100, 50),
    w("5", 400, 50),
    w("3", 100, 150),
    w("6", 400, 150),
    w("4", 100, 250),
    w("4", 400, 250),
  ];
  const { readings } = layoutReadings(words, 2, 3);
  const at = (col: number, row: number) => readings.find((r) => r.columnIndex === col && r.rowIndex === row)?.gross;
  assert.equal(at(0, 0), 4);
  assert.equal(at(1, 0), 5);
  assert.equal(at(0, 1), 3);
  assert.equal(at(1, 1), 6);
  assert.equal(at(0, 2), 4);
  assert.equal(at(1, 2), 4);
});

test("a hole with no readable score for a player is null, not guessed", () => {
  const words: OcrWord[] = [w("4", 100, 50), w("5", 400, 50)]; // only one row's worth
  const { readings } = layoutReadings(words, 2, 3);
  const at = (col: number, row: number) => readings.find((r) => r.columnIndex === col && r.rowIndex === row)?.gross;
  assert.equal(at(0, 0), 4);
  assert.equal(at(0, 1), null);
  assert.equal(at(0, 2), null);
});

test("text that isn't a plausible score is ignored entirely", () => {
  const words: OcrWord[] = [w("4", 100, 50), w("Par4", 100, 10), w("99999", 100, 300)];
  const { readings } = layoutReadings(words, 1, 1);
  assert.equal(readings.length, 1);
  assert.equal(readings[0].gross, 4);
});

test("a stray second reading in the same cell keeps the more confident one", () => {
  const words: OcrWord[] = [w("4", 100, 50, 40), w("9", 102, 51, 95)];
  const { readings } = layoutReadings(words, 1, 1);
  assert.equal(readings[0].gross, 9);
});

test("a column header is guessed from name-shaped text above the grid", () => {
  const words: OcrWord[] = [
    w("Fox", 100, 10),
    w("Wolf", 400, 10),
    w("4", 100, 50),
    w("5", 400, 50),
    w("3", 100, 150),
    w("6", 400, 150),
  ];
  const { columnHeaderGuesses } = layoutReadings(words, 2, 2);
  assert.deepEqual(columnHeaderGuesses, ["Fox", "Wolf"]);
});

test("no plausible header text leaves the guess null, not a wrong pick", () => {
  const words: OcrWord[] = [w("4", 100, 50), w("5", 400, 50)];
  const { columnHeaderGuesses } = layoutReadings(words, 2, 1);
  assert.deepEqual(columnHeaderGuesses, [null, null]);
});

test("no score-shaped words at all is an empty, not a crashing, result", () => {
  const { readings, columnHeaderGuesses } = layoutReadings([w("Par 4", 100, 10)], 2, 3);
  assert.deepEqual(readings, []);
  assert.deepEqual(columnHeaderGuesses, [null, null]);
});

const roster = [
  { playerId: "p-fox", name: "Fox" },
  { playerId: "p-wolf", name: "Wolf" },
  { playerId: "p-hale", name: "Hale" },
];

test("an exact header match resolves case-insensitively", () => {
  assert.equal(matchPlayerName("fox", roster), "p-fox");
  assert.equal(matchPlayerName("WOLF", roster), "p-wolf");
});

test("a partial read matches by substring, but not below three letters", () => {
  assert.equal(matchPlayerName("Hal", roster), "p-hale");
  assert.equal(matchPlayerName("Ha", roster), null);
});

test("no header guess, or no matching player, resolves to null", () => {
  assert.equal(matchPlayerName(null, roster), null);
  assert.equal(matchPlayerName("Someone Else", roster), null);
});
