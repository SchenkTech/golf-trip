import { useEffect, useState } from "react";
import { api } from "./api.ts";
import type { PlayerRecord, TeamRoster } from "./api.ts";
import { getDeviceIdentity, setDeviceIdentity } from "./lib/identity.ts";
import { downscaleImage } from "./lib/image.ts";
import "./Teams.css";

/** "2-1" or "2-1-1" -- the halve only shown when there's one, since W-L is
 *  the form everyone already reads without thinking about it. */
function formatRecord(r: PlayerRecord): string {
  return r.h > 0 ? `${r.w}-${r.l}-${r.h}` : `${r.w}-${r.l}`;
}

const AVATAR_MAX_EDGE = 640;

/** A player's round photo, or their initial on a plain background until
 *  someone sets one. Only the row matching this device's own picked
 *  identity (lib/identity.ts) gets the upload affordance -- same trust
 *  model as everything else that identity powers (docs/DECISIONS.md #4/
 *  #6): a UI convention, not something the server actually checks (see
 *  routes/players.ts's own note on why). Admin can set anyone's from the
 *  Admin screen regardless. */
function Avatar({
  name,
  photoUrl,
  editable,
  uploading,
  onUpload,
}: {
  name: string;
  photoUrl: string | null;
  editable: boolean;
  uploading: boolean;
  onUpload: (file: File) => void;
}) {
  const content = photoUrl ? (
    <img className="roster-avatar-img" src={photoUrl} alt="" />
  ) : (
    <span className="roster-avatar-initial">{name.trim().charAt(0).toUpperCase()}</span>
  );

  if (!editable) {
    return <span className="roster-avatar">{content}</span>;
  }

  return (
    <label className="roster-avatar roster-avatar-editable" title="Add your photo">
      {content}
      <span className="roster-avatar-edit-badge">{uploading ? "…" : "+"}</span>
      <input
        type="file"
        accept="image/*"
        disabled={uploading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = "";
        }}
      />
    </label>
  );
}

function TeamCard({
  team,
  me,
  uploadingId,
  onUpload,
}: {
  team: TeamRoster;
  me: string | null;
  uploadingId: string | null;
  onUpload: (playerId: string, file: File) => void;
}) {
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
              <Avatar
                name={m.name}
                photoUrl={m.photoUrl}
                editable={m.playerId === me}
                uploading={uploadingId === m.playerId}
                onUpload={(file) => onUpload(m.playerId, file)}
              />
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
  const [me, setMe] = useState<string | null>(getDeviceIdentity());
  const [pickingMe, setPickingMe] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const load = () =>
    api
      .currentEvent()
      .then((ev) => api.teams(ev.id))
      .then((r) => setTeams(r.teams))
      .catch((e) => setError(String(e)));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const meRow = teams.flatMap((t) => t.members).find((m) => m.playerId === me);

  const upload = async (playerId: string, file: File) => {
    setUploadingId(playerId);
    try {
      const resized = await downscaleImage(file, AVATAR_MAX_EDGE, 0.85);
      await api.uploadPlayerPhoto(playerId, resized);
      load();
    } catch {
      // Nothing to recover here beyond leaving the old photo in place --
      // the roster row just quietly keeps whatever it already had.
    } finally {
      setUploadingId(null);
    }
  };

  return (
    <main className="board">
      <header className="page-header">
        <h1>Teams</h1>
        <p className="page-sub">Rosters and handicaps for the weekend.</p>
      </header>

      {!pickingMe && (
        <p className="roster-who-line">
          {meRow ? (
            <>Adding photos as <strong>{meRow.name}</strong>. </>
          ) : (
            "Tap your own name's photo to add one. "
          )}
          <button className="roster-who-link" type="button" onClick={() => setPickingMe(true)}>
            {meRow ? "Not you?" : "Which one's you?"}
          </button>
        </p>
      )}

      {pickingMe && (
        <div className="roster-who-picker">
          <p className="roster-who-line">Which one are you?</p>
          <div className="roster-who-list">
            {teams
              .flatMap((t) => t.members)
              .map((m) => (
                <button
                  key={m.playerId}
                  className="roster-who-option"
                  onClick={() => {
                    setDeviceIdentity(m.playerId);
                    setMe(m.playerId);
                    setPickingMe(false);
                  }}
                >
                  {m.name}
                </button>
              ))}
          </div>
          <button className="roster-who-link" type="button" onClick={() => setPickingMe(false)}>
            Cancel
          </button>
        </div>
      )}

      <div className="teams-list">
        {teams.map((t) => (
          <TeamCard key={t.id} team={t} me={me} uploadingId={uploadingId} onUpload={upload} />
        ))}
      </div>
    </main>
  );
}
