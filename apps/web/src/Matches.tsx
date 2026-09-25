import { useEffect, useState } from "react";
import { api } from "./api.ts";
import type { EventListItem, EventRound, EventSummary, HistoricalYear } from "./api.ts";
import RoundSection from "./RoundSection.tsx";
import HistoricalTrip from "./HistoricalTrip.tsx";
import TripPicker, { tripName } from "./TripPicker.tsx";
import type { Trip } from "./TripPicker.tsx";
import { formatWeekday } from "./lib/format.ts";
import { declaredScore, sideLabelsFor, sideNamesFor } from "./lib/sides.ts";
import { formatPoints } from "./lib/format.ts";
import "./Rules.css";
import "./Matches.css";

const REFRESH_MS = 20_000;

/** Both sides' total points for a historical year, from its own match
 *  records -- these years have no team rows to read a score off (see the
 *  API's schema.ts), so the result line adds up what was recorded.
 *
 *  Printed using the current event's real team names (sideNamesFor) once a
 *  recorded side is matched to one, the same as History.tsx's identical
 *  fix -- otherwise this and a live event's result line read differently
 *  ("FOX 8 – 6 WOLF" next to "Team Fox 6 – 8 Team Wolf") for what's the
 *  same two teams. */
function historicalResult(year: HistoricalYear, teams: EventSummary["teams"]): string | null {
  const totals = new Map<string, number>();
  for (const r of year.rounds) {
    for (const m of r.matches) {
      for (const s of m.sides) totals.set(s.side, (totals.get(s.side) ?? 0) + s.points);
    }
  }
  const labels = sideLabelsFor(teams);
  const names = sideNamesFor(teams);
  const redTotal = labels && names ? totals.get(labels.RED) : undefined;
  const blueTotal = labels && names ? totals.get(labels.BLUE) : undefined;
  if (labels && names && redTotal !== undefined && blueTotal !== undefined) {
    return `${names.RED} ${formatPoints(redTotal)} – ${formatPoints(blueTotal)} ${names.BLUE}`;
  }
  const sides = [...totals.keys()].sort();
  // No match records, or sides this event's teams don't resolve: fall back
  // to whatever the group remembers / the raw recorded labels.
  if (sides.length !== 2) return declaredScore(year, labels, names);
  return `${sides[0]} ${formatPoints(totals.get(sides[0]) ?? 0)} – ${formatPoints(totals.get(sides[1]) ?? 0)} ${sides[1]}`;
}

function eventResult(summary: EventSummary): string | null {
  const [red, blue] = [summary.teams.find((t) => t.color === "RED"), summary.teams.find((t) => t.color === "BLUE")];
  if (!red || !blue) return null;
  return `${red.name} ${red.points} – ${blue.points} ${blue.name}`;
}

/**
 * Every match of a trip, with a picker for which trip. `year` comes from
 * the URL (`/trips/2026`); without one this is the current trip, which is
 * what `/matches` shows and what the app opens to.
 *
 * The picker exists in place of a History page that re-told what happened
 * somewhere else: every year's matches live on the same screen, in the same
 * shape, and History keeps the all-time numbers -- the part that isn't a
 * list of matches.
 */
