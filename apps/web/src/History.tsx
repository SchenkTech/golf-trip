import { useEffect, useState } from "react";
import { api } from "./api.ts";
import type { AllTimeStats, EventListItem, EventRound, EventSummary, HistoricalYear } from "./api.ts";
import { Link } from "./router.tsx";
import { formatDate, formatPoints, tripName } from "./lib/format.ts";
import { declaredScore, sideKeyFor, sideLabelsFor, sideNamesFor } from "./lib/sides.ts";
import type { SideKey, SideLabels } from "./lib/sides.ts";
import "./History.css";

interface YearDetail {
  event: EventSummary;
  rounds: EventRound[];
}

type MergedYear =
  | { kind: "event"; year: number; data: YearDetail }
  | { kind: "historical"; year: number; data: HistoricalYear };

/** Every side label seen across a historical year's matches, each with its
 *  total points -- there's no `team` row backing these years (see
 *  schema.ts), so the side names come straight from the source data
 *  rather than a real team's name/color. Shared by the card and the
 *  all-time summary so the two can't disagree. */
function historicalTotals(year: HistoricalYear): Map<string, number> {
  const totals = new Map<string, number>();
  for (const r of year.rounds) {
    for (const m of r.matches) {
      for (const s of m.sides) totals.set(s.side, (totals.get(s.side) ?? 0) + s.points);
    }
  }
  return totals;
}

/** One line per trip -- what a year's own card would show as its header
 *  score/status, reused so "All Time" and a single year's card can never
 *  say different things about the same year.
 *
 *  `names` (sideNamesFor's real team names) is what makes an old year's
 *  line print "Team Fox 10 – 7 Team Wolf" instead of "FOX 10 – 7 WOLF" --
 *  without it, both branches below fall back to whatever the source data
 *  actually said, same as before this existed. An event year already uses
 *  its own teams' real names directly, so it needs neither `labels` nor
 *  `names` to already read this way. */
function yearSummary(
  m: MergedYear,
  labels: SideLabels | null = null,
  names: SideLabels | null = null,
): { result: string | null; status: string } {
  if (m.kind === "event") {
    const { event, rounds } = m.data;
    const anyPlayed = rounds.some((r) => r.matches.some((match) => match.holesPlayed > 0));
    const allDecided = rounds.every((r) => r.matches.every((match) => match.decided || match.holesPlayed === 0));
    const [red, blue] = [event.teams.find((t) => t.color === "RED"), event.teams.find((t) => t.color === "BLUE")];
    return {
      result: red && blue ? `${red.name} ${red.points} – ${blue.points} ${blue.name}` : null,
      status: !anyPlayed ? "Not yet played" : allDecided ? "Final" : "In progress",
    };
  }

  const hasMatches = m.data.rounds.some((r) => r.matches.length > 0);
  if (!hasMatches) {
    const declared = declaredScore(m.data, labels, names);
    if (declared) {
      // A remembered score is a final score; only the match-by-match
      // detail is missing, and the year's own card says so.
      const known = m.data.winnerPoints !== null;
      return { result: declared, status: known ? "Final" : "Final score not yet recorded" };
    }
    return { result: null, status: "Round scores only" };
  }
  const totals = historicalTotals(m.data);
  // Resolve each recorded side to this event's real RED/BLUE teams where
  // possible, printed in the same red-then-blue order an event year uses --
  // falls back to the raw recorded labels, alphabetised, only when that
  // resolution isn't available (no `labels`/`names`, or a side that matches
  // neither team).
  const redTotal = labels && names ? totals.get(labels.RED) : undefined;
  const blueTotal = labels && names ? totals.get(labels.BLUE) : undefined;
  if (labels && names && redTotal !== undefined && blueTotal !== undefined) {
    return {
      result: `${names.RED} ${formatPoints(redTotal)} – ${formatPoints(blueTotal)} ${names.BLUE}`,
      status: "Final",
    };
  }
  const sideNames = [...totals.keys()].sort();
  const result =
    sideNames.length === 2
      ? `${sideNames[0]} ${formatPoints(totals.get(sideNames[0]) ?? 0)} – ${formatPoints(totals.get(sideNames[1]) ?? 0)} ${sideNames[1]}`
      : null;
  return { result, status: "Final" };
}

/** Which side won a merged year outright, or null if it isn't decided yet
 *  (a trip still in progress), has no result to count (a historical year
 *  with no seeded match record), or was played between sides this event's
 *  two teams don't match -- undecided and uncountable years just don't
 *  move the tally, they're not a loss for either side.
 *
 *  `labels` is how an old year's free-text sides map onto this event's
 *  RED/BLUE teams; see lib/sides.ts. Without it, only event years can be
 *  counted. */
