import { useEffect, useState } from "react";
import { api } from "./api.ts";
import type { PlayerRecord, TeamRoster } from "./api.ts";
import "./Teams.css";

/** "2-1" or "2-1-1" -- the halve only shown when there's one, since W-L is
 *  the form everyone already reads without thinking about it. */
function formatRecord(r: PlayerRecord): string {
  return r.h > 0 ? `${r.w}-${r.l}-${r.h}` : `${r.w}-${r.l}`;
}

function TeamCard({ team }: { team: TeamRoster }) {
  const side = team.color === "RED" ? "side-red" : "side-blue";
  return (
    <section className={`team-card ${side}`}>
      <header className="team-card-header">
        {team.logoUrl && <img className="team-card-logo" src={team.logoUrl} alt="" />}
        <h2>{team.name}</h2>
      </header>
      <div className="roster">
        {team.members.map((m, i) => {
          const { weekend, allTime } = m.record;
          const playedWeekend = weekend.w + weekend.l + weekend.h > 0;
          const playedAllTime = allTime.w + allTime.l + allTime.h > 0;
          return (
            <div key={m.playerId} className="roster-row">
              <span className="roster-num">{i + 1}</span>
              <span className="roster-name-col">
                <span className="roster-name">
                  {m.name}
                  {m.isCaptain && <span className="captain-badge">C</span>}
                </span>
                {(playedWeekend || playedAllTime) && (
                  <span className="roster-record">
                    {playedWeekend && `This trip ${formatRecord(weekend)}`}
                    {playedWeekend && playedAllTime && " · "}
                    {playedAllTime && `All-time ${formatRecord(allTime)}`}
                  </span>
                )}
              </span>
              <span className="roster-hcp">hcp {m.handicapIndex}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function Teams() {
  const [teams, setTeams] = useState<TeamRoster[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .currentEvent()
      .then((ev) => api.teams(ev.id))
      .then((r) => setTeams(r.teams))
      .catch((e) => setError(String(e)));
  }, []);

  if (error) {
    return (
      <main className="board">
        <p className="load-error">Couldn't load teams: {error}</p>
      </main>
    );
  }

  if (!teams) {
    return (
      <main className="board">
        <p className="loading">Loading…</p>
      </main>
    );
  }

  return (
    <main className="board">
      <header className="page-header">
        <h1>Teams</h1>
        <p className="page-sub">Rosters and handicaps for the weekend.</p>
      </header>
      <div className="teams-list">
        {teams.map((t) => (
          <TeamCard key={t.id} team={t} />
        ))}
      </div>
    </main>
  );
}
