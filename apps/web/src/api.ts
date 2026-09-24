/** Wire types for the two endpoints the Board renders. Kept minimal and
 *  hand-written here rather than shared with apps/api -- the frontend only
 *  needs to describe what it actually reads off the wire. */

export interface EventAward {
  id: string;
  name: string;
  /** "MANUAL" for an award an admin fills in, or one of the rules in
   *  apps/api's lib/awards.ts for one that works itself out from play. The
   *  Board renders both the same way -- the difference is only in where the
   *  holder came from. */
  rule: string;
  /** Null when not yet decided -- the Board shows "—" in that case, with
   *  `reason` ("Teams are level", "4.5 pts, most on Team Red") as the
   *  explanation. */
  holderName: string | null;
  reason: string | null;
}

export interface EventSummary {
  id: string;
  name: string;
  year: number;
  startDate: string;
  endDate: string;
  logoUrl: string | null;
  pointsAvailable: number;
  /** Points no decided segment/match has already claimed -- what a
   *  comeback is still playing for, distinct from pointsAvailable (which
   *  never shrinks). See docs/SPEC.md's Board section. */
  pointsRemaining: number;
  teams: {
    id: string;
    name: string;
    color: string;
    logoUrl: string | null;
    points: number;
    playerCount: number;
  }[];
  /** Enabled awards only -- see schema.ts's note on `award`. */
  awards: EventAward[];
}

export interface ScoredMatchPlayer {
  playerId: string;
  side: "RED" | "BLUE";
  name: string;
}

export interface Segment {
  name: string;
  points: { red: number; blue: number };
  standing: string;
  holesPlayed: number;
}

export interface ScoredMatch {
  matchId: string;
  players: ScoredMatchPlayer[];
  points: { red: number; blue: number };
  segments: Segment[];
  standing: string;
  decided: boolean;
  holesPlayed: number;
}

export interface EventRound {
  id: string;
  date: string;
  teeTime: string | null;
  scoringFormat: string;
  teamFormat: string;
  courseName: string;
  teeColor: string;
  matches: ScoredMatch[];
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res.json();
}

export interface MatchHole {
  number: number;
  par: number;
  strokeIndex: number;
  yards: number | null;
}

export interface MatchDetailPlayer {
  playerId: string;
  side: "RED" | "BLUE";
  name: string;
  strokesReceived: number;
}

export interface ExistingScore {
  playerId: string;
  holeNumber: number;
  gross: number | null;
  enteredBy: string;
  enteredAt: number;
}

/** One proposed hole score from a scorecard photo -- not yet written
 *  anywhere. playerId is null when the name on the card didn't match
 *  anyone in this match closely enough to guess; the review screen is
 *  where a person resolves that, same as they'd correct a misread
 *  number. */
export interface OcrReading {
  playerName: string;
  playerId: string | null;
  holeNumber: number;
  gross: number | null;
}

export interface ScorecardOcrResult {
  readings: OcrReading[];
  /** The reader's own one-line note on anything it wasn't sure about, or
   *  null. Shown as-is; never acted on. */
  note: string | null;
  roster: { playerId: string; name: string }[];
}

export interface MatchDetail extends ScoredMatch {
  roundId: string;
  eventId: string;
  requiresCode: boolean;
  courseName: string;
  teeColor: string;
  teamFormat: string;
  scoringFormat: string;
  holes: MatchHole[];
  // Overrides ScoredMatch's narrower player shape -- this endpoint also
  // returns strokesReceived, which the Enter screen needs to compute net
  // scores client-side. Valid override: MatchDetailPlayer is still
  // assignable to ScoredMatchPlayer, it just carries one more field.
  players: MatchDetailPlayer[];
  scores: ExistingScore[];
  /** A UI nudge (docs/SPEC.md), not a lock -- null means nobody's been
   *  nominated. */
  designatedScorerId: string | null;
  designatedScorerName: string | null;
}

export interface PlayerRecord {
  w: number;
  l: number;
  h: number;
}

export interface TeamMember {
  playerId: string;
  name: string;
  handicapIndex: number;
  isCaptain: boolean;
  /** See docs/SPEC.md's Teams section -- this event's matches, and every
   *  decided match across every year (live events plus any historical
   *  year with real match detail). */
  record: { weekend: PlayerRecord; allTime: PlayerRecord };
}

