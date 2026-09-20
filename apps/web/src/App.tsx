import { useEffect, useState } from "react";
import { api } from "./api.ts";
import type { EventRound, EventSummary } from "./api.ts";
import MatchScreen from "./MatchScreen.tsx";
import Matches from "./Matches.tsx";
import Teams from "./Teams.tsx";
import History from "./History.tsx";
import Rules from "./Rules.tsx";
import Admin from "./Admin.tsx";
import RoundSection from "./RoundSection.tsx";
import Nav from "./Nav.tsx";
import ThemeToggle from "./ThemeToggle.tsx";
import { RouterProvider, usePath } from "./router.tsx";
import { formatDate } from "./lib/format.ts";
import "./App.css";

const REFRESH_MS = 20_000;

function Board() {
  const [event, setEvent] = useState<EventSummary | null>(null);
  const [rounds, setRounds] = useState<EventRound[]>([]);
  const [error, setError] = useState<string | null>(null);

  // "Refreshes on its own. Nobody should have to pull down." -- docs/
  // SPEC.md. Paused while the tab is hidden (no point polling a screen
  // nobody's looking at), and fires once immediately when it comes back
  // into view rather than waiting out the rest of the interval. A poll
  // that fails after the first successful load stays quiet and retries
  // next tick -- a transient blip shouldn't blank out a scoreboard someone
  // has propped up and is reading.
  useEffect(() => {
    let cancelled = false;
    let loadedOnce = false;
    const load = () => {
      api
        .currentEvent()
        .then((ev) => {
          if (cancelled) return;
          setEvent(ev);
          // The tab (and an installed app's window) reads the event's own
          // name, rather than a trip name baked into index.html -- nothing
          // in the build knows whose trip this is.
          document.title = ev.name;
          return api.rounds(ev.id).then((r) => {
            if (cancelled) return;
            setRounds(r.rounds);
            loadedOnce = true;
          });
        })
        .catch((e) => {
          if (cancelled || loadedOnce) return;
          setError(String(e));
        });
    };
    load();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, REFRESH_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  if (error) {
    return (
      <main className="board">
        <p className="load-error">Couldn't load the event: {error}</p>
      </main>
    );
  }

  if (!event) {
    return (
      <main className="board">
        <p className="loading">Loading…</p>
      </main>
    );
  }

  const [red, blue] = [
    event.teams.find((t) => t.color === "RED"),
    event.teams.find((t) => t.color === "BLUE"),
  ];

  return (
    <main className="board">
      <div className="hero">
        <header className="event-header">
          {event.logoUrl && <img className="event-logo" src={event.logoUrl} alt="" />}
          <div>
            <h1>{event.name}</h1>
            <p className="event-dates">
              {formatDate(event.startDate)} – {formatDate(event.endDate)}, {event.year}
            </p>
          </div>
        </header>

        <section className="score-bar">
          {[red, blue].map((t) =>
            t ? (
              <div key={t.id} className={`team-tile side-${t.color.toLowerCase()}`}>
                {t.logoUrl && <img className="team-logo" src={t.logoUrl} alt="" />}
                <span className="team-name">{t.name}</span>
                <span className="team-points">{t.points}</span>
              </div>
            ) : null,
          )}
        </section>
        <p className="points-available">
          {event.pointsRemaining} of {event.pointsAvailable} points still to play for
        </p>

        {event.awards.length > 0 && (
          <div className="awards-row">
            {event.awards.map((a) => (
              <div key={a.id} className="award-chip">
                <span className="award-name">{a.name}</span>
                <span className="award-holder">{a.holderName ?? "—"}</span>
                <span className="award-reason">{a.reason ?? (a.holderName ? "" : "Not decided yet")}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounds-list">
        {rounds.map((r) => (
          <RoundSection key={r.id} round={r} />
        ))}
      </div>
    </main>
  );
}

function Screens() {
  const path = usePath();
  const matchId = path.startsWith("/matches/") ? path.slice("/matches/".length) : null;
  // `/trips/2026` is the Matches screen pointed at a past trip -- a real
  // URL rather than dropdown-only state, so a year can be linked to and
  // shared the same way a match can (and so History's list of years has
  // somewhere to send you).
  const tripYear = /^\/trips\/\d{4}$/.test(path) ? Number(path.slice("/trips/".length)) : null;

  if (matchId) {
    // No top nav here -- see docs/SPEC.md: this screen "has to work with
    // cold hands and one bar of signal," so it gets the whole screen and
    // its own back link rather than sharing space with page navigation.
    return (
      <>
        <MatchScreen matchId={matchId} onBack={() => window.history.back()} />
        <ThemeToggle />
      </>
    );
  }

  return (
    <>
      <Nav />
      {path === "/matches" ? (
        <Matches />
      ) : tripYear ? (
        <Matches year={tripYear} />
      ) : path === "/teams" ? (
        <Teams />
      ) : path === "/history" ? (
        <History />
      ) : path === "/rules" ? (
        <Rules />
      ) : path === "/admin" ? (
        <Admin />
      ) : (
        <Board />
      )}
      <ThemeToggle />
    </>
  );
}

export default function App() {
  return (
    <RouterProvider>
      <Screens />
    </RouterProvider>
  );
}
