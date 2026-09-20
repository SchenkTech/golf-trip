import { useEffect, useMemo, useState } from "react";
import { allocateStrokes, holeResults, holeWinner, scoreMatch } from "@gc/scoring";
import type { HoleResult, PlayerHole, ScoringFormat, TeamFormat } from "@gc/scoring";
import { api } from "./api.ts";
import type { MatchDetail } from "./api.ts";
import { getDeviceIdentity, setDeviceIdentity, getStoredJoinCode, setStoredJoinCode } from "./lib/identity.ts";
import { enqueue, flushMatch, queueForMatch } from "./lib/offlineQueue.ts";
import "./MatchScreen.css";

const TEAM_FORMAT_LABEL: Record<string, string> = {
  SINGLES: "Singles",
  FOURBALL: "Fourball",
  FOURSOMES: "Foursomes",
  SCRAMBLE: "Scramble",
  ALT_SHOT: "Alternate Shot",
};

/** playerId + holeNumber -> gross, merging the server's last-known state
 *  with whatever this device still has queued locally. Queued always wins:
 *  it is by definition more recent than the last successful GET, which is
 *  exactly the offline case this exists for -- a device that entered
 *  scores with no signal must show its own edits immediately, not wait for
 *  a sync that may not happen for hours. */
function mergeScores(match: MatchDetail): Map<string, number | null> {
  const out = new Map<string, number | null>();
  for (const s of match.scores) out.set(`${s.playerId}:${s.holeNumber}`, s.gross);
  for (const q of queueForMatch(match.matchId)) out.set(`${q.playerId}:${q.holeNumber}`, q.gross);
  return out;
}

/** The full scorecard grid -- 18 rows, a column per player -- for reviewing
 *  a match rather than entering it one hole at a time. See docs/DECISIONS.md
 *  #8: "Enter" (below) is right for a phone on the 7th tee; this is right
 *  for checking the maths afterward, or on a bigger screen. Same data, same
 *  screen, just a different read of it -- no separate fetch. */