function decidedSide(m: MergedYear, labels: SideLabels | null): SideKey | null {
  if (m.kind === "event") {
    const { event, rounds } = m.data;
    const anyPlayed = rounds.some((r) => r.matches.some((match) => match.holesPlayed > 0));
    const allDecided = rounds.every((r) => r.matches.every((match) => match.decided || match.holesPlayed === 0));
    if (!anyPlayed || !allDecided) return null;
    const red = event.teams.find((t) => t.color === "RED");
    const blue = event.teams.find((t) => t.color === "BLUE");
    if (!red || !blue || red.points === blue.points) return null;
    return red.points > blue.points ? "RED" : "BLUE";
  }

  const totals = historicalTotals(m.data);
  const red = labels ? totals.get(labels.RED) : undefined;
  const blue = labels ? totals.get(labels.BLUE) : undefined;
  if (red !== undefined && blue !== undefined && red !== blue) return red > blue ? "RED" : "BLUE";

  // No match detail at all -- fall back to the bare declared winner, if
  // the group told us one (schema.ts's historicalYear.winner).
  return sideKeyFor(m.data.winner, labels);
}

/** Every point either side has ever scored, across every year that has a
 *  real number to add -- an event year always does (even mid-trip, an
 *  already-scored point stays scored); a historical year only does once
 *  it's been upgraded to real historicalMatch rows (see schema.ts's note
 *  on historicalYear). A bare declared winner has no point total to add,
 *  so it's skipped here rather than guessed at. */
function cumulativePoints(years: MergedYear[], labels: SideLabels | null): Record<SideKey, number> {
  const totals: Record<SideKey, number> = { RED: 0, BLUE: 0 };
  for (const m of years) {
    if (m.kind === "event") {
      const red = m.data.event.teams.find((t) => t.color === "RED");
      const blue = m.data.event.teams.find((t) => t.color === "BLUE");
      if (red) totals.RED += red.points;
      if (blue) totals.BLUE += blue.points;
    } else {
      if (!labels) continue;
      const hasMatches = m.data.rounds.some((r) => r.matches.length > 0);
      if (hasMatches) {
        const t = historicalTotals(m.data);
        totals.RED += t.get(labels.RED) ?? 0;
        totals.BLUE += t.get(labels.BLUE) ?? 0;
        continue;
      }
      // No matches to add up, but the group may remember the final score.
      // That's a real total someone recorded, so it counts -- what it
      // can't do is say who won which match.
      const key = sideKeyFor(m.data.winner, labels);
      if (!key || m.data.winnerPoints === null || m.data.loserPoints === null) continue;
      totals[key] += m.data.winnerPoints;
      totals[key === "RED" ? "BLUE" : "RED"] += m.data.loserPoints;
    }
  }
  return totals;
}

/** Same navy hero band and score blocks the Board uses (App.css's
 *  .score-blocks -- see App.tsx's Board), so a big team score reads the
 *  same shape whether it's this weekend's points or the all-time tally.
 *  Names and logos come from the current event's real team rows, since
 *  historical years have no `team` row of their own to draw from, and
 *  those same names are what an old year's recorded sides are matched
 *  against (lib/sides.ts). */
function AllTimeHero({ years, teams }: { years: MergedYear[]; teams: EventSummary["teams"] }) {
  const redTeam = teams.find((t) => t.color === "RED");
  const blueTeam = teams.find((t) => t.color === "BLUE");
  const labels = sideLabelsFor(teams);
  const wins: Record<SideKey, number> = { RED: 0, BLUE: 0 };
  let decidedCount = 0;
  for (const m of years) {
    const side = decidedSide(m, labels);
    if (side) {
      wins[side]++;
      decidedCount++;
    }
  }
  const points = cumulativePoints(years, labels);

  return (
    <div className="hero">
      <header className="event-header">
        <div>
          <h1>All-Time</h1>
          <p className="event-dates">
            {redTeam?.name ?? "Red"} vs {blueTeam?.name ?? "Blue"}
          </p>
        </div>
      </header>
      <section className="score-blocks">
        <div className="score-block side-red">
          <div className="score-block-team">
            {redTeam?.logoUrl && <img className="score-block-logo" src={redTeam.logoUrl} alt="" />}
            <span className="score-block-name">{redTeam?.name ?? "Red"}</span>
          </div>
          <span className="score-block-points">{wins.RED}</span>
        </div>
        <div className="score-block side-blue">
          <div className="score-block-team">
            {blueTeam?.logoUrl && <img className="score-block-logo" src={blueTeam.logoUrl} alt="" />}
            <span className="score-block-name">{blueTeam?.name ?? "Blue"}</span>
          </div>
          <span className="score-block-points">{wins.BLUE}</span>
        </div>
      </section>
      <p className="points-available">
        {decidedCount} decided trip{decidedCount === 1 ? "" : "s"} · {formatPoints(points.RED)}–{formatPoints(points.BLUE)}{" "}
        points all-time
      </p>
    </div>
  );
}

