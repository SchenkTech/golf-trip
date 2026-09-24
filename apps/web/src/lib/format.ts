/** Points, written as they actually are. A halved half-point bet is worth
 *  a quarter, and rounding that to one decimal printed "1.8 - 0.3" for a
 *  match that was 1.75 - 0.25 -- a scoreboard that rounds is a scoreboard
 *  nobody can check against their own card. Trailing zeros are dropped, so
 *  2 stays "2" and 1.5 stays "1.5". */
export function formatPoints(n: number): string {
  return String(Number(n.toFixed(2)));
}

/** The trip's name without the bits that only identify one year of it:
 *  a leading ordinal ("4th Annual") and a trailing year. Every event is
 *  named for its own edition -- 4th Annual, 3rd Annual -- so the ordinal
 *  is noise anywhere the year is already on screen, which is everywhere
 *  it's used. */
export function tripName(name: string): string {
  return (
    name
      .replace(/^\s*\d+\s*(st|nd|rd|th)\s+annual\s+/i, "")
      .replace(/\s*\b(19|20)\d{2}\b\s*$/, "")
      .trim() || name
  );
}

/** Parsed as UTC-noon rather than midnight so no local timezone can roll the
 *  displayed date back a day -- this is a date, not an instant. */
export function formatDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

/** Just "Friday" -- the big headline over a day's matches, date and course
 *  moved to a subline below it (see RoundSection.tsx). */
export function formatWeekday(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

/** "May 14, 2027" -- the round subline's date portion. */
export function formatLongDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** "3h ago" / "12m ago" / "just now" -- for Admin's activity glance, where
 *  what matters is how stale an entry is, not its exact clock time. */
export function formatRelativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