export interface TeamRoster {
  id: string;
  name: string;
  color: string;
  logoUrl: string | null;
  members: TeamMember[];
}

export interface AdminRound {
  id: string;
  date: string;
  teeTime: string | null;
  teeSetId: string;
  courseName: string;
  teeColor: string;
  scoringFormat: string;
  teamFormat: string;
  /** The stored override, or null when this round just uses the format's
   *  natural point value (see apps/api's schema.ts). */
  pointsPerMatch: number | null;
  /** What @gc/scoring would use if pointsPerMatch were null -- shown so the
   *  field always displays a real number, never blank. */
  defaultPointsPerMatch: number;
  /** Per-segment point values (Nassau: [front9, back9, overall]) when the
   *  real split isn't an even scale of pointsPerMatch -- see schema.ts's
   *  note on round.segmentPoints. Null means "scale evenly." */
  segmentPoints: number[] | null;
}

export interface AdminTeeSet {
  id: string;
  color: string;
  rating: number;
  slope: number;
  courseId: string;
  courseName: string;
}

export interface AdminMatchPlayer {
  playerId: string;
  name: string;
  side: "RED" | "BLUE";
  strokesReceived: number;
}

export interface AdminMatch {
  id: string;
  designatedScorerId: string | null;
  designatedScorerName: string | null;
  players: AdminMatchPlayer[];
}

export interface QuickRule {
  id: string;
  title: string;
  body: string;
}

export interface HistoricalPlayerScore {
  playerId: string;
  name: string;
  rounds: { roundNumber: number; gross: number; net: number }[];
  avgGross: number;
  avgNet: number;
}

export interface HistoricalMatchSide {
  side: string;
  players: string[];
  points: number;
}

/** A real match result for a historical year -- see apps/api's schema.ts
 *  on historicalMatch. front9/back9/overallWinner are a side value (e.g.
 *  side label of that year) or "TIE"; points on each side are already
 *  derived from those. */
export interface HistoricalMatch {
  matchNumber: number;
  sides: HistoricalMatchSide[];
  front9Winner: string;
  back9Winner: string;
  overallWinner: string;
}

/** A year that doesn't fit the event/round/match model -- see
 *  apps/api's schema.ts on historicalYear for why: only round-level
 *  gross/net scores exist for these years, no hole-by-hole data to build
 *  real matches from. `matches` is empty for a round with no real match
 *  records (only 2026 has them so far). */
export interface HistoricalYear {
  year: number;
  name: string;
  rounds: { roundNumber: number; courseName: string; matches: HistoricalMatch[] }[];
  players: HistoricalPlayerScore[];
  /** A side value (that year's own label for a side) when the winner is known but no
   *  match-by-match detail has been seeded yet -- null once real matches
   *  exist (the winner is derived from those instead) or if no result is
   *  known at all. */
  winner: string | null;
  /** The declared final score for such a year, if the group remembers one:
   *  winnerPoints belongs to `winner`. Null when nobody has said. */
  winnerPoints: number | null;
  loserPoints: number | null;
}

export interface EventListItem {
  id: string;
  name: string;
  year: number;
  startDate: string;
  endDate: string;
  logoUrl: string | null;
}

/** EventListItem plus the join code -- only ever returned from the admin
 *  route (see routes/admin.ts's GET /events), never the public one. */
export interface AdminEvent extends EventListItem {
  joinCode: string | null;
}

export interface AdminAward {
  id: string;
  name: string;
  enabled: boolean;
  /** Which rule decides this award -- "MANUAL", or a derived rule from
   *  apps/api's lib/awards.ts. holderId/reason below are only read when
   *  it's MANUAL. */
  rule: string;
  holderId: string | null;
  holderName: string | null;
  reason: string | null;
}

/** Every rule an award can be set to, with the label Admin's picker shows.
 *  The values are apps/api's AWARD_RULES (lib/awards.ts) and have to match
 *  it exactly -- the server rejects anything else. The labels are copy, and
 *  live here with the screen that shows them. */
export const AWARD_RULE_OPTIONS: { value: string; label: string }[] = [
  { value: "MANUAL", label: "Set by hand" },
  { value: "LEAD_TEAM_MOST_POINTS", label: "Most points on the leading team" },
  { value: "TRAIL_TEAM_MOST_POINTS", label: "Most points on the trailing team" },
  { value: "TRAIL_TEAM_FEWEST_POINTS", label: "Fewest points on the trailing team" },
  { value: "MOST_POINTS", label: "Most points overall" },
  { value: "FEWEST_POINTS", label: "Fewest points overall" },
  { value: "MOST_BIRDIES", label: "Most birdies" },
];

