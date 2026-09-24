/**
 * Turns raw OCR words -- text, a confidence score, a pixel bounding box,
 * nothing more -- into a proposed hole-by-hole grid.
 *
 * This is the part a hosted vision model used to do by just understanding
 * the photo: "this number is in Fox's row, hole 4." A local OCR engine
 * (Tesseract, see ./tesseractRecognize.ts) has no idea what a scorecard
 * is -- it returns a bag of text fragments and where they sit on the page,
 * and reassembling "row = hole, column = player" out of that is on us.
 *
 * The chosen fix, after a hosted vision API was tried and rejected
 * specifically for being this app's first metered, third-party,
 * pay-per-use dependency (see docs/DECISIONS.md #9): a person tells this
 * function how many columns (players) and rows (holes) the photo actually
 * shows -- two numbers, defaulted sensibly -- and it clusters the OCR'd
 * digits into that known grid shape. Known-count clustering is far more
 * reliable than trying to *guess* how many rows or columns exist from
 * noisy pixel data, which is a genuinely hard, unsolved-in-general
 * problem; asking a human for two numbers sidesteps it entirely.
 *
 * Everything here is pure and synchronous -- no Tesseract, no DOM, no
 * network -- specifically so it's worth testing without any of those.
 */

export interface OcrWord {
  text: string;
  confidence: number;
  /** Pixel bounding box in the coordinate space of whatever image was
   *  recognized. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** One cell's proposed reading, before a person has confirmed or
 *  corrected anything. `columnIndex`/`rowIndex` are positions (0-based,
 *  left-to-right / top-to-bottom), not yet resolved to a real player or
 *  hole number -- that's ScorecardImport.tsx's job, same as it always
 *  was, just fed from a different source now. */
export interface LayoutReading {
  columnIndex: number;
  rowIndex: number;
  gross: number | null;
}

export interface LayoutResult {
  readings: LayoutReading[];
  /** Best-guess player name per column, read from whatever text sits
   *  above the score grid in that column's x-range -- null if nothing
   *  plausible was found there. A guess, always overridable; see
   *  matchPlayerName for how a guess becomes a real player. */
  columnHeaderGuesses: (string | null)[];
}

const y0f = (w: OcrWord) => w.y0;

function center(w: OcrWord, axis: "x" | "y"): number {
  return axis === "x" ? (w.x0 + w.x1) / 2 : (w.y0 + w.y1) / 2;
}

/**
 * Splits `values` into exactly `k` groups along one axis, by position --
 * 1-D k-means (Lloyd's algorithm), which is simple, deterministic enough
 * for this, and -- unlike gap-based clustering -- doesn't have to guess
 * how many clusters exist, because the caller already knows (it's the
 * number of holes or players a person just told it). Returns the indices
 * into `values` belonging to each of the `k` clusters, ordered by the
 * cluster's own position along the axis (so cluster 0 is the leftmost
 * column, or the topmost row).
 *
 * With fewer points than `k`, the extra clusters come back empty rather
 * than forcing points into groups that don't exist -- a photo with three
 * words can't populate six columns. This does NOT merge points that
 * happen to sit close together into one cluster just because there
 * aren't enough of them to fill every slot: two genuinely close pixel
 * positions still split into different clusters if `k` allows it. Judging
 * "how close counts as the same column" is a harder, different problem
 * this deliberately doesn't attempt -- see the module comment for why a
 * known `k` from a person is the chosen tradeoff instead.
 */
export function clusterByPosition(values: number[], k: number): number[][] {
  if (k <= 0) return [];
  if (values.length === 0) return Array.from({ length: k }, () => []);

  const sortedIdx = [...values.keys()].sort((a, b) => values[a] - values[b]);
  // Never seed more centroids than there are points -- an empty seed with
  // nothing to ever attract it just sits at its starting position
  // uselessly. This does NOT mean two close-but-distinct pixel positions
  // get merged into one cluster: with real coordinates, two positions are
  // almost never bit-for-bit equal, so a k this size still splits them
  // whenever there are enough points to go around. Merging genuinely
  // close positions into the same conceptual column is a different,
  // harder problem (how close is "the same column"?) that this
  // deliberately does not attempt -- see the module comment on why a
  // known k from a person is the chosen tradeoff instead.
  const effectiveK = Math.max(1, Math.min(k, values.length));

  // Seed centers evenly across the sorted range -- a fixed, deterministic
  // starting point rather than random, so the same input always clusters
  // the same way.
  const min = values[sortedIdx[0]];
  const max = values[sortedIdx[sortedIdx.length - 1]];
  const span = max - min || 1;
  let centers = Array.from({ length: effectiveK }, (_, i) => min + (span * (i + 0.5)) / effectiveK);

  let assignment = new Array(values.length).fill(0);
  for (let iter = 0; iter < 20; iter++) {
    let changed = false;
    for (const i of sortedIdx) {
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const d = Math.abs(values[i] - centers[c]);
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
      if (assignment[i] !== best) changed = true;
      assignment[i] = best;
    }
    if (!changed) break;
    centers = centers.map((c, ci) => {
      const members = sortedIdx.filter((i) => assignment[i] === ci).map((i) => values[i]);
      return members.length ? members.reduce((a, b) => a + b, 0) / members.length : c;
    });
  }

  // Re-derive cluster order from the final centers, then pad with empty
  // clusters up to the k the caller asked for (a photo might genuinely
  // show fewer distinct columns than players if some didn't post a score
  // on this card -- an empty cluster there is correct, not a bug).
  const order = [...centers.keys()].sort((a, b) => centers[a] - centers[b]);
  const rank = new Map(order.map((c, i) => [c, i]));
  const out: number[][] = Array.from({ length: effectiveK }, () => []);
  for (const i of sortedIdx) out[rank.get(assignment[i])!].push(i);
  while (out.length < k) out.push([]);
  return out;
}

/** Score-shaped text: 1 or 2 digits, a plausible gross for one hole. The
 *  same 1-20 range routes/matches.ts's POST /:id/scores itself enforces
 *  (see routes/matches.ts) -- no point proposing a reading the write
 *  endpoint would reject outright. */
function isScoreToken(text: string): boolean {
  const n = Number(text);
  return /^\d{1,2}$/.test(text) && n >= 1 && n <= 20;
}

/** A plausible player-name fragment: letters only, long enough that a
 *  stray OCR artifact ("l", "II") doesn't get treated as a name. */
function isNameToken(text: string): boolean {
  return /^[A-Za-z][A-Za-z'-]{1,}$/.test(text);
}

/**
 * The whole layout step: given every word Tesseract found on the photo,
 * and how many columns/rows a person says are actually on it, proposes a
 * reading for each cell.
 *
 * Rows are clustered from every score-shaped word at once (not per
 * column), so hole 4 lines up the same way across every player's column
 * even if one player's card has messier handwriting than another's --
 * they're all being read off the same physical row.
 */
export function layoutReadings(words: OcrWord[], columnCount: number, rowCount: number): LayoutResult {
  const scoreWords = words.filter((w) => isScoreToken(w.text.trim()));
  const nameWords = words.filter((w) => isNameToken(w.text.trim()));

  if (scoreWords.length === 0 || columnCount <= 0 || rowCount <= 0) {
    return { readings: [], columnHeaderGuesses: new Array(Math.max(columnCount, 0)).fill(null) };
  }

  const columns = clusterByPosition(scoreWords.map((w) => center(w, "x")), columnCount);
  const rows = clusterByPosition(scoreWords.map((w) => center(w, "y")), rowCount);

  const columnOfIndex = new Map<number, number>();
  columns.forEach((idxs, c) => idxs.forEach((i) => columnOfIndex.set(i, c)));
  const rowOfIndex = new Map<number, number>();
  rows.forEach((idxs, r) => idxs.forEach((i) => rowOfIndex.set(i, r)));

  // More than one word can land in the same cell (a smudge read as two
  // tokens, or a genuinely adjacent stray mark) -- the higher-confidence
  // one wins rather than either being silently dropped or both being
  // concatenated into nonsense.
  const best = new Map<string, OcrWord>();
  for (let i = 0; i < scoreWords.length; i++) {
    const c = columnOfIndex.get(i);
    const r = rowOfIndex.get(i);
    if (c === undefined || r === undefined) continue;
    const key = `${c}:${r}`;
    const existing = best.get(key);
    if (!existing || scoreWords[i].confidence > existing.confidence) best.set(key, scoreWords[i]);
  }

  const readings: LayoutReading[] = [];
  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < columnCount; c++) {
      const w = best.get(`${c}:${r}`);
      readings.push({ columnIndex: c, rowIndex: r, gross: w ? Number(w.text.trim()) : null });
    }
  }

