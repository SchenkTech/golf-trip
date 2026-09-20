import type { ScoringFormat, TeamFormat } from "@gc/scoring";
import type { AppDb } from "../db/client.ts";
import { scoreMatchRows, strokeIndexesFor, segmentPointsFor, PERSONAL_CARD_FORMATS } from "./score.ts";
import { segmentValue } from "./segments.ts";
import { loadPlayerLabels } from "./players.ts";
import { loadPlayerRecords } from "./records.ts";

/**
 * Everyone's all-time numbers, across every year the app knows about:
 * individual records, points earned per match type and in total, and career
 * averages for gross and net.
 *
 * Three different kinds of source data have to agree here, and none of them
 * are stored totals:
 *
 *   live events        hole scores -> @gc/scoring -> match points, the same
 *                      derivation the Board runs (docs/SCORING.md)
 *   seeded old years   declared front9/back9/overall winners -> segment
 *                      points (lib/segments.ts), the coarsest thing that's
 *                      still a real result
 *   old round scores   gross/net totals the group recorded by hand
 *
 * A year contributes whatever it actually has. 2024 has round scores and no
 * matches, so it moves the gross/net averages and not the points; 2027's
 * live matches move both. Nothing is invented to fill a gap -- a missing
 * number stays missing, which is why avgGross/avgNet are nullable rather
 * than 0.
 */

const TEAM_FORMAT_LABEL: Record<string, string> = {
  SINGLES: "Singles",
  FOURBALL: "Fourball",
  FOURSOMES: "Foursomes",
  SCRAMBLE: "Scramble",
  ALT_SHOT: "Alternate Shot",
};

/** Where a round's format isn't recorded at all -- the old years, until the
 *  group tells us what was played each day (schema.ts's
 *  historicalRound.format). Its own bucket rather than folded into a real
 *  format, so the table never claims someone won points at a format nobody
 *  can confirm they played. */
const UNKNOWN_FORMAT = "Other";

export interface AllTimePlayer {
  playerId: string;
  name: string;
  /** Wins/losses/halves, one per decided match -- lib/records.ts. */
  record: { w: number; l: number; h: number };
  /** Every point they've been part of winning, all years, all formats. */
  points: number;
  /** The same points split by what was being played, keyed by the labels in
   *  `formats` below. A format they've never played is simply absent. */
  pointsByFormat: Record<string, number>;
  /** Rounds with a complete personal card behind them (see
   *  PERSONAL_CARD_FORMATS) -- what the two averages are averages of. */
  rounds: number;
  avgGross: number | null;
  avgNet: number | null;
}

export interface AllTimeStats {
  /** Format labels that anyone has actually scored points at, in play order
   *  -- the columns of History's all-time points table. */
  formats: string[];
  players: AllTimePlayer[];
}

interface Tally {
  points: number;
  byFormat: Map<string, number>;
  grossTotal: number;
  netTotal: number;
  rounds: number;
}

function tallyFor(map: Map<string, Tally>, playerId: string): Tally {
  const existing = map.get(playerId);
  if (existing) return existing;
  const fresh: Tally = { points: 0, byFormat: new Map(), grossTotal: 0, netTotal: 0, rounds: 0 };
  map.set(playerId, fresh);
  return fresh;
}

function addPoints(t: Tally, format: string, points: number) {
  t.points += points;
  t.byFormat.set(format, (t.byFormat.get(format) ?? 0) + points);
}

