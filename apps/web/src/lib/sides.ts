import type { EventSummary } from "../api.ts";

/**
 * Which of an event's two teams a historical year's free-text side belongs
 * to.
 *
 * The old years recorded a side as a bare name -- whatever the group
 * called it at the time (the API's schema.ts, on historicalMatch.side) --
 * while a real event has `team` rows keyed RED and BLUE. Nothing stores
 * the link between the two, so it has to be derived, and the one honest
 * derivation available is the team's own name: teams here are named for
 * their captain ("Team Fox"), and that's the same name the old records
 * used for the side ("FOX"). The API derives the captain from the team
 * name by exactly this rule (routes/events.ts), so this isn't a new
 * convention, just the same one read from the other end.
 *
 * This used to be two hardcoded strings. That worked for one group and
 * silently dropped any year whose sides were called anything else -- those
 * years vanished from the all-time record rather than showing up as
 * uncounted, which is the worst way to be wrong.
 */

export type SideKey = "RED" | "BLUE";

/** The side label a team would have been recorded under: its name without
 *  a leading "Team", upper-cased, since the old records are upper-case
 *  ("FOX", "WOLF") and a name is not. */
export function sideLabel(teamName: string): string {
  // Trim before stripping the prefix, not after: team names are typed into
  // Admin by hand, and a leading space would otherwise stop "Team " being
  // recognised and leave the whole thing as the label.
  const name = teamName.trim();
  return name.replace(/^team\s+/i, "").trim().toUpperCase();
}

export interface SideLabels {
  RED: string;
  BLUE: string;
}

/** The two labels for an event's teams, or null unless there's exactly one
 *  of each colour to derive them from -- an event mid-setup has no pair to
 *  measure anything against. */
export function sideLabelsFor(teams: EventSummary["teams"]): SideLabels | null {
  const red = teams.find((t) => t.color === "RED");
  const blue = teams.find((t) => t.color === "BLUE");
  if (!red || !blue) return null;
  const labels = { RED: sideLabel(red.name), BLUE: sideLabel(blue.name) };
  // Two teams that reduce to the same label (or to nothing) can't tell an
  // old year's sides apart, and guessing would put points on the wrong
  // side of the all-time score.
  if (!labels.RED || !labels.BLUE || labels.RED === labels.BLUE) return null;
  return labels;
}

/** Which team a recorded side belongs to, or null if it matches neither --
 *  a year played between sides this event doesn't have simply doesn't
 *  count towards this event's all-time record. */
export function sideKeyFor(side: string | null | undefined, labels: SideLabels | null): SideKey | null {
  if (!side || !labels) return null;
  const s = side.trim().toUpperCase();
  if (s === labels.RED) return "RED";
  if (s === labels.BLUE) return "BLUE";
  return null;
}
