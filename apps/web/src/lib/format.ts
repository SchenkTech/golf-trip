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
