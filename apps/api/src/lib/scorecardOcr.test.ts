import { test } from "node:test";
import assert from "node:assert/strict";
import { matchPlayerName, matchReadings } from "./scorecardOcr.ts";
import type { OcrResult } from "./scorecardOcr.ts";

const roster = [
  { playerId: "p-fox", name: "Fox" },
  { playerId: "p-gray", name: "Gray" },
  { playerId: "p-hale", name: "Hale" },
  { playerId: "p-ives", name: "Ives" },
];

test("an exact name matches, case-insensitively", () => {
  assert.equal(matchPlayerName("Fox", roster), "p-fox");
  assert.equal(matchPlayerName("hale", roster), "p-hale");
  assert.equal(matchPlayerName("  IVES  ", roster), "p-ives");
});

test("a partial read matches by substring either direction", () => {
  assert.equal(matchPlayerName("Gra", roster), "p-gray");
});

test("a one- or two-letter read is left unmatched, not guessed at", () => {
  assert.equal(matchPlayerName("B", roster), null);
  assert.equal(matchPlayerName("Bi", roster), null);
});

test("a name nobody on the roster has is left unmatched", () => {
  assert.equal(matchPlayerName("Someone Else", roster), null);
});

test("an empty or blank read is left unmatched", () => {
  assert.equal(matchPlayerName("", roster), null);
  assert.equal(matchPlayerName("   ", roster), null);
});

test("matchReadings resolves each reading independently, keeping the rest of the row", () => {
  const result: OcrResult = {
    readings: [
      { playerName: "Fox", holeNumber: 1, gross: 4 },
      { playerName: "Someone Else", holeNumber: 1, gross: 5 },
      { playerName: "Hale", holeNumber: 1, gross: null },
    ],
    note: "Hole 12 was smudged for Hale.",
  };
  const matched = matchReadings(result, roster);
  assert.deepEqual(
    matched.map((m) => [m.playerId, m.holeNumber, m.gross]),
    [
      ["p-fox", 1, 4],
      [null, 1, 5],
      ["p-hale", 1, null],
    ],
  );
});
