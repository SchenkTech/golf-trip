/** Local queue of hole scores waiting to reach the server. This is the
 *  actual point of docs/DECISIONS.md #7: courses have dead patches, so a
 *  tap on the Enter screen must never depend on having signal right now. Every entry lands here first; the UI reads its own
 *  live state from this queue plus whatever the last successful GET
 *  returned, and a background flush drains it whenever the network allows.
 *
 *  The join code (docs/DECISIONS.md #6) rides along on every flush from
 *  local storage -- it was checked once by the Enter screen's gate before
 *  any of this queue could fill, and the server re-checks it on every
 *  write regardless, so re-sending it here costs nothing and keeps this
 *  module self-contained. */
import { getStoredJoinCode } from "./identity.ts";

/**
 *  hole_score's primary key is (match, player, hole) -- see schema.ts --
 *  so the queue only ever needs to hold the LATEST edit per hole per
 *  player: a second tap on the same hole before the first ever left the
 *  device should overwrite the queued entry, not stack a second one that
 *  would just be immediately superseded by the upsert anyway. */

export interface QueuedScore {
  matchId: string;
  playerId: string;
  holeNumber: number;
  gross: number | null;
  enteredBy: string;
  clientId: string;
  queuedAt: number;
}

const KEY = "gc:queue";

function read(): QueuedScore[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QueuedScore[]) : [];
  } catch {
    return [];
  }
}

function write(entries: QueuedScore[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    // Storage full or blocked -- the entry stays only in memory for this
    // page load. Worth surfacing to the user eventually; not building that
    // now, since a failed write here is rare and the in-memory state (what
    // the screen shows) is still correct for as long as the tab stays open.
  }
}

export function enqueue(entry: Omit<QueuedScore, "clientId" | "queuedAt">): QueuedScore {
  const full: QueuedScore = {
    ...entry,
    clientId: crypto.randomUUID(),
    queuedAt: Date.now(),
  };
  const rest = read().filter(
    (e) => !(e.matchId === full.matchId && e.playerId === full.playerId && e.holeNumber === full.holeNumber),
  );
  write([...rest, full]);
  return full;
}

export function queueForMatch(matchId: string): QueuedScore[] {
  return read().filter((e) => e.matchId === matchId);
}

export function queueLength(): number {
  return read().length;
}

/** Send every queued entry for one match, grouped into a single request
 *  (the API already accepts a batch -- see routes/matches.ts). Entries that
 *  succeed are removed; a failure leaves the whole match's queue intact so
 *  the next flush attempt retries all of it rather than guessing which
 *  entries actually landed. */
export async function flushMatch(matchId: string): Promise<boolean> {
  const pending = queueForMatch(matchId);
  if (pending.length === 0) return true;

  try {
    const res = await fetch(`/api/matches/${matchId}/scores`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scores: pending, code: getStoredJoinCode() }),
    });
    if (!res.ok) return false;
  } catch {
    return false; // still offline, or the request genuinely failed -- leave queued
  }

  const remaining = read().filter((e) => e.matchId !== matchId);
  write(remaining);
  return true;
}
