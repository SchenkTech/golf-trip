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
  /** Whether uploading a photo (Photos.tsx) needs docs/DECISIONS.md #6's
   *  join code -- same field MatchDetail already exposes for score entry,
   *  just not previously read anywhere on this type. */
  requiresCode: boolean;
  /** Whether Photos.tsx and its More-menu link are reachable at all right
   *  now -- an admin-only switch (Admin.tsx), off between trips. */
  photosEnabled: boolean;
  /** Whether the album is currently taking new uploads -- independent of
   *  photosEnabled, so last year's photos can stay browsable year-round
   *  while new uploads are closed outside the trip itself. Meaningless
   *  when photosEnabled is false. */
  photosUploadEnabled: boolean;
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
  /** Null until someone's uploaded one (Teams.tsx, or Admin) -- see
   *  schema.ts's note on player.photoUpdatedAt for the cache-busting
   *  `?v=` this already has baked in. */
  photoUrl: string | null;
  /** See docs/SPEC.md's Teams section -- this event's matches, and every
   *  decided match across every year (live events plus any historical
   *  year with real match detail). */
  record: { weekend: PlayerRecord; allTime: PlayerRecord };
}

export interface EventPhoto {
  id: string;
  url: string;
  uploadedByName: string | null;
  createdAt: number;
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
  /** Real-money side bets on this round, admin-entered -- see schema.ts's
   *  note on payoutLine. Usually empty; most rounds have none. */
  payoutLines: PayoutLine[];
}

export interface PayoutLine {
  id: string;
  label: string;
  cost: number;
  payout: number;
}

export interface NamedPlayer {
  playerId: string;
  name: string;
}

export interface NetLeaderGroup {
  net: number;
  leaders: NamedPlayer[];
}

export interface BestBallLeaderGroup {
  net: number;
  leaders: { matchId: string; side: "RED" | "BLUE"; players: NamedPlayer[] }[];
}

/** Who's currently leading each of a round's usual net-score pots --
 *  read-only, computed fresh server-side (apps/api's lib/payoutLeaders.ts)
 *  every time this is fetched, never attached to a specific PayoutLine
 *  since a round's own payout lines are free text (docs/DECISIONS.md
 *  #12). Any of the four can be null -- nobody's finished that stretch,
 *  or no matches exist on the round yet. */
export interface PayoutLeaders {
  front9: NetLeaderGroup | null;
  back9: NetLeaderGroup | null;
  overall: NetLeaderGroup | null;
  bestBall: BestBallLeaderGroup | null;
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

/** EventListItem plus the join code and photo toggles -- only ever
 *  returned from the admin route (see routes/admin.ts's GET /events),
 *  never the public one. */
export interface AdminEvent extends EventListItem {
  joinCode: string | null;
  photosEnabled: boolean;
  photosUploadEnabled: boolean;
  /** The trip's whole pool, in dollars -- null until an admin sets one.
   *  See schema.ts's note on payoutLine for how it's divided. */
  totalCost: number | null;
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
  teams: (eventId: string) => get<{ teams: TeamRoster[] }>(`/api/events/${eventId}/teams`),
  verifyCode: (eventId: string, code: string) =>
    post<{ ok: boolean }>(`/api/events/${eventId}/verify-code`, { code }),

  photos: (eventId: string) => get<{ photos: EventPhoto[] }>(`/api/events/${eventId}/photos`),
  // multipart/form-data, not JSON -- an upload gets its own fetch instead
  // of post()'s JSON.stringify body. Same shape as uploadPlayerPhoto below.
  uploadPhoto: async (eventId: string, file: File, uploadedByName: string | null, code: string | null) => {
    const form = new FormData();
    form.set("photo", file);
    if (uploadedByName) form.set("name", uploadedByName);
    if (code) form.set("code", code);
    const res = await fetch(`/api/events/${eventId}/photos`, { method: "POST", body: form });
    if (!res.ok) throw new Error(`/api/events/${eventId}/photos -> HTTP ${res.status}`);
    return res.json() as Promise<EventPhoto>;
  },

  uploadPlayerPhoto: async (playerId: string, file: File) => {
    const form = new FormData();
    form.set("photo", file);
    const res = await fetch(`/api/players/${playerId}/photo`, { method: "POST", body: form });
    if (!res.ok) throw new Error(`/api/players/${playerId}/photo -> HTTP ${res.status}`);
    return res.json() as Promise<{ photoUrl: string }>;
  },

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
  adminDeletePlayerPhoto: (playerId: string) => del<{ ok: true }>(`/api/admin/players/${playerId}/photo`),
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
    body: Partial<{
      name: string;
      startDate: string;
      endDate: string;
      logoUrl: string | null;
      joinCode: string | null;
      photosEnabled: boolean;
      photosUploadEnabled: boolean;
      totalCost: number | null;
    }>,
  ) => patch<{ ok: true }>(`/api/admin/events/${eventId}`, body),
  adminDeleteEvent: (eventId: string) => del<{ ok: true }>(`/api/admin/events/${eventId}`),
  adminActivity: (eventId: string) => get<{ activity: MatchActivity[] }>(`/api/admin/events/${eventId}/activity`),

  adminCreatePayoutLine: (body: { roundId: string; label: string; cost: number; payout: number }) =>
    post<{ ok: true; id: string }>("/api/admin/payouts", body),
  adminUpdatePayoutLine: (lineId: string, body: Partial<{ label: string; cost: number; payout: number }>) =>
    patch<{ ok: true }>(`/api/admin/payouts/${lineId}`, body),
  adminMovePayoutLine: (lineId: string, direction: "up" | "down") =>
    post<{ ok: true }>(`/api/admin/payouts/${lineId}/move`, { direction }),
  adminDeletePayoutLine: (lineId: string) => del<{ ok: true }>(`/api/admin/payouts/${lineId}`),
  adminPayoutLeaders: (roundId: string) => get<PayoutLeaders>(`/api/admin/rounds/${roundId}/payout-leaders`),

  // Unlike photos() above, this lists everything on file regardless of
  // photosEnabled -- admin still needs to see and delete photos between
  // trips (routes/admin.ts).
  adminPhotos: (eventId: string) => get<{ photos: EventPhoto[] }>(`/api/admin/events/${eventId}/photos`),
  adminDeletePhoto: (eventId: string, photoId: string) =>
    del<{ ok: true }>(`/api/admin/events/${eventId}/photos/${photoId}`),

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
