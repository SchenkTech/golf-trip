import { useEffect, useState } from "react";
import { api, AWARD_RULE_OPTIONS } from "./api.ts";
import type { AdminAward, AdminEvent, AdminMatch, AdminRound, AdminTeeSet, EventRound, MatchActivity, MatchDetail, QuickRule, TeamRoster } from "./api.ts";
import { formatWeekday, formatRelativeTime } from "./lib/format.ts";
import "./Admin.css";

type Auth = { status: "loading" } | { status: "in"; email: string } | { status: "out" };

const SCORING_FORMATS = ["MATCH_PLAY", "NASSAU", "HI_LO", "STROKE"];
const TEAM_FORMATS = ["SINGLES", "FOURBALL", "FOURSOMES", "SCRAMBLE", "ALT_SHOT"];

function RosterRow({
  eventId,
  teamId,
  otherTeamId,
  member,
  onChanged,
}: {
  eventId: string;
  teamId: string;
  otherTeamId: string;
  member: TeamRoster["members"][number];
  onChanged: () => void;
}) {
  const [name, setName] = useState(member.name);
  const [hcp, setHcp] = useState(String(member.handicapIndex));
  const [busy, setBusy] = useState(false);

  return (
    <div className="admin-row">
      <input
        className="admin-input admin-input-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          if (name.trim() && name !== member.name) api.adminRenamePlayer(member.playerId, { name: name.trim() });
        }}
      />
      <input
        className="admin-input admin-input-hcp"
        type="number"
        value={hcp}
        onChange={(e) => setHcp(e.target.value)}
        onBlur={() => {
          const n = Number(hcp);
          if (Number.isFinite(n) && n !== member.handicapIndex) {
            api.adminSetHandicap(teamId, member.playerId, n);
          }
        }}
      />
      <button
        className="admin-icon-btn"
        title="Move to the other team"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await api.adminMovePlayer(eventId, member.playerId, otherTeamId);
          onChanged();
        }}
      >
        ⇄
      </button>
      <button
        className="admin-icon-btn admin-icon-danger"
        title="Remove from this roster"
        disabled={busy}
        onClick={async () => {
          if (!confirm(`Remove ${member.name} from this roster?`)) return;
          setBusy(true);
          await api.adminRemovePlayer(teamId, member.playerId);
          onChanged();
        }}
      >
        ✕
      </button>
    </div>
  );
}

function AddPlayerForm({ teamId, onAdded }: { teamId: string; onAdded: () => void }) {
  const [name, setName] = useState("");
  const [hcp, setHcp] = useState("0");

  return (
    <form
      className="admin-add-row"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        await api.adminAddPlayer(teamId, { name: name.trim(), handicapIndex: Number(hcp) || 0 });
        setName("");
        setHcp("0");
        onAdded();
      }}
    >
      <input
        className="admin-input admin-input-name"
        placeholder="New player"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        className="admin-input admin-input-hcp"
        type="number"
        value={hcp}
        onChange={(e) => setHcp(e.target.value)}
      />
      <button className="admin-icon-btn" type="submit" title="Add">
        +
      </button>
    </form>
  );
}

function TeamColumn({
  eventId,
  team,
  otherTeamId,
  onChanged,
}: {
  eventId: string;
  team: TeamRoster;
  otherTeamId: string;
  onChanged: () => void;
}) {
  const side = team.color === "RED" ? "side-red" : "side-blue";
  return (
    <section className={`admin-team ${side}`}>
      <h2>{team.name}</h2>
      {team.members.map((m) => (
        <RosterRow
          key={m.playerId}
          eventId={eventId}
          teamId={team.id}
          otherTeamId={otherTeamId}
          member={m}
          onChanged={onChanged}
        />
      ))}
      <AddPlayerForm teamId={team.id} onAdded={onChanged} />
    </section>
  );
}

/** Which event Admin is managing -- a plain picker plus a way to start a
 *  new one. Everything below this (rosters, rounds, matchups, testing)
 *  reads/writes whichever event is selected here. */
function EventPicker({
  events,
  eventId,
  onSelect,
  onToggleNew,
  showNew,
  onDeleted,
}: {
  events: AdminEvent[];
  eventId: string;
  onSelect: (id: string) => void;
  onToggleNew: () => void;
  showNew: boolean;
  onDeleted: () => void;
}) {
  const current = events.find((e) => e.id === eventId);
  return (
    <div className="admin-event-picker">
      <select className="admin-select" value={eventId} onChange={(e) => onSelect(e.target.value)}>
        {events.map((e) => (
          <option key={e.id} value={e.id}>
            {e.year} · {e.name}
          </option>
        ))}
      </select>
      <button className="admin-text-btn" onClick={onToggleNew}>
        {showNew ? "Cancel" : "+ New event"}
      </button>
      <button
        className="admin-text-btn admin-icon-danger"
        disabled={events.length <= 1}
        title={events.length <= 1 ? "Can't delete the only event" : "Delete this event"}
        onClick={async () => {
          if (!current) return;
          if (!confirm(`Delete ${current.year} · ${current.name}? Its rounds, matchups and scores go with it. This can't be undone.`)) return;
          await api.adminDeleteEvent(eventId);
          onDeleted();
        }}
      >
        Delete event
      </button>
    </div>
  );
}