/** Every trip, one line each, with the year itself a way through to that
 *  trip's matches -- the match-by-match detail lives on Matches behind its
 *  trip picker now (see Matches.tsx), so this is the list that sends you
 *  there rather than a second place telling the same story. */
function AllTimeSummary({
  years,
  currentYear,
  labels,
  names,
}: {
  years: MergedYear[];
  currentYear: number | null;
  labels: SideLabels | null;
  names: SideLabels | null;
}) {
  return (
    <div className="year-scores-wrap">
      <table className="year-scores-table">
        <thead>
          <tr>
            <th>Year</th>
            <th>Result</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {years.map((m) => {
            const { result, status } = yearSummary(m, labels, names);
            return (
              <tr key={m.year}>
                <td>
                  <Link className="year-link" to={m.year === currentYear ? "/matches" : `/trips/${m.year}`}>
                    {m.year}
                  </Link>
                </td>
                <td>{result ?? "—"}</td>
                <td>{status}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Everyone's all-time line, in two tables rather than one very wide one:
 *  what you've won (record, points, and which formats they came at), then
 *  what you've shot (gross and net averages). They answer different
 *  questions, so they don't belong in the same row of numbers.
 *
 *  Every figure here is derived on the request from real recorded play
 *  (see the API's lib/stats.ts): a year contributes whatever it actually
 *  has, and a player with nothing on record for a column reads "—" rather
 *  than 0. */
/** One format's all-time record: what each player won and lost, and the
 *  share of what was on the table that they took. Shaped after the trip's
 *  own records sheet, which keeps a table per format rather than one wide
 *  one -- and for the same reason, that best ball and match play are
 *  different games and a combined row flatters whoever plays more of the
 *  one they're good at.
 *
 *  Won and lost are POINTS, not matches: a Nassau match is three separate
 *  bets, so a player can lose a match and still take a point off it. */
function FormatRecord({ format, players }: { format: string; players: AllTimeStats["players"] }) {
  const rows = players
    .map((p) => {
      const won = p.pointsByFormat[format] ?? 0;
      const lost = p.pointsLostByFormat[format] ?? 0;
      return { name: p.playerId, label: p.name, won, lost, played: won + lost };
    })
    // Somebody who has never played this format has no record in it --
    // showing them as 0-0 would put them level with a player who has.
    .filter((r) => r.played > 0)
    .sort((a, b) => b.won / b.played - a.won / a.played || b.won - a.won);

  if (rows.length === 0) return null;

  return (
    <section className="format-record">
      <h3>{format}</h3>
      <div className="year-scores-wrap">
        <table className="year-scores-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Win</th>
              <th>Lose</th>
              <th>Win %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td>{r.label}</td>
                <td>{Number(r.won.toFixed(2))}</td>
                <td>{Number(r.lost.toFixed(2))}</td>
                <td>{((r.won / r.played) * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AllTimePlayers({ stats }: { stats: AllTimeStats }) {
  if (stats.players.length === 0) {
    return <p className="year-status">No all-time numbers yet — they start with the first hole entered.</p>;
  }

  // Averages are a different question from points, so they get their own
  // order: lowest net first, the way the group reads a leaderboard.
  const byNet = stats.players
    .filter((p) => p.rounds > 0)
    .sort((a, b) => (a.avgNet ?? Infinity) - (b.avgNet ?? Infinity));

  return (
    <>
      {stats.formats.map((format) => (
        <FormatRecord key={format} format={format} players={stats.players} />
      ))}

      <p className="year-scores-title">All-time scoring averages</p>
      <div className="year-scores-wrap">
        <table className="year-scores-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Rounds</th>
              <th>Avg Gross</th>
              <th>Avg Net</th>
            </tr>
          </thead>
          <tbody>
            {byNet.map((p) => (
              <tr key={p.playerId}>
                <td>{p.name}</td>
                <td>{p.rounds}</td>
                <td>{p.avgGross === null ? "—" : p.avgGross.toFixed(1)}</td>
                <td>{p.avgNet === null ? "—" : p.avgNet.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="all-time-note">
        Won and lost are points, not matches — a Nassau match is three bets (front nine, back nine, overall), so a
        match can be lost and still be worth something. Averages count rounds with a full eighteen on record for that
        player; scrambles and alternate shot have one ball per side, so there is no personal card to average.
      </p>
    </>
  );
}

/** Every not-yet-played trip in one glance, once there's more than one to
 *  glance at -- a historical year is never "Not yet played" (see
 *  yearSummary), so this only ever holds real event-kind years. Dates and
 *  courses come straight off the schedule someone set up in Admin; there's
 *  no score or standing to show for a trip that hasn't teed off. */
function FutureSummary({ years }: { years: YearDetail[] }) {
  return (
    <div className="year-scores-wrap">
      <table className="year-scores-table">
        <thead>
          <tr>
            <th>Year</th>
            <th>Dates</th>
            <th>Courses</th>
          </tr>
        </thead>
        <tbody>
          {years.map((y) => (
            <tr key={y.event.year}>
              <td>{y.event.year}</td>
              <td>
                {formatDate(y.event.startDate)} – {formatDate(y.event.endDate)}
              </td>
              <td>{[...new Set(y.rounds.map((r) => r.courseName))].join(" · ") || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function History() {
  const [list, setList] = useState<EventListItem[] | null>(null);
  const [years, setYears] = useState<YearDetail[]>([]);
  const [historical, setHistorical] = useState<HistoricalYear[]>([]);
  const [allTime, setAllTime] = useState<AllTimeStats | null>(null);
  const [currentEvent, setCurrentEvent] = useState<EventSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .events()
      .then(async (r) => {
        setList(r.events);
        const details = await Promise.all(
          r.events.map(async (e) => ({
            event: await api.event(e.id),
            rounds: (await api.rounds(e.id)).rounds,
          })),
        );
        setYears(details);
      })
      .catch((e) => setError(String(e)));

    api
      .history()
      .then((r) => setHistorical(r.years))
      .catch((e) => setError(String(e)));

    api
      .allTime()
      .then(setAllTime)
      .catch((e) => setError(String(e)));

    // Only so a year row can link to "/matches" rather than "/trips/2027"
    // for the trip that's on now -- the two are the same screen, but the
    // current one shouldn't look like an archive link.
    api
      .currentEvent()
      .then(setCurrentEvent)
      .catch(() => setCurrentEvent(null));
  }, []);

  if (error) {
    return (
      <main className="board">
        <p className="load-error">Couldn't load history: {error}</p>
      </main>
    );
  }

  if (!list) {
    return (
      <main className="board">
        <p className="loading">Loading…</p>
      </main>
    );
  }

  const merged: MergedYear[] = [
    ...years.map((y) => ({ kind: "event" as const, year: y.event.year, data: y })),
    ...historical.map((y) => ({ kind: "historical" as const, year: y.year, data: y })),
  ].sort((a, b) => b.year - a.year);

  // A historical year is always "played" (it's real recorded rounds by
  // definition), but an event year (2027 onward) might be entirely
  // upcoming -- "Not yet played" is the one status that means that.
  const currentYear = currentEvent?.year ?? null;
  const playedTrips = merged.filter((m) => yearSummary(m).status !== "Not yet played").length;

  // Only event-kind years can be unplayed (see above), so this is always a
  // plain YearDetail list.
  const futureYears = years.filter((y) => merged.find((m) => m.year === y.event.year && yearSummary(m).status === "Not yet played"));

  // Logos/names for the all-time hero come from any real event's team
  // rows -- historical years have none of their own (see schema.ts).
  const teams = years[0]?.event.teams ?? [];

  return (
    <main className="board">
      <header className="page-header">
        {/* The trip's name is the headline; "History" is the label on it.
            Matches the shape the group's own build settled on. */}
        <p className="page-eyebrow">History</p>
        <h1>{currentEvent ? tripName(currentEvent.name) : "History"}</h1>
        <p className="page-sub">
          {playedTrips > 1
            ? `${playedTrips} trips played. Tap a year to see that trip's matches.`
            : playedTrips === 1
              ? "1 trip played so far."
              : "No trip has been played yet — the all-time record starts here."}
        </p>
      </header>

      {teams.length === 2 && <AllTimeHero years={merged} teams={teams} />}

      <div className="years-list">
        <p className="year-scores-title">Every trip</p>
        <AllTimeSummary years={merged} currentYear={currentYear} labels={sideLabelsFor(teams)} names={sideNamesFor(teams)} />
        {allTime && <AllTimePlayers stats={allTime} />}
        {futureYears.length > 0 && (
          <>
            <p className="year-scores-title">Still to come</p>
            <FutureSummary years={futureYears} />
          </>
        )}
      </div>
    </main>
  );
}
