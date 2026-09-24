import type { EventSummary, HistoricalMatch, HistoricalYear } from "./api.ts";
import { sideKeyFor, sideLabelsFor } from "./lib/sides.ts";
import { formatPoints } from "./lib/format.ts";
import type { SideLabels } from "./lib/sides.ts";
import "./History.css";

/** The two sides these years were actually played between (see the API's
 *  schema.ts: free text, not the live schema's RED/BLUE). Matching them to
 *  the current event's teams by name (lib/sides.ts) paints an old year in
 *  the same two accent colours the rest of the app uses, so 2026 looks
 *  like this year. A side that matches neither team gets no colour rather
 *  than a wrong one. */
function sideClass(side: string, labels: SideLabels | null): string {
  const key = sideKeyFor(side, labels);
  return key === "RED" ? "side-red" : key === "BLUE" ? "side-blue" : "";
}

/** "Front RED · Back TIE · Overall RED" -- for these years the declared
 *  segment winners *are* the result (there are no hole scores behind them),
 *  so the card shows them rather than a standing it can't derive. */
function segmentLine(m: HistoricalMatch): string {
  return [
    `Front ${m.front9Winner}`,
    `Back ${m.back9Winner}`,
    `Overall ${m.overallWinner}`,
  ].join(" · ");
}

function HistoricalMatchCard({ match, labels }: { match: HistoricalMatch; labels: SideLabels | null }) {
  const [a, b] = match.sides;
  if (!a || !b) return null;
  const leading = a.points === b.points ? null : a.points > b.points ? a : b;
  const leadClass = leading ? sideClass(leading.side, labels).replace("side-", "leading-") : "";

  return (
    <div className={`match-card ${leadClass}`}>
      <div className="match-standing-badge">
        {formatPoints(a.points)}–{formatPoints(b.points)}
      </div>
      <div className="match-card-sides">
        <span className={`match-card-side ${sideClass(a.side, labels)}`}>{a.players.join(" & ")}</span>
        <span className="match-vs">vs</span>
        <span className={`match-card-side ${sideClass(b.side, labels)}`}>{b.players.join(" & ")}</span>
        <span className="hist-segments">{segmentLine(match)}</span>
      </div>
    </div>
  );
}

/**
 * A trip from before the current model. There are no hole scores for
 * these years (the API's schema.ts explains why), so this shows exactly
 * what was actually recorded: the declared match results where they
 * exist, and every player's gross/net per round.
 *
 * It renders inside Matches, behind the trip picker, rather than on a
 * separate History page: a match is a match whatever year it is, so it
 * belongs on the screen that shows matches.
 */
export default function HistoricalTrip({ year, teams }: { year: HistoricalYear; teams: EventSummary["teams"] }) {
  const roundsWithMatches = year.rounds.filter((r) => r.matches.length > 0);
  // How this year's recorded side names line up with the current event's
  // two teams -- the only thing that can give an old side a colour.
  const labels = sideLabelsFor(teams);

  return (
    <>
      {roundsWithMatches.map((r) => (
        <section key={r.roundNumber} className="round-card">
          <header className="round-header">
            <h3>Round {r.roundNumber}</h3>
            <p className="round-sub">{r.courseName}</p>
          </header>
          <div className="round-matches">
            {r.matches.map((m) => (
              <HistoricalMatchCard key={m.matchNumber} match={m} labels={labels} />
            ))}
          </div>
        </section>
      ))}

      {roundsWithMatches.length === 0 && (
        <p className="page-sub">
          No match-by-match record for this trip — the scores below are what was written down at the time.
        </p>
      )}

      <p className="year-scores-title">Round scores</p>
      <div className="year-scores-wrap">
        <table className="year-scores-table">
          <thead>
            <tr>
              <th>Player</th>
              {year.rounds.map((r) => (
                <th key={r.roundNumber}>R{r.roundNumber}</th>
              ))}
              <th>Avg Net</th>
            </tr>
          </thead>
          <tbody>
            {year.players.map((p) => (
              <tr key={p.playerId}>
                <td>{p.name}</td>
                {year.rounds.map((r) => {
                  const rr = p.rounds.find((x) => x.roundNumber === r.roundNumber);
                  return <td key={r.roundNumber}>{rr ? `${rr.gross} (${rr.net})` : "—"}</td>;
                })}
                <td>{p.avgNet.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="all-time-note">Gross, with net in brackets. Courses: {year.rounds.map((r) => r.courseName).join(" · ")}.</p>
    </>
  );
}
