/**
 * Reads a photo of a scorecard -- a screenshot from another scoring app,
 * or a physical card -- and proposes hole-by-hole gross scores for review.
 *
 * There is nothing to integrate with here: the group's other scoring app
 * has no export, no API, no CSV, nothing that leaves it except a photo a
 * human looks at (see docs/DECISIONS.md #9 for the research; which app,
 * and its name, is in docs/TRIP.md -- the finding generalizes to any such
 * app, so only the name is private). That app's own "photo scorecard"
 * feature (snap a paper card, it transcribes into their system) is the
 * proof this works at all; this is the same trick pointed the other way,
 * generic to any scorecard photo rather than tied to one app.
 *
 * This module never writes a hole_score row itself. It returns a proposed
 * batch in exactly the shape routes/matches.ts's POST /:id/scores already
 * accepts, so the actual write is the same code path a manual tap uses --
 * same offline queue, same last-write-wins, same attribution. A misread
 * number is a wrong PROPOSAL that a person corrects on screen before
 * anything is submitted, never a silent write.
 */

/** One cell the model claims to have read. `playerName` is whatever text
 *  was on the card/screenshot -- a nickname, an initial, a full name --
 *  not yet resolved to a real player. `gross` is null when the model
 *  genuinely can't tell, which is a real answer, not a failure: better an
 *  empty box on the review screen than a guessed number nobody asked for. */
export interface OcrReading {
  playerName: string;
  holeNumber: number;
  gross: number | null;
}

export interface OcrResult {
  readings: OcrReading[];
  /** The model's own one-line note on anything it wasn't sure about --
   *  smudged ink, a column it couldn't tell was which player, holes it
   *  couldn't find at all. Shown as-is on the review screen; never acted
   *  on automatically. */
  note: string | null;
}

export interface MatchedReading extends OcrReading {
  /** The match's own player this reading was matched to, or null if
   *  nothing on the roster is a plausible match -- e.g. a name from a
   *  group scorecard that includes someone not in this match. An
   *  unmatched reading still shows on the review screen, just with no
   *  player picked, so nothing silently gets attributed to the wrong
   *  person. */
  playerId: string | null;
}

/** Matches whatever name the model read off a photo to one of this
 *  match's real players. Exact and case-insensitive first ("Fox" ==
 *  "fox" == "FOX"), then a substring either direction ("F" is too
 *  short to match anything on purpose -- see the length guard below --
 *  but "Finn" matches a card that just says "Fin"). The first match
 *  wins; a name that fits two players resolves to whichever is listed
 *  first, which is why this always needs a human looking at the result,
 *  not just for the misreads. */
export function matchPlayerName(
  read: string,
  roster: { playerId: string; name: string }[],
): string | null {
  const needle = read.trim().toLowerCase();
  if (!needle) return null;

  const exact = roster.find((p) => p.name.trim().toLowerCase() === needle);
  if (exact) return exact.playerId;

  // A one- or two-letter read ("F", "Am") is too short to safely match by
  // substring -- "A" would match both "Ames" and any other A-name before
  // this guard even runs, and a two-letter fragment risks the same
  // coincidental-substring problem, which is exactly the kind of silent
  // wrong match this function exists to avoid. Leave it unmatched; the
  // review screen is where a human resolves a two-letter scribble, not a
  // heuristic.
  if (needle.length < 3) return null;

  const contains = roster.find((p) => {
    const name = p.name.trim().toLowerCase();
    return name.includes(needle) || needle.includes(name);
  });
  return contains?.playerId ?? null;
}

/** Applies matchPlayerName to every reading. Pure and synchronous -- the
 *  network call and the JSON-shape validation happen in routes/matches.ts,
 *  which is what actually talks to the model; this is the part worth
 *  testing without one. */
export function matchReadings(
  result: OcrResult,
  roster: { playerId: string; name: string }[],
): MatchedReading[] {
  return result.readings.map((r) => ({ ...r, playerId: matchPlayerName(r.playerName, roster) }));
}