function MatchCard({
  match,
  scores,
  allocated,
}: {
  match: MatchDetail;
  scores: Map<string, number | null>;
  allocated: Map<string, number[]>;
}) {
  return (
    <div className="match-card-wrap">
      <table className="match-card-table">
        <thead>
          <tr>
            <th className="card-hole-col">Hole</th>
            <th>Par</th>
            <th>SI</th>
            {match.players.map((p) => (
              <th key={p.playerId} className={`side-${p.side.toLowerCase()}`}>
                {p.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {match.holes.map((h) => {
            const entries: PlayerHole[] = match.players.map((p) => ({
              playerId: p.playerId,
              side: p.side,
              gross: scores.get(`${p.playerId}:${h.number}`) ?? null,
              strokesReceived: allocated.get(p.playerId)?.[h.number - 1] ?? 0,
            }));
            const winner = holeWinner(entries, match.teamFormat as TeamFormat);
            return (
              <tr key={h.number} className={winner ? `won-${winner.toLowerCase()}` : ""}>
                <td className="card-hole-col">{h.number}</td>
                <td>{h.par}</td>
                <td>{h.strokeIndex}</td>
                {match.players.map((p) => {
                  const gross = scores.get(`${p.playerId}:${h.number}`) ?? null;
                  const shots = allocated.get(p.playerId)?.[h.number - 1] ?? 0;
                  return (
                    <td key={p.playerId} className={`side-${p.side.toLowerCase()}`}>
                      {gross ?? "–"}
                      {shots > 0 && <sup>{shots > 1 ? shots : "•"}</sup>}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="card-legend">
        <sup>•</sup> gets a shot · <sup>2</sup> gets two · row tint shows who won the hole
      </p>
    </div>
  );
}

export default function MatchScreen({ matchId, onBack }: { matchId: string; onBack: () => void }) {
  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scores, setScores] = useState<Map<string, number | null>>(new Map());
  const [holeIndex, setHoleIndex] = useState(0);
  const [view, setView] = useState<"enter" | "card">("enter");
  const [me, setMe] = useState<string | null>(getDeviceIdentity());
  const [online, setOnline] = useState(navigator.onLine);
  const [queueSize, setQueueSize] = useState(0);
  // Trusted once entered -- see docs/DECISIONS.md #6. Not re-verified on
  // every load (that would need signal every time the screen opens, which
  // defeats the offline story); the server checks it for real on every
  // write, so a stale or wrong code just surfaces as "not yet synced".
  const [codeChecked, setCodeChecked] = useState(!!getStoredJoinCode());
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [checkingCode, setCheckingCode] = useState(false);

  useEffect(() => {
    api
      .match(matchId)
      .then((m) => {
        setMatch(m);
        setScores(mergeScores(m));
        // Land on the first hole that still needs entries, not always
        // hole 1 -- reopening a match half-scored should pick up where it
        // was left, on a course, one-handed.
        const firstOpen = m.holes.findIndex((h) =>
          m.players.some((p) => mergeScores(m).get(`${p.playerId}:${h.number}`) == null),
        );
        setHoleIndex(firstOpen === -1 ? 0 : firstOpen);
      })
      .catch((e) => setError(String(e)));
  }, [matchId]);

  // Flush on mount, whenever the browser says we're back online, and on a
  // short interval regardless -- the 'online' event is not reliable enough
  // on its own (it can fire when the device has a network but the request
  // still fails, or not fire at all on some mobile browsers).
  useEffect(() => {
    const tick = () => {
      setQueueSize(queueForMatch(matchId).length);
      if (navigator.onLine) flushMatch(matchId).then(() => setQueueSize(queueForMatch(matchId).length));
    };
    tick();
    const onOnline = () => {
      setOnline(true);
      tick();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const interval = setInterval(tick, 10_000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(interval);
    };
  }, [matchId]);

  // "Refreshes on its own" (docs/SPEC.md) applies here too -- another
  // player's entry on this same match should show up without a reload.
  // Deliberately separate from the queue-flush tick above (shorter, and
  // cheap regardless of network) since this one is a real fetch; paused
  // while the tab is hidden, and never touches holeIndex -- a background
  // refresh shouldn't yank someone off the hole they're standing on.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      api
        .match(matchId)
        .then((m) => {
          setMatch(m);
          setScores(mergeScores(m));
        })
        .catch(() => {}); // a failed background poll just retries next tick
    };
    const interval = setInterval(refresh, 15_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [matchId]);

  // p.strokesReceived (from the server) is the player's whole-match handicap
  // allowance -- a single number, not a per-hole one (see apps/api's
  // schema.ts on match_player.strokesReceived). Which holes it actually
  // applies to depends on the course's stroke index, via the same
  // allocateStrokes the server now uses -- computed once here so both the
  // live standing below and the "gets a shot" dot in the hole view agree
  // with each other and with what the server will say once this syncs.
  const allocated = useMemo(() => {
    if (!match) return new Map<string, number[]>();
    const strokeIndexes = new Array(18).fill(0);
    for (const h of match.holes) strokeIndexes[h.number - 1] = h.strokeIndex;
    return new Map(match.players.map((p) => [p.playerId, allocateStrokes(p.strokesReceived, strokeIndexes)]));
  }, [match]);

  const live = useMemo(() => {
    if (!match) return null;
    const byHole = new Map<number, PlayerHole[]>();
    for (const h of match.holes) {
      const entries: PlayerHole[] = match.players.map((p) => ({
        playerId: p.playerId,
        side: p.side,
        gross: scores.get(`${p.playerId}:${h.number}`) ?? null,
        strokesReceived: allocated.get(p.playerId)?.[h.number - 1] ?? 0,
      }));
      byHole.set(h.number, entries);
    }
    const results: HoleResult[] = holeResults(byHole, match.teamFormat as TeamFormat);
    return scoreMatch(results, match.scoringFormat as ScoringFormat);
  }, [match, scores, allocated]);

  if (error) return <div className="match-screen"><p className="load-error">Couldn't load this match: {error}</p></div>;
  if (!match || !live) return <div className="match-screen"><p className="loading">Loading…</p></div>;

  if (match.requiresCode && !codeChecked) {
    const submitCode = () => {
      setCheckingCode(true);
      setCodeError(null);
      api
        .verifyCode(match.eventId, codeInput.trim())
        .then((r) => {
          if (r.ok) {
            setStoredJoinCode(codeInput.trim());
            setCodeChecked(true);
          } else {
            setCodeError("That's not the code for this trip.");
          }
        })
        .catch(() => setCodeError("Couldn't check that right now -- try again."))
        .finally(() => setCheckingCode(false));
    };

    return (
      <div className="match-screen">
        <button className="back-link" onClick={onBack}>← Board</button>
        <h2 className="who-title">What's the code?</h2>
        <p className="code-hint">Ask whoever set up this trip if you don't have it.</p>
        <input
          className="code-input"
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && codeInput.trim() && submitCode()}
          placeholder="Trip code"
        />
        {codeError && <p className="code-error">{codeError}</p>}
        <button
          className="who-option code-submit"
          disabled={!codeInput.trim() || checkingCode}
          onClick={submitCode}
        >
          {checkingCode ? "Checking…" : "Continue"}
        </button>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="match-screen">
        <button className="back-link" onClick={onBack}>← Board</button>
        <h2 className="who-title">Who are you?</h2>
        <div className="who-list">
          {match.players.map((p) => (
            <button
              key={p.playerId}
              className="who-option"
              onClick={() => {
                setDeviceIdentity(p.playerId);
                setMe(p.playerId);
              }}
            >
              {p.name}
              {/* A nudge, not a lock (docs/SPEC.md) -- anyone can still pick
                  any name here and enter scores either way. */}
              {p.playerId === match.designatedScorerId && <span className="scorer-badge">Scorer</span>}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const hole = match.holes[holeIndex];
  const setGross = (playerId: string, gross: number | null) => {
    const key = `${playerId}:${hole.number}`;
    setScores((prev) => new Map(prev).set(key, gross));
    enqueue({ matchId, playerId, holeNumber: hole.number, gross, enteredBy: me });
    setQueueSize(queueForMatch(matchId).length);
    flushMatch(matchId).then(() => setQueueSize(queueForMatch(matchId).length));
  };

  return (
    <div className="match-screen">
      <button className="back-link" onClick={onBack}>← Board</button>

      <header className="match-header">
        <p className="match-course">{match.courseName} · {TEAM_FORMAT_LABEL[match.teamFormat] ?? match.teamFormat}</p>
        <div className="match-live-standing">{live.holesPlayed === 0 ? "Not started" : live.standing}</div>
        {match.scoringFormat === "NASSAU" && (
          <div className="segments-row">
            {live.segments.map((s) => (
              <span key={s.name} className="segment-chip">
                {s.name.replace("Overall", "18")}: {s.holesPlayed === 0 ? "—" : s.standing}
              </span>
            ))}
          </div>
        )}
        {match.designatedScorerName && (
          <p className="scorer-notice">
            {match.designatedScorerId === me ? "You're" : `${match.designatedScorerName} is`} keeping score for this
            one — everyone can still enter.
          </p>
        )}
        {!online && <p className="offline-notice">Offline — scores are saved on this device</p>}
        {queueSize > 0 && <p className="offline-notice">{queueSize} not yet synced</p>}
      </header>

      <div className="view-toggle">
        <button className={view === "enter" ? "active" : ""} onClick={() => setView("enter")}>
          Enter
        </button>
        <button className={view === "card" ? "active" : ""} onClick={() => setView("card")}>
          Card
        </button>
      </div>

      {view === "card" ? (
        <MatchCard match={match} scores={scores} allocated={allocated} />
      ) : (
        <>
          <div className="hole-nav">
            <button disabled={holeIndex === 0} onClick={() => setHoleIndex((i) => Math.max(0, i - 1))}>‹</button>
            <div className="hole-info">
              <span className="hole-number">Hole {hole.number}</span>
              <span className="hole-detail">Par {hole.par} · SI {hole.strokeIndex}{hole.yards ? ` · ${hole.yards}y` : ""}</span>
            </div>
            <button disabled={holeIndex === 17} onClick={() => setHoleIndex((i) => Math.min(17, i + 1))}>›</button>
          </div>

          <div className="player-scores">
        {match.players.map((p) => {
          const gross = scores.get(`${p.playerId}:${hole.number}`) ?? null;
          // How many shots this player actually gets on THIS hole -- from
          // allocateStrokes, same as the live standing above, not a
          // stroke-index threshold check. A high enough handicap (this
          // roster has one over 40) gets a second or third shot on the
          // hardest holes, which a simple "<=" check can't express.
          const shotsHere = allocated.get(p.playerId)?.[hole.number - 1] ?? 0;
          return (
            <div key={p.playerId} className="player-score-row">
              <div className="player-score-name">
                <span className={`side-dot side-${p.side.toLowerCase()}`} />
                {p.name}
                {shotsHere > 0 && (
                  <span className="stroke-dot" title={shotsHere > 1 ? `Gets ${shotsHere} shots here` : "Gets a shot here"}>
                    {shotsHere > 1 ? shotsHere : ""}
                  </span>
                )}
              </div>
              <div className="stepper">
                <button
                  className="stepper-btn"
                  onClick={() => setGross(p.playerId, gross === null ? hole.par : Math.max(1, gross - 1))}
                >
                  −
                </button>
                <span className="stepper-value">{gross ?? "–"}</span>
                <button
                  className="stepper-btn"
                  onClick={() => setGross(p.playerId, gross === null ? hole.par : gross + 1)}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
          </div>
        </>
      )}
    </div>
  );
}
