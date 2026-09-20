import type { ScoredMatch } from "./api.ts";
import { Link } from "./router.tsx";

/** `readOnly` is a past trip being looked at through the Matches trip
 *  picker -- the card still reads the same, it just isn't a way in to the
 *  score-entry screen. Nobody is entering a hole for 2026. */
export default function MatchRow({ match, readOnly }: { match: ScoredMatch; readOnly?: boolean }) {
  const red = match.players.filter((p) => p.side === "RED");
  const blue = match.players.filter((p) => p.side === "BLUE");
  const label = (side: typeof red) => side.map((p) => p.name).join(" & ");

  const notStarted = match.holesPlayed === 0;
  // Which side the standing badge tints toward -- null for a tie (or a
  // match that hasn't started), same "no lean either way" case.
  const leading = notStarted || match.points.red === match.points.blue
    ? null
    : match.points.red > match.points.blue
      ? "red"
      : "blue";

  const className = `match-card ${leading ? `leading-${leading}` : ""}`;
  const body = (
    <>
      <div className={`match-standing-badge ${notStarted ? "not-started" : ""}`}>
        {notStarted ? "Not started" : match.standing}
      </div>
      <div className="match-card-sides">
        <span className="match-card-side side-red">{label(red)}</span>
        <span className="match-vs">vs</span>
        <span className="match-card-side side-blue">{label(blue)}</span>
      </div>
    </>
  );

  if (readOnly) return <div className={className}>{body}</div>;

  return (
    <Link to={`/matches/${match.matchId}`} className={className}>
      {body}
    </Link>
  );
}
