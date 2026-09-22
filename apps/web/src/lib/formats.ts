/**
 * What a round's format is called on screen.
 *
 * These are the group's words, not golf's formal vocabulary: a fourball is
 * "Best Ball" and a singles match is "Match Play", because that is what
 * gets said on the first tee and written in the trip's own spreadsheet.
 * Same reasoning as every other bit of copy here (see CLAUDE.md: written
 * from the player's side of the screen).
 *
 * The two axes stay separate in the data (docs/SCORING.md) -- SINGLES is a
 * team format, MATCH_PLAY a scoring format -- so once singles is called
 * "Match Play" the two labels can collide. roundFormatLine below is the
 * only thing that should join them.
 */

export const TEAM_FORMAT_LABEL: Record<string, string> = {
  SINGLES: "Match Play",
  FOURBALL: "Best Ball",
  FOURSOMES: "Foursomes",
  SCRAMBLE: "Scramble",
  ALT_SHOT: "Alternate Shot",
};

export const SCORING_FORMAT_LABEL: Record<string, string> = {
  MATCH_PLAY: "Match Play",
  NASSAU: "Nassau",
  HI_LO: "Hi-Lo",
  STROKE: "Stroke Play",
};

export function teamFormatLabel(teamFormat: string): string {
  return TEAM_FORMAT_LABEL[teamFormat] ?? teamFormat;
}

export function scoringFormatLabel(scoringFormat: string): string {
  return SCORING_FORMAT_LABEL[scoringFormat] ?? scoringFormat;
}

/** "Best Ball · Nassau", or just "Match Play" for a singles match-play
 *  round rather than the same two words twice. */
export function roundFormatLine(teamFormat: string, scoringFormat: string): string {
  const team = teamFormatLabel(teamFormat);
  const scoring = scoringFormatLabel(scoringFormat);
  return team === scoring ? team : `${team} · ${scoring}`;
}