function NewEventForm({ events, onCreated }: { events: AdminEvent[]; onCreated: (eventId: string) => void }) {
  // Prefilled from the most recent event, since a trip's name rarely
  // changes year to year -- and empty on the very first one rather than
  // shipping somebody else's trip name as a default.
  const [name, setName] = useState(
    [...events].sort((a, b) => b.year - a.year)[0]?.name.replace(/\s*\b(19|20)\d{2}\b\s*$/, "").trim() ?? "",
  );
  const [year, setYear] = useState(String(new Date().getFullYear() + 1));
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [redName, setRedName] = useState("");
  const [blueName, setBlueName] = useState("");
  const mostRecent = [...events].sort((a, b) => b.year - a.year)[0];
  const [copyFrom, setCopyFrom] = useState(mostRecent?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="admin-new-event"
      onSubmit={async (e) => {
        e.preventDefault();
        const y = Number(year);
        if (!name.trim() || !Number.isInteger(y) || !startDate || !endDate || !redName.trim() || !blueName.trim()) {
          setError("Fill in every field.");
          return;
        }
        setBusy(true);
        setError(null);
        try {
          const r = await api.adminCreateEvent({
            name: name.trim(),
            year: y,
            startDate,
            endDate,
            teams: [
              { name: redName.trim(), color: "RED" },
              { name: blueName.trim(), color: "BLUE" },
            ],
            copyFromEventId: copyFrom || undefined,
          });
          onCreated(r.eventId);
        } catch (err) {
          setError(String(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="admin-field">
        <span>Name</span>
        <input className="admin-input admin-input-wide" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="admin-field">
        <span>Year</span>
        <input className="admin-input" type="number" value={year} onChange={(e) => setYear(e.target.value)} />
      </label>
      <label className="admin-field">
        <span>Starts</span>
        <input className="admin-input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </label>
      <label className="admin-field">
        <span>Ends</span>
        <input className="admin-input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
      </label>
      <label className="admin-field">
        <span>Red team</span>
        <input className="admin-input admin-input-wide" value={redName} onChange={(e) => setRedName(e.target.value)} />
      </label>
      <label className="admin-field">
        <span>Blue team</span>
        <input className="admin-input admin-input-wide" value={blueName} onChange={(e) => setBlueName(e.target.value)} />
      </label>
      {events.length > 0 && (
        <label className="admin-field">
          <span>Copy roster from</span>
          <select className="admin-select" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
            <option value="">None -- start empty</option>
            {[...events]
              .sort((a, b) => b.year - a.year)
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.year} · {e.name}
                </option>
              ))}
          </select>
        </label>
      )}
      {error && <p className="admin-error">{error}</p>}
      <button className="admin-text-btn" type="submit" disabled={busy}>
        {busy ? "Creating…" : "Create event"}
      </button>
    </form>
  );
}

/** Editable name/dates/logo/join-code for the currently selected event --
 *  the join code (docs/DECISIONS.md #6) had no UI control at all before
 *  this; setting one meant a raw SQL update. Collapsed by default since
 *  these fields change rarely, once a trip's basics are set. */
function EventSettingsForm({ event, onChanged }: { event: AdminEvent; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(event.name);
  const [startDate, setStartDate] = useState(event.startDate);
  const [endDate, setEndDate] = useState(event.endDate);
  const [logoUrl, setLogoUrl] = useState(event.logoUrl ?? "");
  const [joinCode, setJoinCode] = useState(event.joinCode ?? "");

  // Re-sync if the selected event changes out from under this form (picker
  // switched to a different year) while it's closed -- avoids saving the
  // previous event's edited-but-unsaved text onto the new one.
  useEffect(() => {
    setName(event.name);
    setStartDate(event.startDate);
    setEndDate(event.endDate);
    setLogoUrl(event.logoUrl ?? "");
    setJoinCode(event.joinCode ?? "");
  }, [event.id]);

  if (!open) {
    return (
      <button className="admin-text-btn" onClick={() => setOpen(true)}>
        Event settings
      </button>
    );
  }

  return (
    <div className="admin-new-event">
      <label className="admin-field">
        <span>Name</span>
        <input className="admin-input admin-input-wide" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== event.name && api.adminUpdateEvent(event.id, { name: name.trim() }).then(onChanged)} />
      </label>
      <label className="admin-field">
        <span>Starts</span>
        <input className="admin-input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} onBlur={() => startDate !== event.startDate && api.adminUpdateEvent(event.id, { startDate }).then(onChanged)} />
      </label>
      <label className="admin-field">
        <span>Ends</span>
        <input className="admin-input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} onBlur={() => endDate !== event.endDate && api.adminUpdateEvent(event.id, { endDate }).then(onChanged)} />
      </label>
      <label className="admin-field">
        <span>Logo path</span>
        <input
          className="admin-input admin-input-wide"
          placeholder="/logos/event.jpg"
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          onBlur={() => logoUrl !== (event.logoUrl ?? "") && api.adminUpdateEvent(event.id, { logoUrl: logoUrl.trim() || null }).then(onChanged)}
        />
      </label>
      <label className="admin-field">
        <span>Join code</span>
        <input
          className="admin-input"
          placeholder="none -- open scoring"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value)}
          onBlur={() => joinCode !== (event.joinCode ?? "") && api.adminUpdateEvent(event.id, { joinCode: joinCode.trim() || null }).then(onChanged)}
        />
      </label>
      <button className="admin-text-btn" type="button" onClick={() => setOpen(false)}>
        Done
      </button>
    </div>
  );
}