export async function loadAllTimeStats(db: AppDb): Promise<AllTimeStats> {
  const tallies = new Map<string, Tally>();
  const formatOrder: string[] = [];
  const noteFormat = (label: string) => {
    if (!formatOrder.includes(label)) formatOrder.push(label);
  };

  // ---- live events: derived from hole scores, exactly like the Board
  const roundRows = await db.query.round.findMany({
    with: { matches: { with: { players: true, scores: true } }, teeSet: { with: { holes: true } } },
  });
  roundRows.sort((a, b) => a.date.localeCompare(b.date));

  for (const round of roundRows) {
    const teamFormat = round.teamFormat as TeamFormat;
    const label = TEAM_FORMAT_LABEL[teamFormat] ?? teamFormat;
    const strokeIndexes = strokeIndexesFor(round.teeSet.holes);
    const segmentPoints = segmentPointsFor(round.segmentPoints);

    for (const m of round.matches) {
      const scored = scoreMatchRows(
        m,
        teamFormat,
        round.scoringFormat as ScoringFormat,
        strokeIndexes,
        round.pointsPerMatch,
        segmentPoints,
      );
      if (scored.holesPlayed > 0) noteFormat(label);
      for (const p of scored.players) {
        const t = tallyFor(tallies, p.playerId);
        const won = p.side === "RED" ? scored.points.red : scored.points.blue;
        if (scored.holesPlayed > 0) addPoints(t, label, won);
      }

      // Only a format where the player has their own ball (see
      // PERSONAL_CARD_FORMATS) says anything about how *they* shot. Seeded
      // historical round scores are exempt: those are real recorded
      // personal totals, whatever was played that day.
      //
      // A personal round only counts once all eighteen are in -- a match
      // abandoned on the twelfth is not a 12-hole score, it's an
      // incomplete one, and averaging it against full rounds would make
      // the good players look better the earlier they quit.
      if (!PERSONAL_CARD_FORMATS.has(teamFormat)) continue;
      const byPlayer = new Map<string, number[]>();
      for (const s of m.scores) {
        if (s.gross === null) continue;
        byPlayer.set(s.playerId, [...(byPlayer.get(s.playerId) ?? []), s.gross]);
      }
      for (const mp of m.players) {
        const holes = byPlayer.get(mp.playerId);
        if (!holes || holes.length !== 18) continue;
        const gross = holes.reduce((n, g) => n + g, 0);
        const t = tallyFor(tallies, mp.playerId);
        t.grossTotal += gross;
        t.netTotal += gross - mp.strokesReceived;
        t.rounds++;
      }
    }
  }

  // ---- seeded old years: declared segment winners, and recorded round scores
  const [hRounds, hMatches, hMatchPlayers, hScores] = await Promise.all([
    db.query.historicalRound.findMany(),
    db.query.historicalMatch.findMany(),
    db.query.historicalMatchPlayer.findMany(),
    db.query.historicalScore.findMany(),
  ]);

  const sortedHRounds = [...hRounds].sort((a, b) => a.year - b.year || a.roundNumber - b.roundNumber);
  for (const round of sortedHRounds) {
    const label = round.format?.trim() || UNKNOWN_FORMAT;
    const scale = (round.pointsPerMatch ?? 3) / 3;
    const matches = hMatches.filter((m) => m.year === round.year && m.roundNumber === round.roundNumber);
    for (const hm of matches) {
      const roster = hMatchPlayers.filter(
        (p) => p.year === hm.year && p.roundNumber === hm.roundNumber && p.matchNumber === hm.matchNumber,
      );
      if (roster.length === 0) continue;
      noteFormat(label);
      for (const p of roster) {
        const points =
          segmentValue(hm.front9Winner, p.side, scale) +
          segmentValue(hm.back9Winner, p.side, scale) +
          segmentValue(hm.overallWinner, p.side, scale);
        addPoints(tallyFor(tallies, p.playerId), label, points);
      }
    }
  }

  for (const s of hScores) {
    const t = tallyFor(tallies, s.playerId);
    t.grossTotal += s.gross;
    t.netTotal += s.net;
    t.rounds++;
  }

  // ---- assemble
  const [labels, records] = await Promise.all([
    loadPlayerLabels(db),
    loadPlayerRecords(db, { includeHistorical: true }),
  ]);
  const zero = { w: 0, l: 0, h: 0 };

  const players: AllTimePlayer[] = [...tallies.entries()]
    .map(([playerId, t]) => ({
      playerId,
      name: labels.get(playerId) ?? playerId,
      record: records.get(playerId) ?? zero,
      points: t.points,
      pointsByFormat: Object.fromEntries(t.byFormat),
      rounds: t.rounds,
      avgGross: t.rounds > 0 ? t.grossTotal / t.rounds : null,
      avgNet: t.rounds > 0 ? t.netTotal / t.rounds : null,
    }))
    // Most points first: this is a scoreboard, and the point of it is who's
    // won the most over the years. Name breaks a tie so the order is stable
    // between requests.
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

  // "Other" last regardless of when it was first seen -- it's a
  // catch-all, not a format, and it reads as one at the end of the row.
  const formats = formatOrder.filter((f) => f !== UNKNOWN_FORMAT);
  if (formatOrder.includes(UNKNOWN_FORMAT)) formats.push(UNKNOWN_FORMAT);

  return { formats, players };
}
