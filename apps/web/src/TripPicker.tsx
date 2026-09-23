import { useEffect, useRef, useState } from "react";
import { navigate } from "./router.tsx";
import { tripName } from "./lib/format.ts";

export { tripName };

/** One trip in the picker. `kind` is how much detail there is to show once
 *  it's picked -- a live event has real matches off real hole scores, a
 *  historical year has whatever was recorded at the time (see the API's
 *  schema.ts on historicalYear). */
export interface Trip {
  year: number;
  /** The trip's own name, with any trailing year already stripped -- the
   *  year is shown beside it, and "2026 The Cup 2026" reads like a
   *  mistake. */
  name: string;
  kind: "event" | "historical";
}

function IconChevron() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

/** Marks a trip that's over: what you're looking at is the record, not a
 *  scoreboard you can still change -- the same signal a trip list in any
 *  app of this kind uses. */
function IconLock() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

/**
 * "Choose a trip" -- the dropdown at the top of Matches, so past years are
 * reachable from the screen that shows matches rather than from a separate
 * history page.
 *
 * Picking a year is a real navigation (`/trips/2026`), not just local
 * state, so a past trip can be linked to and shared the same way a match
 * can -- and so History's year list has somewhere to send you.
 */
export default function TripPicker({
  trips,
  activeYear,
  currentYear,
}: {
  trips: Trip[];
  /** The trip being shown. */
  activeYear: number;
  /** The year the app opens to on its own -- "back to current year". */
  currentYear: number | null;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  // A menu that stays open after you've tapped past it is a menu in the
  // way -- close on any click outside, and on Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = trips.find((t) => t.year === activeYear);
  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <div className="trip-picker" ref={wrap}>
      <button className="trip-button" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {/* Year first: it's the short, certain part, and these trips have
            long formal names ("3rd Annual Invitational") that get
            truncated on a phone. */}
        <span className="trip-button-year">{activeYear}</span>
        {active && <span className="trip-button-name">{active.name}</span>}
        <span className={`trip-chevron ${open ? "open" : ""}`}>
          <IconChevron />
        </span>
      </button>

      {open && (
        <div className="trip-menu" role="menu">
          <p className="trip-menu-title">Choose a trip</p>
          {trips.map((t) => (
            <button
              key={t.year}
              className={`trip-menu-row ${t.year === activeYear ? "active" : ""}`}
              role="menuitem"
              onClick={() => go(t.year === currentYear ? "/matches" : `/trips/${t.year}`)}
            >
              <span className="trip-menu-year">{t.year}</span>
              <span className="trip-menu-name">{t.name}</span>
              {/* Only a trip that's already happened is locked. A year
                  still ahead of the current one isn't finished, it just
                  hasn't started -- no lock, nothing to imply otherwise. */}
              {currentYear !== null && t.year < currentYear && (
                <span className="trip-menu-lock" title="Finished — view only">
                  <IconLock />
                </span>
              )}
            </button>
          ))}
          {currentYear !== null && activeYear !== currentYear && (
            <button className="trip-menu-back" role="menuitem" onClick={() => go("/matches")}>
              Back to current year
            </button>
          )}
        </div>
      )}
    </div>
  );
}
