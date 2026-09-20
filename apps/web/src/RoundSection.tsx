import type { EventRound } from "./api.ts";
import MatchRow from "./MatchRow.tsx";
import { formatWeekday, formatLongDate } from "./lib/format.ts";

const TEAM_FORMAT_LABEL: Record<string, string> = {
  SINGLES: "Singles",
  FOURBALL: "Fourball",
  FOURSOMES: "Foursomes",
  SCRAMBLE: "Scramble",
  ALT_SHOT: "Alternate Shot",
};

const SCORING_FORMAT_LABEL: Record<string, string> = {
  MATCH_PLAY: "Match Play",
  NASSAU: "Nassau",
  HI_LO: "Hi-Lo",
  STROKE: "Stroke Play",
};

/** One day's card: a big weekday headline (the same shape the Matches and
 *  Rules pages use) with date, course and format as a
 *  subline, then that day's matches. Shared by the Board and Matches
 *  screens so the two never drift apart on what a round looks like.
 *  `readOnly` passes straight through to the match cards -- a past trip
 *  seen through the Matches trip picker is a record, not an entry screen. */
export default function RoundSection({ round, readOnly }: { round: EventRound; readOnly?: boolean }) {
  return (
    <section className="round-card">
      <header className="round-header">
        <h3>{formatWeekday(round.date)}</h3>
        <p className="round-sub">
          {formatLongDate(round.date)}
          {round.teeTime ? ` · first tee ${round.teeTime}` : ""} · {round.courseName} ·{" "}
          {TEAM_FORMAT_LABEL[round.teamFormat] ?? round.teamFormat} ·{" "}
          {SCORING_FORMAT_LABEL[round.scoringFormat] ?? round.scoringFormat}
        </p>
      </header>
      <div className="round-matches">
        {round.matches.map((m) => (
          <MatchRow key={m.matchId} match={m} readOnly={readOnly} />
        ))}
      </div>
    </section>
  );
}