  // A header guess for column c: the name-shaped word in that column's
  // x-range, above the topmost score row, closest to the grid -- i.e. the
  // word most likely to be sitting directly over that column rather than
  // floating somewhere else on the photo (a course name, a date).
  const columnXRanges = columns.map((idxs) => {
    const xs = idxs.map((i) => center(scoreWords[i], "x"));
    return xs.length ? [Math.min(...xs), Math.max(...xs)] : null;
  });
  const topRowY = Math.min(...scoreWords.map((w) => y0f(w)));

  const columnHeaderGuesses = columnXRanges.map((range) => {
    if (!range) return null;
    const [lo, hi] = range;
    const pad = (hi - lo || 40) * 0.6; // a header can overhang its column a little
    const candidates = nameWords
      .filter((w) => center(w, "x") >= lo - pad && center(w, "x") <= hi + pad && y0f(w) < topRowY)
      .sort((a, b) => y0f(b) - y0f(a)); // closest to the grid (largest y among headers) first
    return candidates[0]?.text.trim() ?? null;
  });

  return { readings, columnHeaderGuesses };
}

/** Matches whatever text was read as a column header to one of the
 *  match's real players. Exact and case-insensitive first, then a
 *  substring either direction, with a length guard so a two-letter OCR
 *  fragment never silently claims a match -- the review screen is always
 *  where a short or wrong guess gets fixed, not a heuristic reaching
 *  further than the evidence supports. */
export function matchPlayerName(read: string | null, roster: { playerId: string; name: string }[]): string | null {
  if (!read) return null;
  const needle = read.trim().toLowerCase();
  if (!needle) return null;

  const exact = roster.find((p) => p.name.trim().toLowerCase() === needle);
  if (exact) return exact.playerId;

  if (needle.length < 3) return null;

  const contains = roster.find((p) => {
    const name = p.name.trim().toLowerCase();
    return name.includes(needle) || needle.includes(name);
  });
  return contains?.playerId ?? null;
}