export default function Matches({ year }: { year?: number }) {
  const [events, setEvents] = useState<EventListItem[] | null>(null);
  const [historical, setHistorical] = useState<HistoricalYear[]>([]);
  // The whole current event, not just its year: a past trip's recorded
  // side names are matched against this event's team names to colour them
  // (lib/sides.ts), and there's no team row of its own to read.
  const [currentEvent, setCurrentEvent] = useState<EventSummary | null>(null);
  const [summary, setSummary] = useState<EventSummary | null>(null);
  const [rounds, setRounds] = useState<EventRound[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedRound, setSelectedRound] = useState<string | null>(null); // a round id

  // What trips exist at all, and which one the app considers "now". Loaded
  // once -- the list of years doesn't change while someone's looking at it.
  useEffect(() => {
    let cancelled = false;
    Promise.all([api.events(), api.history(), api.currentEvent()])
      .then(([list, hist, current]) => {
        if (cancelled) return;
        setEvents(list.events);
        setHistorical(hist.years);
        setCurrentEvent(current);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const trips: Trip[] = [
    ...(events ?? []).map((e) => ({ year: e.year, name: tripName(e.name), kind: "event" as const })),
    ...historical.map((h) => ({ year: h.year, name: tripName(h.name), kind: "historical" as const })),
  ].sort((a, b) => b.year - a.year);

  const currentYear = currentEvent?.year ?? null;
  const activeYear = year ?? currentYear;
  const activeEvent = events?.find((e) => e.year === activeYear) ?? null;
  const activeHistorical = historical.find((h) => h.year === activeYear) ?? null;
  const isCurrent = activeYear !== null && activeYear === currentYear;
  const activeEventId = activeEvent?.id ?? null;

  // The picked trip's own matches. Only the current one polls: a trip
  // that's over cannot change, and a screen that re-fetches 2026 every
  // twenty seconds is just burning someone's signal on the cart path.
  useEffect(() => {
    if (!activeEventId) {
      setSummary(null);
      setRounds(null);
      return;
    }
    let cancelled = false;
    let loadedOnce = false;
    const load = () => {
      Promise.all([api.event(activeEventId), api.rounds(activeEventId)])
        .then(([ev, r]) => {
          if (cancelled) return;
          setSummary(ev);
          setRounds(r.rounds);
          loadedOnce = true;
        })
        .catch((e) => {
          if (cancelled || loadedOnce) return;
          setError(String(e));
        });
    };
    load();
    if (!isCurrent) {
      return () => {
        cancelled = true;
      };
    }
    // Same "refreshes on its own" polling as the Board (see docs/SPEC.md)
    // -- paused while the tab is hidden, quiet on a failed background poll.
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
  }, [activeEventId, isCurrent]);

  // Switching trips has to drop the day the last one was showing, or
  // Friday-2026 keeps a Sunday-2027 tab selected that isn't there.
  useEffect(() => {
    setSelectedRound(null);
  }, [activeYear]);

  if (error) {
    return (
      <main className="board">
        <p className="load-error">Couldn't load matches: {error}</p>
      </main>
    );
  }

  if (!events || activeYear === null) {
    return (
      <main className="board">
        <p className="loading">Loading…</p>
      </main>
    );
  }

  // A live trip's day tabs default to today's round when the trip is
  // actually underway, else its first day -- rather than always landing on
  // Friday once Sunday's the one in play. A past trip always opens on day
  // one; there is no "today" in it.
  const today = new Date().toISOString().slice(0, 10);
  const defaultRoundId = (isCurrent ? rounds?.find((r) => r.date === today)?.id : null) ?? rounds?.[0]?.id ?? null;
  const activeRoundId = selectedRound ?? defaultRoundId;
  const activeRound = rounds?.find((r) => r.id === activeRoundId) ?? rounds?.[0];

  // The final score, on a trip that has one. Not on the current trip --
  // the Board is right there showing it live, and repeating it in a
  // subtitle just gives it a second place to be a hole behind.
  const result = isCurrent
    ? null
    : activeHistorical
      ? historicalResult(activeHistorical, currentEvent?.teams ?? [])
      : summary
        ? eventResult(summary)
        : null;

  return (
    <main className="board">
      <header className="page-header">
        <h1>Matches</h1>
        <TripPicker trips={trips} activeYear={activeYear} currentYear={currentYear} />
        <p className="page-sub">
          {isCurrent
            ? "Every match this weekend. Tap one to enter scores."
            : currentYear !== null && activeYear > currentYear
              ? "Not played yet — the matchups as they stand."
              : "Finished trip — view only."}
          {result ? ` ${result}.` : ""}
        </p>
      </header>

      {activeHistorical ? (
        <div className="rounds-list">
          <HistoricalTrip year={activeHistorical} teams={currentEvent?.teams ?? []} />
        </div>
      ) : !activeEvent ? (
        <p className="page-sub">Nothing recorded for {activeYear}.</p>
      ) : !rounds ? (
        <p className="loading">Loading…</p>
      ) : rounds.length === 0 ? (
        <p className="page-sub">No rounds set up for this trip yet.</p>
      ) : (
        <>
          {rounds.length > 1 && (
            <div className="day-tabs">
              {rounds.map((r) => (
                <button
                  key={r.id}
                  className={`day-tab ${r.id === activeRoundId ? "active" : ""}`}
                  onClick={() => setSelectedRound(r.id)}
                >
                  {formatWeekday(r.date)}
                </button>
              ))}
            </div>
          )}
          <div className="rounds-list">
            {activeRound && <RoundSection round={activeRound} readOnly={!isCurrent} />}
          </div>
        </>
      )}
    </main>
  );
}