function RoundRow({
  round,
  courses,
  onChanged,
  onDeleted,
}: {
  round: AdminRound;
  courses: AdminTeeSet[];
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const effectivePoints = round.pointsPerMatch ?? round.defaultPointsPerMatch;
  const [date, setDate] = useState(round.date);
  const [teeTime, setTeeTime] = useState(round.teeTime ?? "");
  const [teeSetId, setTeeSetId] = useState(round.teeSetId);
  const [scoringFormat, setScoringFormat] = useState(round.scoringFormat);
  const [teamFormat, setTeamFormat] = useState(round.teamFormat);
  const [points, setPoints] = useState(String(effectivePoints));
  const [split, setSplit] = useState(round.segmentPoints ? round.segmentPoints.join(",") : "");
  const [busy, setBusy] = useState(false);

  return (
    <div className="admin-round-row">
      <div className="admin-round-fields">
        <input className="admin-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} onBlur={() => date !== round.date && api.adminUpdateRound(round.id, { date }).then(onChanged)} />
        <input
          className="admin-input admin-input-tee"
          type="text"
          placeholder="Tee time"
          value={teeTime}
          onChange={(e) => setTeeTime(e.target.value)}
          onBlur={() => teeTime !== (round.teeTime ?? "") && api.adminUpdateRound(round.id, { teeTime: teeTime || null }).then(onChanged)}
        />
        <select
          className="admin-select"
          value={teeSetId}
          onChange={(e) => {
            setTeeSetId(e.target.value);
            api.adminUpdateRound(round.id, { teeSetId: e.target.value }).then(onChanged);
          }}
        >
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.courseName} ({c.color})
            </option>
          ))}
        </select>
        <select
          className="admin-select"
          value={teamFormat}
          onChange={(e) => {
            setTeamFormat(e.target.value);
            api.adminUpdateRound(round.id, { teamFormat: e.target.value }).then(onChanged);
          }}
        >
          {TEAM_FORMATS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <select
          className="admin-select"
          value={scoringFormat}
          onChange={(e) => {
            setScoringFormat(e.target.value);
            api.adminUpdateRound(round.id, { scoringFormat: e.target.value }).then(onChanged);
          }}
        >
          {SCORING_FORMATS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <input
          className="admin-input admin-input-hcp"
          type="number"
          step="0.5"
          value={points}
          onChange={(e) => setPoints(e.target.value)}
          onBlur={() => {
            const n = Number(points);
            if (Number.isFinite(n) && n !== effectivePoints) api.adminSetPointsPerMatch(round.id, n).then(onChanged);
          }}
        />
        <span className="admin-round-unit">pts</span>
        <input
          className="admin-input admin-input-split"
          type="text"
          placeholder="even split"
          title="Per-segment points, comma-separated (Nassau: front9,back9,overall) -- e.g. 0.5,0.5,1. Blank scales evenly."
          value={split}
          onChange={(e) => setSplit(e.target.value)}
          onBlur={() => {
            const trimmed = split.trim();
            const stored = round.segmentPoints ? round.segmentPoints.join(",") : "";
            if (trimmed === stored) return;
            if (trimmed === "") {
              api.adminUpdateRound(round.id, { segmentPoints: null }).then(onChanged);
              return;
            }
            const parsed = trimmed.split(",").map((s) => Number(s.trim()));
            if (parsed.every((n) => Number.isFinite(n))) {
              api.adminUpdateRound(round.id, { segmentPoints: parsed }).then(onChanged);
            }
          }}
        />
      </div>
      <button
        className="admin-icon-btn admin-icon-danger"
        title="Delete round"
        disabled={busy}
        onClick={async () => {
          if (!confirm("Delete this round? Its matchups and any entered scores go with it.")) return;
          setBusy(true);
          await api.adminDeleteRound(round.id);
          onDeleted();
        }}
      >
        ✕
      </button>
    </div>
  );
}

function AddRoundForm({ eventId, courses, onAdded }: { eventId: string; courses: AdminTeeSet[]; onAdded: () => void }) {
  const [date, setDate] = useState("");
  const [teeTime, setTeeTime] = useState("");
  const [teeSetId, setTeeSetId] = useState(courses[0]?.id ?? "");
  const [scoringFormat, setScoringFormat] = useState("NASSAU");
  const [teamFormat, setTeamFormat] = useState("SINGLES");
  const [error, setError] = useState<string | null>(null);

  if (courses.length === 0) {
    return <p className="admin-round-hint">Add a course below before adding a round.</p>;
  }

  return (
    <form
      className="admin-round-fields admin-add-round"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!date || !teeSetId) {
          setError("Pick a date and a course.");
          return;
        }
        setError(null);
        await api.adminCreateRound({ eventId, teeSetId, date, teeTime: teeTime || undefined, scoringFormat, teamFormat });
        setDate("");
        setTeeTime("");
        onAdded();
      }}
    >
      <input className="admin-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <input className="admin-input admin-input-tee" type="text" placeholder="Tee time" value={teeTime} onChange={(e) => setTeeTime(e.target.value)} />
      <select className="admin-select" value={teeSetId} onChange={(e) => setTeeSetId(e.target.value)}>
        {courses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.courseName} ({c.color})
          </option>
        ))}
      </select>
      <select className="admin-select" value={teamFormat} onChange={(e) => setTeamFormat(e.target.value)}>
        {TEAM_FORMATS.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>
      <select className="admin-select" value={scoringFormat} onChange={(e) => setScoringFormat(e.target.value)}>
        {SCORING_FORMATS.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>
      <button className="admin-text-btn" type="submit">
        + Add round
      </button>
      {error && <p className="admin-error">{error}</p>}
    </form>
  );
}

/** New course + its first tee set + all 18 holes, in one form -- see
 *  routes/admin.ts's POST /courses for why those three are one call. Par
 *  and stroke index are entered per hole since there's no source this app
 *  can pull them from automatically; yardage is optional. */
function AddCourseForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [color, setColor] = useState("White");
  const [rating, setRating] = useState("72.0");
  const [slope, setSlope] = useState("130");
  const [pars, setPars] = useState<string[]>(Array(18).fill("4"));
  const [strokeIndexes, setStrokeIndexes] = useState<string[]>(Array.from({ length: 18 }, (_, i) => String(i + 1)));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button className="admin-text-btn" onClick={() => setOpen(true)}>
        + Add a new course
      </button>
    );
  }

  return (
    <form
      className="admin-new-course"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = Number(rating);
        const s = Number(slope);
        const holePars = pars.map(Number);
        const holeIndexes = strokeIndexes.map(Number);
        if (!name.trim() || !color.trim() || !Number.isFinite(r) || !Number.isFinite(s)) {
          setError("Fill in the course name, tee color, rating and slope.");
          return;
        }
        if (holePars.some((n) => !Number.isInteger(n)) || holeIndexes.some((n) => !Number.isInteger(n))) {
          setError("Every hole needs a whole-number par and stroke index.");
          return;
        }
        setBusy(true);
        setError(null);
        try {
          await api.adminCreateCourse({
            name: name.trim(),
            location: location.trim() || undefined,
            color: color.trim(),
            rating: r,
            slope: s,
            holes: holePars.map((par, i) => ({ number: i + 1, par, strokeIndex: holeIndexes[i] })),
          });
          setOpen(false);
          setName("");
          setLocation("");
          onAdded();
        } catch (err) {
          setError(String(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="admin-round-fields">
        <input className="admin-input admin-input-wide" placeholder="Course name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="admin-input admin-input-wide" placeholder="Location (optional)" value={location} onChange={(e) => setLocation(e.target.value)} />
        <input className="admin-input" placeholder="Tee color" value={color} onChange={(e) => setColor(e.target.value)} />
        <input className="admin-input" type="number" step="0.1" placeholder="Rating" value={rating} onChange={(e) => setRating(e.target.value)} />
        <input className="admin-input" type="number" placeholder="Slope" value={slope} onChange={(e) => setSlope(e.target.value)} />
      </div>
      <p className="admin-round-hint">Par and stroke index for each of the 18 holes:</p>
      <div className="admin-holes-grid">
        {pars.map((par, i) => (
          <div key={i} className="admin-hole-cell">
            <span className="admin-hole-num">{i + 1}</span>
            <input
              className="admin-input admin-input-hole"
              type="number"
              value={par}
              onChange={(e) => setPars((p) => p.map((v, j) => (j === i ? e.target.value : v)))}
              title="Par"
            />
            <input
              className="admin-input admin-input-hole"
              type="number"
              value={strokeIndexes[i]}
              onChange={(e) => setStrokeIndexes((s) => s.map((v, j) => (j === i ? e.target.value : v)))}
              title="Stroke index"
            />
          </div>
        ))}
      </div>
      {error && <p className="admin-error">{error}</p>}
      <div className="admin-round-fields">
        <button className="admin-text-btn" type="submit" disabled={busy}>
          {busy ? "Adding…" : "Add course"}
        </button>
        <button className="admin-text-btn" type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** One roster, laid out for checking players into a matchup -- a player's
 *  side always follows their team color (see docs/DATA-MODEL.md: a match's
 *  RED/BLUE vocabulary is the same one team.color uses), so there's no
 *  separate side toggle to get wrong. */
function MatchPlayerPicker({
  team,
  checked,
  strokes,
  onToggle,
  onStrokesChange,
}: {
  team: TeamRoster;
  checked: Set<string>;
  strokes: Record<string, string>;
  onToggle: (playerId: string) => void;
  onStrokesChange: (playerId: string, value: string) => void;
}) {
  const side = team.color === "RED" ? "side-red" : "side-blue";
  return (
    <div className={`admin-match-team ${side}`}>
      <p className="admin-round-sub">{team.name}</p>
      {team.members.map((m) => (
        <label key={m.playerId} className="admin-match-player">
          <input type="checkbox" checked={checked.has(m.playerId)} onChange={() => onToggle(m.playerId)} />
          <span>{m.name}</span>
          {checked.has(m.playerId) && (
            <input
              className="admin-input admin-input-hole"
              type="number"
              title="Strokes received"
              value={strokes[m.playerId] ?? "0"}
              onChange={(e) => onStrokesChange(m.playerId, e.target.value)}
            />
          )}
        </label>
      ))}
    </div>
  );
}

/** Whoever's lowest handicap in THIS match plays off scratch (0); everyone
 *  else gets the plain difference. Same rule for every format -- singles
 *  already works this way by definition, fourball and foursomes just make
 *  it visible with more than two players. Recomputed fresh each time the
 *  checked set changes, since "lowest in the match" depends on exactly
 *  who's in it. */
function relativeStrokes(players: { playerId: string; handicapIndex: number }[]): Record<string, string> {
  if (players.length === 0) return {};
  const low = Math.min(...players.map((p) => p.handicapIndex));
  return Object.fromEntries(players.map((p) => [p.playerId, String(p.handicapIndex - low)]));
}

function AddMatchForm({ roundId, teams, onAdded }: { roundId: string; teams: TeamRoster[]; onAdded: () => void }) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [strokes, setStrokes] = useState<Record<string, string>>({});
  const [scorerId, setScorerId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [red, blue] = [teams.find((t) => t.color === "RED"), teams.find((t) => t.color === "BLUE")];
  const roster = teams.flatMap((t) => t.members.map((m) => ({ playerId: m.playerId, name: m.name, handicapIndex: m.handicapIndex })));
  const checkedRoster = roster.filter((p) => checked.has(p.playerId));

  const toggle = (playerId: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else {
        next.add(playerId);
      }
      // A scorer who just got unchecked can't stay picked.
      if (!next.has(playerId) && scorerId === playerId) setScorerId("");
      // Re-derive every checked player's strokes against the new group's
      // own low handicap -- a manual override survives only until the
      // roster for this match changes again.
      setStrokes(relativeStrokes(roster.filter((p) => next.has(p.playerId))));
      return next;
    });

  return (
    <form
      className="admin-add-match"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!red || !blue) return;
        const players = [...checked].map((playerId) => ({
          playerId,
          side: (red.members.some((m) => m.playerId === playerId) ? "RED" : "BLUE") as "RED" | "BLUE",
          strokesReceived: Number(strokes[playerId]) || 0,
        }));
        const hasRed = players.some((p) => p.side === "RED");
        const hasBlue = players.some((p) => p.side === "BLUE");
        if (!hasRed || !hasBlue) {
          setError("Pick at least one player on each side.");
          return;
        }
        setError(null);
        await api.adminCreateMatch({ roundId, players, designatedScorerId: scorerId || undefined });
        setChecked(new Set());
        setStrokes({});
        setScorerId("");
        onAdded();
      }}
    >
      <div className="admin-match-teams">
        {red && <MatchPlayerPicker team={red} checked={checked} strokes={strokes} onToggle={toggle} onStrokesChange={(id, v) => setStrokes((s) => ({ ...s, [id]: v }))} />}
        {blue && <MatchPlayerPicker team={blue} checked={checked} strokes={strokes} onToggle={toggle} onStrokesChange={(id, v) => setStrokes((s) => ({ ...s, [id]: v }))} />}
      </div>
      {checkedRoster.length > 0 && (
        <label className="admin-field admin-scorer-field">
          <span>Designated scorer (optional)</span>
          <select className="admin-select" value={scorerId} onChange={(e) => setScorerId(e.target.value)}>
            <option value="">No nudge -- anyone can enter</option>
            {checkedRoster.map((p) => (
              <option key={p.playerId} value={p.playerId}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {error && <p className="admin-error">{error}</p>}
      <button className="admin-text-btn" type="submit">
        + Add matchup
      </button>
    </form>
  );
}

function MatchupsSection({
  rounds,
  teams,
  matchesByRound,
  onChanged,
}: {
  rounds: AdminRound[];
  teams: TeamRoster[];
  matchesByRound: Record<string, AdminMatch[]>;
  onChanged: () => void;
}) {
  return (
    <section className="rules-section">
      <h2>Matchups</h2>
      <p className="admin-round-hint">Who's playing whom, round by round. A player's side follows their team.</p>
      {rounds.length === 0 && <p>Add a round above first.</p>}
      {rounds.map((r) => {
        const matches = matchesByRound[r.id] ?? [];
        return (
          <div key={r.id} className="admin-testing-round">
            <p className="year-round-label">
              {formatWeekday(r.date)} · {r.courseName}
            </p>
            {matches.map((m) => {
              const redSide = m.players.filter((p) => p.side === "RED");
              const blueSide = m.players.filter((p) => p.side === "BLUE");
              // Plain weight, not the display font: a condensed grotesque at
              // this size makes a "+" glyph read as a dash (the vertical
              // stroke gets lost), which is exactly the kind of thing a
              // handicap number can't afford to be ambiguous about.
              const side = (players: typeof redSide) => (
                <>
                  {players.map((p, i) => (
                    <span key={p.playerId}>
                      {i > 0 && " & "}
                      {p.name}
                      {p.strokesReceived > 0 && <span className="admin-strokes-badge">+{p.strokesReceived}</span>}
                    </span>
                  ))}
                </>
              );
              const roster = [...redSide, ...blueSide];
              return (
                <div key={m.id} className="admin-row">
                  <span className="admin-round-label admin-matchup-label">
                    {side(redSide)} <span className="admin-round-sub">vs</span> {side(blueSide)}
                    <span className="admin-round-sub admin-scorer-row">
                      Scorer:{" "}
                      <select
                        className="admin-select admin-select-inline"
                        value={m.designatedScorerId ?? ""}
                        onChange={(e) => api.adminSetDesignatedScorer(m.id, e.target.value || null).then(onChanged)}
                      >
                        <option value="">none</option>
                        {roster.map((p) => (
                          <option key={p.playerId} value={p.playerId}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </span>
                  </span>
                  <button
                    className="admin-icon-btn admin-icon-danger"
                    title="Delete matchup"
                    onClick={async () => {
                      if (!confirm("Delete this matchup? Any scores entered for it go too.")) return;
                      await api.adminDeleteMatch(m.id);
                      onChanged();
                    }}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
            {teams.length === 2 && <AddMatchForm roundId={r.id} teams={teams} onAdded={onChanged} />}
          </div>
        );
      })}
    </section>
  );
}

/** A round's matches with live standings, for the testing tools below --
 *  same data the Board shows, just so "clear this match" can say what it's
 *  about to clear (holes played, current standing) instead of a bare id. */
/** Hole-by-hole grid for one match -- fetches the same MatchDetail the real
 *  Enter screen uses (so par/SI/existing scores are never re-derived
 *  differently in two places), and corrects a cell through the admin-only
 *  scores endpoint on blur. Emptying a cell clears that one hole back to
 *  "not entered" rather than requiring the whole-match Clear button. */
function MatchScoresEditor({ matchId, onChanged }: { matchId: string; onChanged: () => void }) {
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = () => api.match(matchId).then(setDetail);
  useEffect(() => {
    load();
  }, [matchId]);

  if (!detail) return <p className="loading">Loading…</p>;

  const scoreFor = (playerId: string, hole: number) =>
    detail.scores.find((s) => s.playerId === playerId && s.holeNumber === hole)?.gross ?? null;

  const commit = async (playerId: string, hole: number, raw: string) => {
    const current = scoreFor(playerId, hole);
    const next = raw.trim() === "" ? null : Number(raw);
    if (next === current) return;
    if (next !== null && (!Number.isInteger(next) || next < 1 || next > 20)) return;
    setBusyKey(`${playerId}:${hole}`);
    await api.adminSetScores(matchId, [{ playerId, holeNumber: hole, gross: next }]);
    await load();
    setBusyKey(null);
    onChanged();
  };

  return (
    <div className="admin-scores-editor" style={{ gridTemplateColumns: `32px repeat(${detail.players.length}, 1fr)` }}>
      <div className="admin-scores-corner" />
      {detail.players.map((p) => (
        <div key={p.playerId} className={`admin-scores-header side-${p.side.toLowerCase()}`}>
          {p.name}
        </div>
      ))}
      {detail.holes.flatMap((h) => [
        <div key={`h${h.number}`} className="admin-scores-hole">
          {h.number}
        </div>,
        ...detail.players.map((p) => (
          <input
            key={`${p.playerId}-${h.number}`}
            className="admin-input admin-input-hole"
            type="number"
            defaultValue={scoreFor(p.playerId, h.number) ?? ""}
            disabled={busyKey === `${p.playerId}:${h.number}`}
            onBlur={(e) => commit(p.playerId, h.number, e.target.value)}
          />
        )),
      ])}
    </div>
  );
}

/** Every in-progress match, stalest first -- "what needs a nudge" on the
 *  actual golf weekend. Polling rather than push (see docs/SPEC.md's
 *  explicit "out of scope: push notifications") -- this is a glance admin
 *  takes when they open the app, not a notification that reaches them. */
function ActivitySection({ eventId }: { eventId: string }) {
  const [activity, setActivity] = useState<MatchActivity[] | null>(null);

  useEffect(() => {
    api.adminActivity(eventId).then((r) => setActivity(r.activity));
  }, [eventId]);

  if (!activity) return null;

  return (
    <section className="rules-section">
      <h2>Activity</h2>
      <p className="admin-round-hint">Matches with a score entered but not decided, oldest entry first.</p>
      {activity.length === 0 ? (
        <p className="admin-round-hint">Nothing in progress right now.</p>
      ) : (
        <div className="admin-rounds">
          {activity.map((a) => (
            <div key={a.matchId} className="admin-row">
              <span className="admin-round-label">
                {a.label}
                <span className="admin-round-sub">
                  {a.courseName} · {a.standing} · {a.holesPlayed} holes played
                </span>
              </span>
              <span className="admin-round-sub">{formatRelativeTime(a.lastEnteredAt)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function TestingSection({ eventId, rounds, onChanged }: { eventId: string; rounds: EventRound[]; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const anyScores = rounds.some((r) => r.matches.some((m) => m.holesPlayed > 0));

  const clearMatch = async (matchId: string) => {
    setBusy(matchId);
    await api.adminClearMatchScores(matchId);
    setBusy(null);
    onChanged();
  };

  return (
    <section className="rules-section">
      <h2>Testing</h2>
      <p className="admin-round-hint">
        Clear entered scores while trying things out before the real trip, or fix a single hole without clearing the
        whole match -- players, sides and strokes stay put either way.
      </p>
      <button
        className="admin-text-btn admin-icon-danger admin-clear-all-btn"
        disabled={!anyScores || busy !== null}
        onClick={async () => {
          if (!confirm("Clear every entered score for this event? This can't be undone.")) return;
          setBusy("__event__");
          await api.adminClearEventScores(eventId);
          setBusy(null);
          onChanged();
        }}
      >
        Clear all scores for this event
      </button>
      <div className="admin-rounds">
        {rounds.map((r) => (
          <div key={r.id} className="admin-testing-round">
            <p className="year-round-label">
              {formatWeekday(r.date)} · {r.courseName}
            </p>
            {r.matches.map((m) => {
              const redSide = m.players.filter((p) => p.side === "RED").map((p) => p.name).join(" & ");
              const blueSide = m.players.filter((p) => p.side === "BLUE").map((p) => p.name).join(" & ");
              return (
                <div key={m.matchId}>
                  <div className="admin-row">
                    <span className="admin-round-label">
                      {redSide} vs {blueSide}
                      <span className="admin-round-sub">
                        {m.holesPlayed === 0 ? "Not started" : `${m.holesPlayed} holes entered · ${m.standing}`}
                      </span>
                    </span>
                    <button
                      className="admin-text-btn"
                      onClick={() => setEditing(editing === m.matchId ? null : m.matchId)}
                    >
                      {editing === m.matchId ? "Close" : "Fix scores"}
                    </button>
                    <button
                      className="admin-text-btn"
                      disabled={m.holesPlayed === 0 || busy !== null}
                      onClick={() => clearMatch(m.matchId)}
                    >
                      Clear
                    </button>
                  </div>
                  {editing === m.matchId && <MatchScoresEditor matchId={m.matchId} onChanged={onChanged} />}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

function QuickRuleRow({ rule, isFirst, isLast, onChanged }: { rule: QuickRule; isFirst: boolean; isLast: boolean; onChanged: () => void }) {
  const [title, setTitle] = useState(rule.title);
  const [body, setBody] = useState(rule.body);

  return (
    <div className="admin-rule-row">
      <div className="admin-rule-fields">
        <input
          className="admin-input admin-input-wide"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== rule.title && api.adminUpdateRule(rule.id, { title: title.trim() }).then(onChanged)}
        />
        <input
          className="admin-input admin-input-wide"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onBlur={() => body.trim() && body !== rule.body && api.adminUpdateRule(rule.id, { body: body.trim() }).then(onChanged)}
        />
      </div>
      <button className="admin-icon-btn" title="Move up" disabled={isFirst} onClick={() => api.adminMoveRule(rule.id, "up").then(onChanged)}>
        ↑
      </button>
      <button className="admin-icon-btn" title="Move down" disabled={isLast} onClick={() => api.adminMoveRule(rule.id, "down").then(onChanged)}>
        ↓
      </button>
      <button
        className="admin-icon-btn admin-icon-danger"
        title="Delete"
        onClick={async () => {
          if (!confirm(`Delete the "${rule.title}" rule?`)) return;
          await api.adminDeleteRule(rule.id);
          onChanged();
        }}
      >
        ✕
      </button>
    </div>
  );
}

function AddQuickRuleForm({ onAdded }: { onAdded: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  return (
    <form
      className="admin-rule-fields admin-add-rule"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim() || !body.trim()) return;
        await api.adminCreateRule({ title: title.trim(), body: body.trim() });
        setTitle("");
        setBody("");
        onAdded();
      }}
    >
      <input className="admin-input admin-input-wide" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <input className="admin-input admin-input-wide" placeholder="Rule text" value={body} onChange={(e) => setBody(e.target.value)} />
      <button className="admin-text-btn" type="submit">
        + Add rule
      </button>
    </form>
  );
}

function QuickRulesSection({ rules, onChanged }: { rules: QuickRule[]; onChanged: () => void }) {
  return (
    <section className="rules-section">
      <h2>Quick Rules</h2>
      <p className="admin-round-hint">
        The group's local rules, shown on the Rules page. The Nassau/Formats/Handicaps sections there describe how
        scoring actually works and aren't editable here -- see the Rules page for those.
      </p>
      <div className="admin-rounds">
        {rules.map((r, i) => (
          <QuickRuleRow key={r.id} rule={r} isFirst={i === 0} isLast={i === rules.length - 1} onChanged={onChanged} />
        ))}
      </div>
      <AddQuickRuleForm onAdded={onChanged} />
    </section>
  );
}

/** One award's row: enable toggle, name, the rule that decides it, and --
 *  for a hand-set award only -- a holder picked from the event roster (or
 *  cleared back to "—") and a one-line reason.
 *
 *  Pick a derived rule and the holder/reason inputs go away entirely
 *  rather than sitting there greyed out: the Board no longer reads them
 *  (see the API's lib/awards.ts), and an editable-looking field whose
 *  value nothing shows is worse than no field. What an admin last typed is
 *  still kept on the row, so switching back to "Set by hand" brings it
 *  back. */
function AwardRow({ award, roster, onChanged }: { award: AdminAward; roster: { playerId: string; name: string }[]; onChanged: () => void }) {
  const [name, setName] = useState(award.name);
  const [reason, setReason] = useState(award.reason ?? "");
  const derived = award.rule !== "MANUAL";

  return (
    <div className="admin-rule-row">
      <label className="admin-toggle" title={award.enabled ? "Shown on the Board" : "Hidden from the Board"}>
        <input type="checkbox" checked={award.enabled} onChange={(e) => api.adminUpdateAward(award.id, { enabled: e.target.checked }).then(onChanged)} />
      </label>
      <div className="admin-rule-fields">
        <input
          className="admin-input admin-input-wide"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== award.name && api.adminUpdateAward(award.id, { name: name.trim() }).then(onChanged)}
        />
        <select
          className="admin-select"
          value={award.rule}
          title="What decides who holds this"
          onChange={(e) => api.adminUpdateAward(award.id, { rule: e.target.value }).then(onChanged)}
        >
          {AWARD_RULE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {derived ? (
          <span className="admin-award-auto">Updates itself as the trip is played</span>
        ) : (
          <>
            <select
              className="admin-select"
              value={award.holderId ?? ""}
              onChange={(e) => api.adminUpdateAward(award.id, { holderId: e.target.value || null }).then(onChanged)}
            >
              <option value="">— not decided —</option>
              {roster.map((p) => (
                <option key={p.playerId} value={p.playerId}>
                  {p.name}
                </option>
              ))}
            </select>
            <input
              className="admin-input admin-input-wide"
              placeholder="Reason (e.g. Hole 7, 4 feet)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onBlur={() => reason !== (award.reason ?? "") && api.adminUpdateAward(award.id, { reason: reason.trim() || null }).then(onChanged)}
            />
          </>
        )}
      </div>
      <button
        className="admin-icon-btn admin-icon-danger"
        title="Delete"
        onClick={async () => {
          if (!confirm(`Delete the "${award.name}" award?`)) return;
          await api.adminDeleteAward(award.id);
          onChanged();
        }}
      >
        ✕
      </button>
    </div>
  );
}

function AddAwardForm({ eventId, onAdded }: { eventId: string; onAdded: () => void }) {
  const [name, setName] = useState("");

  return (
    <form
      className="admin-add-rule"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        await api.adminCreateAward(eventId, name.trim());
        setName("");
        onAdded();
      }}
    >
      <input className="admin-input admin-input-wide" placeholder="Award name" value={name} onChange={(e) => setName(e.target.value)} />
      <button className="admin-text-btn" type="submit">
        + Add award
      </button>
    </form>
  );
}

/** See docs/SPEC.md's "Individual awards": shown on the Board under the
 *  team score, admin-set (there's no shot-tracking data an app could derive
 *  Closest to Pin or Long Drive from). Every event seeds with those two
 *  enabled by default; admin can rename, add the group's own, or disable
 *  ones that don't apply this year without losing the name. */
function AwardsSection({ eventId, teams }: { eventId: string; teams: TeamRoster[] }) {
  const [awards, setAwards] = useState<AdminAward[] | null>(null);
  const roster = teams.flatMap((t) => t.members.map((m) => ({ playerId: m.playerId, name: m.name })));

  const load = () => api.adminAwards(eventId).then((r) => setAwards(r.awards));
  useEffect(() => {
    load();
  }, [eventId]);

  return (
    <section className="rules-section">
      <h2>Individual Awards</h2>
      <p className="admin-round-hint">
        Shown on the Board under the team score. Rename them to whatever the trip actually calls them — the rule
        beside each name is what really decides it, and a derived one keeps itself up to date as scores come in.
        Uncheck to hide an award for this year without deleting it.
      </p>
      {awards && (
        <div className="admin-rounds">
          {awards.map((a) => (
            <AwardRow key={a.id} award={a} roster={roster} onChanged={load} />
          ))}
        </div>
      )}
      <AddAwardForm eventId={eventId} onAdded={load} />
    </section>
  );
}

export default function Admin() {
  const [auth, setAuth] = useState<Auth>({ status: "loading" });
  const [events, setEvents] = useState<AdminEvent[] | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [teams, setTeams] = useState<TeamRoster[] | null>(null);
  const [rounds, setRounds] = useState<AdminRound[] | null>(null);
  const [liveRounds, setLiveRounds] = useState<EventRound[] | null>(null);
  const [courses, setCourses] = useState<AdminTeeSet[] | null>(null);
  const [matchesByRound, setMatchesByRound] = useState<Record<string, AdminMatch[]>>({});
  const [quickRules, setQuickRules] = useState<QuickRule[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadEvents = () => {
    api
      .adminEvents()
      .then((r) => setEvents(r.events))
      .catch((e) => setError(String(e)));
  };

  // Club-wide, not per-event (see schema.ts's note on quick_rule) -- loaded
  // once alongside the event list, not refetched when eventId changes.
  const loadRules = () => {
    api
      .rules()
      .then((r) => setQuickRules(r.rules))
      .catch((e) => setError(String(e)));
  };

  const load = () => {
    if (!eventId) return;
    api
      .teams(eventId)
      .then((r) => setTeams(r.teams))
      .catch((e) => setError(String(e)));
    api
      .adminRounds(eventId)
      .then((r) => {
        setRounds(r.rounds);
        Promise.all(r.rounds.map((round) => api.adminMatches(round.id).then((m) => [round.id, m.matches] as const))).then(
          (pairs) => setMatchesByRound(Object.fromEntries(pairs)),
        );
      })
      .catch((e) => setError(String(e)));
    api
      .rounds(eventId)
      .then((r) => setLiveRounds(r.rounds))
      .catch((e) => setError(String(e)));
  };

  useEffect(() => {
    api
      .adminWhoami()
      .then((r) => setAuth(r.email ? { status: "in", email: r.email } : { status: "out" }))
      .catch(() => setAuth({ status: "out" }));
  }, []);

  useEffect(() => {
    if (auth.status !== "in") return;
    loadEvents();
    loadRules();
    api
      .currentEvent()
      .then((ev) => setEventId(ev.id))
      .catch((e) => setError(String(e)));
    api
      .adminCourses()
      .then((r) => setCourses(r.teeSets))
      .catch((e) => setError(String(e)));
  }, [auth.status]);

  useEffect(load, [eventId]);

  if (auth.status === "loading") {
    return (
      <main className="board">
        <p className="loading">Loading…</p>
      </main>
    );
  }

  if (auth.status === "out") {
    const err = new URLSearchParams(window.location.search).get("error");
    return (
      <main className="board">
        <header className="page-header">
          <h1>Admin</h1>
          <p className="page-sub">For the two or three people setting up the trip.</p>
        </header>
        {err === "not_admin" && (
          <p className="admin-error">That Google account isn't on the admin list.</p>
        )}
        {err && err !== "not_admin" && <p className="admin-error">Sign-in didn't go through -- try again.</p>}
        <a className="admin-signin-btn" href="/api/auth/google/start">
          Sign in with Google
        </a>
      </main>
    );
  }

  if (error) {
    return (
      <main className="board">
        <p className="load-error">Couldn't load rosters: {error}</p>
      </main>
    );
  }

  if (!teams || !eventId || !events) {
    return (
      <main className="board">
        <p className="loading">Loading…</p>
      </main>
    );
  }

  const [a, b] = teams;

  return (
    <main className="board">
      <header className="page-header">
        <h1>Admin</h1>
        <p className="page-sub">
          Signed in as {auth.email}.{" "}
          <button
            className="admin-signout-btn"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              setAuth({ status: "out" });
            }}
          >
            Sign out
          </button>
        </p>
      </header>

      <EventPicker
        events={events}
        eventId={eventId}
        onSelect={setEventId}
        showNew={showNewEvent}
        onToggleNew={() => setShowNewEvent((v) => !v)}
        onDeleted={() => {
          loadEvents();
          api
            .currentEvent()
            .then((ev) => setEventId(ev.id))
            .catch((e) => setError(String(e)));
        }}
      />
      {showNewEvent && (
        <NewEventForm
          events={events}
          onCreated={(id) => {
            setShowNewEvent(false);
            loadEvents();
            setEventId(id);
          }}
        />
      )}
      {(() => {
        const current = events.find((e) => e.id === eventId);
        return current && <EventSettingsForm event={current} onChanged={loadEvents} />;
      })()}

      {a && b && (
        <div className="admin-teams">
          <TeamColumn eventId={eventId} team={a} otherTeamId={b.id} onChanged={load} />
          <TeamColumn eventId={eventId} team={b} otherTeamId={a.id} onChanged={load} />
        </div>
      )}

      <section className="rules-section">
        <h2>Rounds</h2>
        <p className="admin-round-hint">
          One row per day of golf. Points per match defaults to the format's natural value -- override it if the
          group's rule for that round changes.
        </p>
        {rounds && courses ? (
          <>
            <div className="admin-rounds">
              {rounds.map((r) => (
                <RoundRow key={r.id} round={r} courses={courses} onChanged={load} onDeleted={load} />
              ))}
            </div>
            <AddRoundForm eventId={eventId} courses={courses} onAdded={load} />
            <div className="admin-add-course">
              <AddCourseForm onAdded={() => api.adminCourses().then((r) => setCourses(r.teeSets))} />
            </div>
          </>
        ) : (
          <p className="loading">Loading…</p>
        )}
      </section>

      {rounds && teams.length === 2 && (
        <MatchupsSection rounds={rounds} teams={teams} matchesByRound={matchesByRound} onChanged={load} />
      )}

      <ActivitySection eventId={eventId} />

      {teams.length === 2 && <AwardsSection eventId={eventId} teams={teams} />}

      {liveRounds && <TestingSection eventId={eventId} rounds={liveRounds} onChanged={load} />}

      {quickRules && <QuickRulesSection rules={quickRules} onChanged={loadRules} />}
    </main>
  );
}