/** One player's all-time line -- see apps/api's lib/stats.ts for which
 *  years contribute what. avgGross/avgNet are null for someone with no
 *  complete personal card on record, which is not the same as zero. */
export interface AllTimePlayer {
  playerId: string;
  name: string;
  record: { w: number; l: number; h: number };
  points: number;
  pointsByFormat: Record<string, number>;
  /** Points the opposition took in those same matches. Won + lost is what
   *  was on the table in the matches this player played. */
  pointsLostByFormat: Record<string, number>;
  rounds: number;
  avgGross: number | null;
  avgNet: number | null;
}

export interface AllTimeStats {
  /** Column order for the points-by-format table -- only formats someone
   *  has actually scored at. */
  formats: string[];
  players: AllTimePlayer[];
}

export interface MatchActivity {
  matchId: string;
  label: string;
  courseName: string;
  standing: string;
  holesPlayed: number;
  lastEnteredAt: string;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res.json();
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res.json();
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(path, { method: "DELETE" });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res.json();
}

export const api = {
  history: () => get<{ years: HistoricalYear[] }>("/api/history"),
  allTime: () => get<AllTimeStats>("/api/history/all-time"),
  currentEvent: () => get<EventSummary>("/api/events/current"),
  event: (eventId: string) => get<EventSummary>(`/api/events/${eventId}`),
  events: () => get<{ events: EventListItem[] }>("/api/events"),
  rounds: (eventId: string) => get<{ rounds: EventRound[] }>(`/api/events/${eventId}/rounds`),
  match: (matchId: string) => get<MatchDetail>(`/api/matches/${matchId}`),
  /** `image` is a data URL -- the one encoding a File/Blob, a Cloudflare
   *  Worker's fetch and a Node fetch all agree on without a multipart
   *  dependency. See routes/matches.ts's POST /:id/scorecard-ocr. */
  scorecardOcr: (matchId: string, image: string, code?: string) =>
    post<ScorecardOcrResult>(`/api/matches/${matchId}/scorecard-ocr`, { image, code }),
  teams: (eventId: string) => get<{ teams: TeamRoster[] }>(`/api/events/${eventId}/teams`),
  verifyCode: (eventId: string, code: string) =>
    post<{ ok: boolean }>(`/api/events/${eventId}/verify-code`, { code }),

  // Admin -- gated server-side by Cloudflare Access + ADMIN_EMAILS
  // (src/lib/adminAuth.ts), not by anything in this client.
  adminWhoami: () => get<{ email: string | undefined }>("/api/admin/whoami"),
  adminRenamePlayer: (playerId: string, body: { name?: string; nickname?: string }) =>
    patch<{ ok: true }>(`/api/admin/players/${playerId}`, body),
  adminSetHandicap: (teamId: string, playerId: string, handicapIndex: number) =>
    patch<{ ok: true }>(`/api/admin/team-members/${teamId}/${playerId}`, { handicapIndex }),
  adminMovePlayer: (eventId: string, playerId: string, toTeamId: string) =>
    post<{ ok: true }>(`/api/admin/teams/${eventId}/move-player`, { playerId, toTeamId }),
  adminAddPlayer: (teamId: string, body: { name: string; nickname?: string; handicapIndex?: number }) =>
    post<{ ok: true; playerId: string }>(`/api/admin/teams/${teamId}/add-player`, body),
  adminRemovePlayer: (teamId: string, playerId: string) =>
    del<{ ok: true }>(`/api/admin/teams/${teamId}/players/${playerId}`),
  adminRounds: (eventId: string) => get<{ rounds: AdminRound[] }>(`/api/admin/rounds/${eventId}`),
  adminCreateRound: (body: {
    eventId: string;
    teeSetId: string;
    date: string;
    teeTime?: string;
    scoringFormat: string;
    teamFormat: string;
    pointsPerMatch?: number | null;
  }) => post<{ ok: true; roundId: string }>("/api/admin/rounds", body),
  adminUpdateRound: (
    roundId: string,
    body: Partial<{
      date: string;
      teeTime: string | null;
      teeSetId: string;
      scoringFormat: string;
      teamFormat: string;
      pointsPerMatch: number | null;
      segmentPoints: number[] | null;
    }>,
  ) => patch<{ ok: true }>(`/api/admin/rounds/${roundId}`, body),
  adminSetPointsPerMatch: (roundId: string, pointsPerMatch: number | null) =>
    patch<{ ok: true }>(`/api/admin/rounds/${roundId}`, { pointsPerMatch }),
  adminDeleteRound: (roundId: string) => del<{ ok: true }>(`/api/admin/rounds/${roundId}`),
  adminClearMatchScores: (matchId: string) => del<{ ok: true }>(`/api/admin/matches/${matchId}/scores`),
  adminClearEventScores: (eventId: string) => del<{ ok: true; cleared: number }>(`/api/admin/events/${eventId}/scores`),

  adminEvents: () => get<{ events: AdminEvent[] }>("/api/admin/events"),
  adminCreateEvent: (body: {
    name: string;
    year: number;
    startDate: string;
    endDate: string;
    logoUrl?: string;
    joinCode?: string;
    teams: { name: string; color: "RED" | "BLUE"; logoUrl?: string }[];
    copyFromEventId?: string;
  }) => post<{ ok: true; eventId: string }>("/api/admin/events", body),
  adminUpdateEvent: (
    eventId: string,
    body: Partial<{ name: string; startDate: string; endDate: string; logoUrl: string | null; joinCode: string | null }>,
  ) => patch<{ ok: true }>(`/api/admin/events/${eventId}`, body),
  adminDeleteEvent: (eventId: string) => del<{ ok: true }>(`/api/admin/events/${eventId}`),
  adminActivity: (eventId: string) => get<{ activity: MatchActivity[] }>(`/api/admin/events/${eventId}/activity`),

  adminAwards: (eventId: string) => get<{ awards: AdminAward[] }>(`/api/admin/events/${eventId}/awards`),
  adminCreateAward: (eventId: string, name: string) =>
    post<{ ok: true; id: string }>(`/api/admin/events/${eventId}/awards`, { name }),
  adminUpdateAward: (
    awardId: string,
    body: Partial<{ name: string; enabled: boolean; rule: string; holderId: string | null; reason: string | null }>,
  ) => patch<{ ok: true }>(`/api/admin/awards/${awardId}`, body),
  adminDeleteAward: (awardId: string) => del<{ ok: true }>(`/api/admin/awards/${awardId}`),

  adminCourses: () => get<{ teeSets: AdminTeeSet[] }>("/api/admin/courses"),
  adminCreateCourse: (body: {
    name: string;
    location?: string;
    color: string;
    rating: number;
    slope: number;
    holes: { number: number; par: number; strokeIndex: number; yards?: number }[];
  }) => post<{ ok: true; teeSetId: string }>("/api/admin/courses", body),

  adminMatches: (roundId: string) => get<{ matches: AdminMatch[] }>(`/api/admin/matches/${roundId}`),
  adminCreateMatch: (body: {
    roundId: string;
    players: { playerId: string; side: "RED" | "BLUE"; strokesReceived?: number }[];
    designatedScorerId?: string | null;
  }) => post<{ ok: true; matchId: string }>("/api/admin/matches", body),
  adminDeleteMatch: (matchId: string) => del<{ ok: true }>(`/api/admin/matches/${matchId}`),
  adminSetDesignatedScorer: (matchId: string, designatedScorerId: string | null) =>
    patch<{ ok: true }>(`/api/admin/matches/${matchId}`, { designatedScorerId }),
  adminSetScores: (matchId: string, scores: { playerId: string; holeNumber: number; gross: number | null }[]) =>
    post<{ ok: true }>(`/api/admin/matches/${matchId}/scores`, { scores }),

  rules: () => get<{ rules: QuickRule[] }>("/api/rules"),
  adminCreateRule: (body: { title: string; body: string }) => post<{ ok: true; id: string }>("/api/admin/rules", body),
  adminUpdateRule: (ruleId: string, body: Partial<{ title: string; body: string }>) =>
    patch<{ ok: true }>(`/api/admin/rules/${ruleId}`, body),
  adminMoveRule: (ruleId: string, direction: "up" | "down") =>
    post<{ ok: true }>(`/api/admin/rules/${ruleId}/move`, { direction }),
  adminDeleteRule: (ruleId: string) => del<{ ok: true }>(`/api/admin/rules/${ruleId}`),
};
