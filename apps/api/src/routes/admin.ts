import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import { env } from "hono/adapter";
import { pointsAvailable } from "@gc/scoring";
import type { ScoringFormat, TeamFormat } from "@gc/scoring";
import { requireAdmin } from "../lib/adminAuth.ts";
import { verifySession } from "../lib/session.ts";
import { loadPlayerLabels } from "../lib/players.ts";
import { scoreMatchRows, strokeIndexesFor, segmentPointsFor } from "../lib/score.ts";
import { asBatch } from "../lib/batch.ts";
import { isAwardRule } from "../lib/awards.ts";
import * as schema from "../db/schema.ts";
import type { AppEnv } from "../types.ts";

export const admin = new Hono<AppEnv>();

admin.use("*", requireAdmin);

/** Turns a free-text name into a stable, readable id fragment -- "Pine Valley
 *  Dunes" -> "pine-valley-dunes". Shared by every admin create-endpoint below
 *  that mints an id from a name, so ids in this app read the same way
 *  whether they came from a seed script or from someone typing into a
 *  form. */
function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function uniqueId(prefix: string, name: string, exists: (id: string) => Promise<boolean>): Promise<string> {
  const slug = slugify(name);
  let id = `${prefix}-${slug}`;
  let n = 2;
  while (await exists(id)) id = `${prefix}-${slug}-${n++}`;
  return id;
}

admin.get("/whoami", async (c) => {
  const token = getCookie(c, "gc_session");
  const email = token ? await verifySession(token, env(c).SESSION_SECRET) : null;
  return c.json({ email: email ?? undefined });
});

/** Rename a player or fix a nickname -- "Tap a name to fix a spelling," per
 *  the roster screens. Global on `player`, not per-event, matching the
 *  schema's own note that a player is a person across every year. */
admin.patch("/players/:playerId", async (c) => {
  const db = c.get("db");
  const playerId = c.req.param("playerId");
  const body = await c.req.json<{ name?: string; nickname?: string }>();

  const existing = await db.query.player.findFirst({ where: eq(schema.player.id, playerId) });
  if (!existing) return c.json({ error: "player not found" }, 404);
  if (body.name !== undefined && !body.name.trim()) return c.json({ error: "name required" }, 400);

  await db
    .update(schema.player)
    .set({
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.nickname !== undefined ? { nickname: body.nickname.trim() || null } : {}),
    })
    .where(eq(schema.player.id, playerId));

  return c.json({ ok: true });
});

/** Handicap index is per (team, player) -- see schema.ts's note on
 *  team_member -- since it's carried into one specific trip, not the
 *  person forever. */
admin.patch("/team-members/:teamId/:playerId", async (c) => {
  const db = c.get("db");
  const { teamId, playerId } = c.req.param();
  const body = await c.req.json<{ handicapIndex?: number }>();

  if (body.handicapIndex === undefined || !Number.isFinite(body.handicapIndex)) {
    return c.json({ error: "handicapIndex required" }, 400);
  }

  const existing = await db.query.teamMember.findFirst({
    where: and(eq(schema.teamMember.teamId, teamId), eq(schema.teamMember.playerId, playerId)),
  });
  if (!existing) return c.json({ error: "not on that roster" }, 404);

  await db
    .update(schema.teamMember)
    .set({ handicapIndex: body.handicapIndex })
    .where(and(eq(schema.teamMember.teamId, teamId), eq(schema.teamMember.playerId, playerId)));

  return c.json({ ok: true });
});

/** Move a player to the other side. team_member's primary key is
 *  (teamId, playerId) -- see schema.ts -- so "moving" a row whose team is
 *  part of its own identity means delete-then-insert, not an update; the
 *  handicap carries over unchanged since a side swap doesn't touch it. */
admin.post("/teams/:eventId/move-player", async (c) => {
  const db = c.get("db");
  const eventId = c.req.param("eventId");
  const body = await c.req.json<{ playerId: string; toTeamId: string }>();
  if (!body?.playerId || !body?.toTeamId) return c.json({ error: "playerId and toTeamId required" }, 400);

  const eventTeams = await db.query.team.findMany({ where: eq(schema.team.eventId, eventId) });
  const toTeam = eventTeams.find((t) => t.id === body.toTeamId);
  if (!toTeam) return c.json({ error: "toTeamId is not a team in this event" }, 400);

  const current = await db.query.teamMember.findFirst({
    where: eq(schema.teamMember.playerId, body.playerId),
    // A player is only ever on one team within a given event's roster in
    // practice, but this table has no eventId column of its own -- narrow
    // to this event's teams explicitly rather than trust that.
  });
  const fromRow =
    current && eventTeams.some((t) => t.id === current.teamId)
      ? current
      : (
          await db.query.teamMember.findMany({ where: eq(schema.teamMember.playerId, body.playerId) })
        ).find((m) => eventTeams.some((t) => t.id === m.teamId));
  if (!fromRow) return c.json({ error: "player is not on a roster in this event" }, 404);
  if (fromRow.teamId === body.toTeamId) return c.json({ ok: true }); // already there

  await db.batch([
    db
      .delete(schema.teamMember)
      .where(and(eq(schema.teamMember.teamId, fromRow.teamId), eq(schema.teamMember.playerId, body.playerId))),
    db.insert(schema.teamMember).values({
      teamId: body.toTeamId,
      playerId: body.playerId,
      handicapIndex: fromRow.handicapIndex,
    }),
  ]);

  return c.json({ ok: true });
});

/** New player, straight onto a roster -- there's no separate "create a
 *  person" step in the UI, matching how small this roster actually is. */
admin.post("/teams/:teamId/add-player", async (c) => {
  const db = c.get("db");
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ name: string; nickname?: string; handicapIndex?: number }>();

  if (!body?.name?.trim()) return c.json({ error: "name required" }, 400);

  const team = await db.query.team.findFirst({ where: eq(schema.team.id, teamId) });
  if (!team) return c.json({ error: "team not found" }, 404);

  const slug = body.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  let playerId = `p-${slug}`;
  let n = 2;
  while (await db.query.player.findFirst({ where: eq(schema.player.id, playerId) })) {
    playerId = `p-${slug}-${n++}`;
  }

  await db.batch([
    db.insert(schema.player).values({
      id: playerId,
      name: body.name.trim(),
      nickname: body.nickname?.trim() || null,
      createdAt: new Date(),
    }),
    db.insert(schema.teamMember).values({
      teamId,
      playerId,
      handicapIndex: body.handicapIndex ?? 0,
    }),
  ]);

  return c.json({ ok: true, playerId });
});

/** Removes a player from this roster only -- see schema.ts: the player
 *  record itself (and any hole_score history elsewhere) is untouched, so
 *  this is safe to undo by adding them back. */
admin.delete("/teams/:teamId/players/:playerId", async (c) => {
  const db = c.get("db");
  const { teamId, playerId } = c.req.param();

  const existing = await db.query.teamMember.findFirst({
    where: and(eq(schema.teamMember.teamId, teamId), eq(schema.teamMember.playerId, playerId)),
  });
  if (!existing) return c.json({ error: "not on that roster" }, 404);

  await db
    .delete(schema.teamMember)
    .where(and(eq(schema.teamMember.teamId, teamId), eq(schema.teamMember.playerId, playerId)));

  return c.json({ ok: true });
});

/** Every round's scoring setup, for the Event setup screen. `pointsPerMatch`
 *  is the stored override (see schema.ts); `defaultPointsPerMatch` is what
 *  @gc/scoring would use if it were null, shown so the admin UI can display
 *  a real number in the field even before anyone has explicitly set one.
 *  `teeSetId` is included (unlike the public /events/:id/rounds route)
 *  because the round-editor needs it to preselect the course dropdown. */
admin.get("/rounds/:eventId", async (c) => {
  const db = c.get("db");
  const eventId = c.req.param("eventId");

  const rows = await db.query.round.findMany({
    where: eq(schema.round.eventId, eventId),
    with: { teeSet: { with: { course: true } } },
  });
  rows.sort((a, b) => a.date.localeCompare(b.date));

  return c.json({
    rounds: rows.map((r) => ({
      id: r.id,
      date: r.date,
      teeTime: r.teeTime,
      teeSetId: r.teeSetId,
      courseName: r.teeSet.course.name,
      teeColor: r.teeSet.color,
      scoringFormat: r.scoringFormat,
      teamFormat: r.teamFormat,
      pointsPerMatch: r.pointsPerMatch,
      defaultPointsPerMatch: pointsAvailable(r.scoringFormat as ScoringFormat),
      segmentPoints: segmentPointsFor(r.segmentPoints),
    })),
  });
});

/** A new round in an existing event -- one weekend's day of golf. Matchups
 *  are added afterwards through their own endpoint once the round exists to
 *  hang them off of. */
admin.post("/rounds", async (c) => {
  const db = c.get("db");
  const body = await c.req.json<{
    eventId: string;
    teeSetId: string;
    date: string;
    teeTime?: string;
    scoringFormat: string;
    teamFormat: string;
    pointsPerMatch?: number | null;
  }>();

  if (!body?.eventId || !body?.teeSetId || !body?.date || !body?.scoringFormat || !body?.teamFormat) {
    return c.json({ error: "eventId, teeSetId, date, scoringFormat and teamFormat are required" }, 400);
  }
  const event = await db.query.event.findFirst({ where: eq(schema.event.id, body.eventId) });
  if (!event) return c.json({ error: "event not found" }, 404);
  const teeSet = await db.query.teeSet.findFirst({ where: eq(schema.teeSet.id, body.teeSetId) });
  if (!teeSet) return c.json({ error: "tee set not found" }, 404);
  if (body.pointsPerMatch != null && !Number.isFinite(body.pointsPerMatch)) {
    return c.json({ error: "pointsPerMatch must be a number or null" }, 400);
  }

  const existing = await db.query.round.findMany({ where: eq(schema.round.eventId, body.eventId) });
  const roundId = `r-${body.eventId}-${existing.length + 1}`;

  await db.insert(schema.round).values({
    id: roundId,
    eventId: body.eventId,
    teeSetId: body.teeSetId,
    date: body.date,
    teeTime: body.teeTime?.trim() || null,
    scoringFormat: body.scoringFormat,
    teamFormat: body.teamFormat,
    pointsPerMatch: body.pointsPerMatch ?? null,
  });

  return c.json({ ok: true, roundId });
});

/** Edits any field of an existing round -- extended from a points-only patch
 *  since there's no reason "change the date" and "change the points
 *  override" should be different endpoints. `segmentPoints`, when given, is
 *  an array of per-segment point values (Nassau: [front9, back9, overall])
 *  -- see schema.ts's note on round.segmentPoints for why an even scale of
 *  pointsPerMatch isn't always the real split. Pass null to clear it back
 *  to an even scale. */
admin.patch("/rounds/:roundId", async (c) => {
  const db = c.get("db");
  const roundId = c.req.param("roundId");
  const body = await c.req.json<{
    date?: string;
    teeTime?: string | null;
    teeSetId?: string;
    scoringFormat?: string;
    teamFormat?: string;
    pointsPerMatch?: number | null;
    segmentPoints?: number[] | null;
  }>();

  const existing = await db.query.round.findFirst({ where: eq(schema.round.id, roundId) });
  if (!existing) return c.json({ error: "round not found" }, 404);

  if (body.pointsPerMatch !== undefined && body.pointsPerMatch !== null && !Number.isFinite(body.pointsPerMatch)) {
    return c.json({ error: "pointsPerMatch must be a number or null" }, 400);
  }
  if (body.segmentPoints != null && (!Array.isArray(body.segmentPoints) || !body.segmentPoints.every((n) => Number.isFinite(n)))) {
    return c.json({ error: "segmentPoints must be an array of numbers or null" }, 400);
  }
  if (body.teeSetId !== undefined) {
    const teeSet = await db.query.teeSet.findFirst({ where: eq(schema.teeSet.id, body.teeSetId) });
    if (!teeSet) return c.json({ error: "tee set not found" }, 404);
  }

  await db
    .update(schema.round)
    .set({
      ...(body.date !== undefined ? { date: body.date } : {}),
      ...(body.teeTime !== undefined ? { teeTime: body.teeTime?.trim() || null } : {}),
      ...(body.teeSetId !== undefined ? { teeSetId: body.teeSetId } : {}),
      ...(body.scoringFormat !== undefined ? { scoringFormat: body.scoringFormat } : {}),
      ...(body.teamFormat !== undefined ? { teamFormat: body.teamFormat } : {}),
      ...(body.pointsPerMatch !== undefined ? { pointsPerMatch: body.pointsPerMatch } : {}),
      ...(body.segmentPoints !== undefined ? { segmentPoints: body.segmentPoints ? JSON.stringify(body.segmentPoints) : null } : {}),
    })
    .where(eq(schema.round.id, roundId));

  return c.json({ ok: true });
});

/** Deletes a round and everything under it -- D1 has no ON DELETE CASCADE
 *  configured (see schema.ts), so this walks the chain by hand: hole
 *  scores, then match players, then matches, then the round itself. */
admin.delete("/rounds/:roundId", async (c) => {
  const db = c.get("db");
  const roundId = c.req.param("roundId");

  const existing = await db.query.round.findFirst({ where: eq(schema.round.id, roundId) });
  if (!existing) return c.json({ error: "round not found" }, 404);

  const matchRows = await db.query.match.findMany({ where: eq(schema.match.roundId, roundId) });
  await db.batch(
    asBatch([
      ...matchRows.flatMap((m) => [
        db.delete(schema.holeScore).where(eq(schema.holeScore.matchId, m.id)),
        db.delete(schema.matchPlayer).where(eq(schema.matchPlayer.matchId, m.id)),
      ]),
      ...matchRows.map((m) => db.delete(schema.match).where(eq(schema.match.id, m.id))),
      db.delete(schema.round).where(eq(schema.round.id, roundId)),
    ]),
  );

  return c.json({ ok: true });
});

/** Wipes every hole score for one match -- for testing before the real trip,
 *  or to undo a bad entry without hunting down each hole individually.
 *  Attribution rows (entered_by/entered_at) go with them; the match's own
 *  players/sides/strokes are untouched, so it's ready to re-enter right
 *  after. */
admin.delete("/matches/:matchId/scores", async (c) => {
  const db = c.get("db");
  const matchId = c.req.param("matchId");

  const existing = await db.query.match.findFirst({ where: eq(schema.match.id, matchId) });
  if (!existing) return c.json({ error: "match not found" }, 404);

  await db.delete(schema.holeScore).where(eq(schema.holeScore.matchId, matchId));

  return c.json({ ok: true });
});

/** Wipes every hole score across a whole event in one call -- "start
 *  testing over." Rounds, matches and rosters are untouched, only the
 *  entered scores go. */
admin.delete("/events/:eventId/scores", async (c) => {
  const db = c.get("db");
  const eventId = c.req.param("eventId");

  const roundRows = await db.query.round.findMany({
    where: eq(schema.round.eventId, eventId),
    with: { matches: true },
  });
  const matchIds = roundRows.flatMap((r) => r.matches.map((m) => m.id));
  if (matchIds.length === 0) return c.json({ ok: true, cleared: 0 });

  await db.batch(asBatch(matchIds.map((id) => db.delete(schema.holeScore).where(eq(schema.holeScore.matchId, id)))));

  return c.json({ ok: true, cleared: matchIds.length });
});

// ---------------------------------------------------------------- events

/** Every trip on file, for the Admin event picker -- same shape as the
 *  public GET /events but this one is behind the admin gate for no reason
 *  other than "the Admin screen's own data loads through its own path,"
 *  matching every other admin.get in this file. */
admin.get("/events", async (c) => {
  const db = c.get("db");
  const all = await db.query.event.findMany();
  all.sort((a, b) => b.year - a.year);
  return c.json({
    events: all.map((e) => ({
      id: e.id,
      name: e.name,
      year: e.year,
      startDate: e.startDate,
      endDate: e.endDate,
      logoUrl: e.logoUrl,
      // Admin-only field -- the public /events list never includes this
      // (see events.ts's verify-code route, the only place a code should
      // ever be checked from the outside).
      joinCode: e.joinCode,
    })),
  });
});

/** A new trip, plus its two sides in the same call -- see schema.ts's note
 *  on team.color: every event needs exactly one RED and one BLUE team to be
 *  useful for anything (Board, Matches, Teams all assume both exist), so
 *  there's no in-between state where an event exists with no teams yet.
 *  Rounds and matchups are added afterwards through their own endpoints.
 *
 *  `copyFromEventId`, when given, carries the roster (players + their last
 *  handicap, matched by team color) and the award *definitions* (name +
 *  enabled, not last year's winner) over from that event -- most of the
 *  field returns every year, and re-adding thirteen people by hand each
 *  May is exactly the friction this app exists to remove. With no source
 *  to copy from, a new event starts with zero awards -- the group decides
 *  what it actually wants tracked (docs/SPEC.md: "Ours should be the
 *  group's own awards, not a copy of theirs"), added through their own
 *  endpoint below. */
admin.post("/events", async (c) => {
  const db = c.get("db");
  const body = await c.req.json<{
    name: string;
    year: number;
    startDate: string;
    endDate: string;
    logoUrl?: string;
    joinCode?: string;
    teams: { name: string; color: "RED" | "BLUE"; logoUrl?: string }[];
    copyFromEventId?: string;
  }>();

  if (!body?.name?.trim()) return c.json({ error: "name required" }, 400);
  if (!Number.isInteger(body.year)) return c.json({ error: "year required" }, 400);
  if (!body.startDate || !body.endDate) return c.json({ error: "startDate and endDate required" }, 400);
  if (!Array.isArray(body.teams) || body.teams.length !== 2) {
    return c.json({ error: "exactly two teams required" }, 400);
  }
  const colors = new Set(body.teams.map((t) => t.color));
  if (colors.size !== 2 || !colors.has("RED") || !colors.has("BLUE")) {
    return c.json({ error: "one team must be RED and the other BLUE" }, 400);
  }
  if (body.teams.some((t) => !t.name?.trim())) return c.json({ error: "every team needs a name" }, 400);

  const eventId = `e-${body.year}`;
  if (await db.query.event.findFirst({ where: eq(schema.event.id, eventId) })) {
    return c.json({ error: `an event for ${body.year} already exists` }, 409);
  }

  let sourceTeams: (typeof schema.team.$inferSelect & { members: (typeof schema.teamMember.$inferSelect)[] })[] = [];
  let sourceAwards: (typeof schema.award.$inferSelect)[] = [];
  if (body.copyFromEventId) {
    sourceTeams = await db.query.team.findMany({
      where: eq(schema.team.eventId, body.copyFromEventId),
      with: { members: true },
    });
    sourceAwards = await db.query.award.findMany({ where: eq(schema.award.eventId, body.copyFromEventId) });
  }

  const newTeams = body.teams.map((t, i) => ({ ...t, id: `${eventId}-t${i + 1}` }));

  const rosterInserts = newTeams.flatMap((t) => {
    const source = sourceTeams.find((st) => st.color === t.color);
    if (!source) return [];
    return source.members.map((m) =>
      db.insert(schema.teamMember).values({ teamId: t.id, playerId: m.playerId, handicapIndex: m.handicapIndex }),
    );
  });

  const awardInserts = sourceAwards.map((a, i) =>
    db.insert(schema.award).values({
      id: `aw-${eventId}-${i + 1}`,
      eventId,
      name: a.name,
      enabled: a.enabled,
      // The rule carries over, last year's winner does not -- a derived
      // award has no winner to carry (events.ts works it out from this
      // year's play), and a hand-set one starts the year undecided.
      rule: a.rule,
      holderId: null,
      reason: null,
      sortOrder: a.sortOrder,
    }),
  );

  await db.batch([
    db.insert(schema.event).values({
      id: eventId,
      name: body.name.trim(),
      year: body.year,
      startDate: body.startDate,
      endDate: body.endDate,
      logoUrl: body.logoUrl?.trim() || null,
      joinCode: body.joinCode?.trim() || null,
    }),
    ...newTeams.map((t) =>
      db.insert(schema.team).values({ id: t.id, eventId, name: t.name.trim(), color: t.color, logoUrl: t.logoUrl?.trim() || null }),
    ),
    ...rosterInserts,
    ...awardInserts,
  ]);

  return c.json({ ok: true, eventId });
});

/** Deletes a trip and everything under it: matches (and their players and
 *  hole scores), rounds, teams (and their rosters), and awards. D1 has no
 *  ON DELETE CASCADE configured (see schema.ts), so this walks the chain by
 *  hand, same pattern as the round-delete endpoint above. */
admin.delete("/events/:eventId", async (c) => {
  const db = c.get("db");
  const eventId = c.req.param("eventId");

  const existing = await db.query.event.findFirst({ where: eq(schema.event.id, eventId) });
  if (!existing) return c.json({ error: "event not found" }, 404);

  const roundRows = await db.query.round.findMany({ where: eq(schema.round.eventId, eventId), with: { matches: true } });
  const matchRows = roundRows.flatMap((r) => r.matches);
  const teamRows = await db.query.team.findMany({ where: eq(schema.team.eventId, eventId) });

  await db.batch(
    asBatch([
      ...matchRows.flatMap((m) => [
        db.delete(schema.holeScore).where(eq(schema.holeScore.matchId, m.id)),
        db.delete(schema.matchPlayer).where(eq(schema.matchPlayer.matchId, m.id)),
      ]),
      ...matchRows.map((m) => db.delete(schema.match).where(eq(schema.match.id, m.id))),
      ...roundRows.map((r) => db.delete(schema.round).where(eq(schema.round.id, r.id))),
      ...teamRows.map((t) => db.delete(schema.teamMember).where(eq(schema.teamMember.teamId, t.id))),
      ...teamRows.map((t) => db.delete(schema.team).where(eq(schema.team.id, t.id))),
      db.delete(schema.award).where(eq(schema.award.eventId, eventId)),
      db.delete(schema.event).where(eq(schema.event.id, eventId)),
    ]),
  );

  return c.json({ ok: true });
});

/** Every in-progress match across the event, stalest first -- the "what
 *  needs a nudge" glance for the actual golf weekend. Only matches with at
 *  least one hole entered and not yet decided show up here; a match that
 *  hasn't started isn't stalled, it just hasn't teed off, and a decided
 *  match doesn't need anyone's attention anymore. */
admin.get("/events/:eventId/activity", async (c) => {
  const db = c.get("db");
  const eventId = c.req.param("eventId");

  const roundRows = await db.query.round.findMany({
    where: eq(schema.round.eventId, eventId),
    with: {
      matches: { with: { players: true, scores: true } },
      teeSet: { with: { course: true, holes: true } },
    },
  });
  const labels = await loadPlayerLabels(db);

  const activity = roundRows.flatMap((r) => {
    const scoringFormat = r.scoringFormat as ScoringFormat;
    const teamFormat = r.teamFormat as TeamFormat;
    const strokeIndexes = strokeIndexesFor(r.teeSet.holes);
    const segmentPoints = segmentPointsFor(r.segmentPoints);
    return r.matches
      .map((m) => {
        const scored = scoreMatchRows(m, teamFormat, scoringFormat, strokeIndexes, r.pointsPerMatch, segmentPoints);
        const enteredScores = m.scores.filter((s) => s.gross !== null);
        if (enteredScores.length === 0 || scored.decided) return null;
        const lastEnteredAt = Math.max(...m.scores.map((s) => s.enteredAt.getTime()));
        const redSide = m.players.filter((p) => p.side === "RED").map((p) => labels.get(p.playerId) ?? p.playerId).join(" & ");
        const blueSide = m.players.filter((p) => p.side === "BLUE").map((p) => labels.get(p.playerId) ?? p.playerId).join(" & ");
        return {
          matchId: m.id,
          label: `${redSide} vs ${blueSide}`,
          courseName: r.teeSet.course.name,
          standing: scored.standing,
          holesPlayed: scored.holesPlayed,
          lastEnteredAt: new Date(lastEnteredAt).toISOString(),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  });

  activity.sort((a, b) => a.lastEnteredAt.localeCompare(b.lastEnteredAt));

  return c.json({ activity });
});

/** Edits a trip's own details -- name, dates, logo, join code. Teams,
 *  rounds and matchups each have their own endpoints; this one is just the
 *  event row itself. */
admin.patch("/events/:eventId", async (c) => {
  const db = c.get("db");
  const eventId = c.req.param("eventId");
  const body = await c.req.json<{
    name?: string;
    startDate?: string;
    endDate?: string;
    logoUrl?: string | null;
    joinCode?: string | null;
  }>();

  const existing = await db.query.event.findFirst({ where: eq(schema.event.id, eventId) });
  if (!existing) return c.json({ error: "event not found" }, 404);

  await db
    .update(schema.event)
    .set({
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.startDate !== undefined ? { startDate: body.startDate } : {}),
      ...(body.endDate !== undefined ? { endDate: body.endDate } : {}),
      ...(body.logoUrl !== undefined ? { logoUrl: body.logoUrl?.trim() || null } : {}),
      ...(body.joinCode !== undefined ? { joinCode: body.joinCode?.trim() || null } : {}),
    })
    .where(eq(schema.event.id, eventId));

  return c.json({ ok: true });
});

// --------------------------------------------------------------- courses

/** Every course/tee combination on file, for the round-builder's picker --
 *  a round needs one teeSetId, and most years reuse a course already
 *  played rather than adding a new one. */
admin.get("/courses", async (c) => {
  const db = c.get("db");
  const teeSets = await db.query.teeSet.findMany({ with: { course: true } });
  return c.json({
    teeSets: teeSets.map((ts) => ({
      id: ts.id,
      color: ts.color,
      rating: ts.rating,
      slope: ts.slope,
      courseId: ts.courseId,
      courseName: ts.course.name,
    })),
  });
});

/** A new course, with its first tee set and all 18 holes, in one call --
 *  none of the three is useful without the other two, so there's no
 *  partial state a round-builder could pick from mid-creation. Adding a
 *  second tee color to an existing course isn't supported yet -- creating
 *  it as its own "course" row works fine for how small this data set is. */
admin.post("/courses", async (c) => {
  const db = c.get("db");
  const body = await c.req.json<{
    name: string;
    location?: string;
    color: string;
    rating: number;
    slope: number;
    holes: { number: number; par: number; strokeIndex: number; yards?: number }[];
  }>();

  if (!body?.name?.trim()) return c.json({ error: "course name required" }, 400);
  if (!body?.color?.trim()) return c.json({ error: "tee color required" }, 400);
  if (!Number.isFinite(body.rating) || !Number.isFinite(body.slope)) {
    return c.json({ error: "rating and slope required" }, 400);
  }
  if (!Array.isArray(body.holes) || body.holes.length !== 18) {
    return c.json({ error: "exactly 18 holes required" }, 400);
  }

  const courseId = await uniqueId("c", body.name, async (id) => !!(await db.query.course.findFirst({ where: eq(schema.course.id, id) })));
  const teeSetId = `${courseId}-${slugify(body.color)}`;

  await db.batch([
    db
      .insert(schema.course)
      .values({ id: courseId, name: body.name.trim(), location: body.location?.trim() || null }),
    db
      .insert(schema.teeSet)
      .values({ id: teeSetId, courseId, color: body.color.trim(), rating: body.rating, slope: body.slope }),
    ...body.holes.map((h) =>
      db.insert(schema.teeHole).values({
        teeSetId,
        number: h.number,
        par: h.par,
        strokeIndex: h.strokeIndex,
        yards: h.yards ?? null,
      }),
    ),
  ]);

  return c.json({ ok: true, teeSetId });
});

// ---------------------------------------------------------------- matches

/** Every match in a round, with player names for the matchups builder --
 *  reuses loadPlayerLabels rather than round-trip through the roster screen.
 *  No scores here; matchups are set up before anyone tees off. */
admin.get("/matches/:roundId", async (c) => {
  const db = c.get("db");
  const roundId = c.req.param("roundId");

  const matchRows = await db.query.match.findMany({
    where: eq(schema.match.roundId, roundId),
    with: { players: true },
  });
  const labels = await loadPlayerLabels(db);

  return c.json({
    matches: matchRows.map((m) => ({
      id: m.id,
      designatedScorerId: m.designatedScorerId,
      designatedScorerName: m.designatedScorerId ? labels.get(m.designatedScorerId) ?? m.designatedScorerId : null,
      players: m.players.map((p) => ({
        playerId: p.playerId,
        name: labels.get(p.playerId) ?? p.playerId,
        side: p.side,
        strokesReceived: p.strokesReceived,
      })),
    })),
  });
});

/** A new matchup within a round. strokesReceived is taken as given, not
 *  computed here -- see schema.ts's note on match_player.strokesReceived:
 *  it's the real trip's own handicap-allowance numbers, worked out by
 *  the group from the official calculator, not something this app derives
 *  from handicapIndex + course rating/slope on its own. designatedScorerId
 *  is the docs/SPEC.md nudge (see schema.ts's note on match) -- optional,
 *  and must be one of this match's own players. */
admin.post("/matches", async (c) => {
  const db = c.get("db");
  const body = await c.req.json<{
    roundId: string;
    players: { playerId: string; side: "RED" | "BLUE"; strokesReceived?: number }[];
    designatedScorerId?: string | null;
  }>();

  if (!body?.roundId) return c.json({ error: "roundId required" }, 400);
  if (!Array.isArray(body.players) || body.players.length < 2) {
    return c.json({ error: "at least two players required" }, 400);
  }
  const roundRow = await db.query.round.findFirst({ where: eq(schema.round.id, body.roundId) });
  if (!roundRow) return c.json({ error: "round not found" }, 404);
  const sides = new Set(body.players.map((p) => p.side));
  if (!sides.has("RED") || !sides.has("BLUE")) {
    return c.json({ error: "both sides must have at least one player" }, 400);
  }
  if (body.designatedScorerId && !body.players.some((p) => p.playerId === body.designatedScorerId)) {
    return c.json({ error: "designatedScorerId must be one of this match's players" }, 400);
  }

  const existing = await db.query.match.findMany({ where: eq(schema.match.roundId, body.roundId) });
  const matchId = `m-${body.roundId}-${existing.length + 1}`;

  await db.batch([
    db.insert(schema.match).values({ id: matchId, roundId: body.roundId, designatedScorerId: body.designatedScorerId || null }),
    ...body.players.map((p) =>
      db.insert(schema.matchPlayer).values({
        matchId,
        playerId: p.playerId,
        side: p.side,
        strokesReceived: p.strokesReceived ?? 0,
      }),
    ),
  ]);

  return c.json({ ok: true, matchId });
});

/** Sets or clears a matchup's designated scorer after the fact -- the only
 *  field on an existing match worth editing in place; everything else
 *  about a matchup (who's in it, which side) is delete-and-recreate. */
admin.patch("/matches/:matchId", async (c) => {
  const db = c.get("db");
  const matchId = c.req.param("matchId");
  const body = await c.req.json<{ designatedScorerId: string | null }>();

  const existing = await db.query.match.findFirst({ where: eq(schema.match.id, matchId), with: { players: true } });
  if (!existing) return c.json({ error: "match not found" }, 404);
  if (body.designatedScorerId && !existing.players.some((p) => p.playerId === body.designatedScorerId)) {
    return c.json({ error: "designatedScorerId must be one of this match's players" }, 400);
  }

  await db.update(schema.match).set({ designatedScorerId: body.designatedScorerId }).where(eq(schema.match.id, matchId));

  return c.json({ ok: true });
});

/** Removes a matchup entirely -- any scores already entered for it go too,
 *  same cascade the round-delete endpoint above does for a whole round. */
admin.delete("/matches/:matchId", async (c) => {
  const db = c.get("db");
  const matchId = c.req.param("matchId");

  const existing = await db.query.match.findFirst({ where: eq(schema.match.id, matchId) });
  if (!existing) return c.json({ error: "match not found" }, 404);

  await db.batch([
    db.delete(schema.holeScore).where(eq(schema.holeScore.matchId, matchId)),
    db.delete(schema.matchPlayer).where(eq(schema.matchPlayer.matchId, matchId)),
    db.delete(schema.match).where(eq(schema.match.id, matchId)),
  ]);

  return c.json({ ok: true });
});

/** Corrects one or more hole scores directly -- same upsert the public
 *  POST /matches/:id/scores does (docs/DECISIONS.md #4: the composite
 *  primary key on hole_score makes resubmitting a hole always land on the
 *  same row), but behind the admin session instead of the trip's join
 *  code, and self-attributed: entered_by is the corrected player's own id,
 *  since there's no separate "admin" player row to attribute a fix to and
 *  who physically typed a number was never the safety mechanism here.
 *  gross: null clears that one hole back to "not entered" without
 *  touching any other hole in the match. */
admin.post("/matches/:matchId/scores", async (c) => {
  const db = c.get("db");
  const matchId = c.req.param("matchId");
  const body = await c.req.json<{ scores: { playerId: string; holeNumber: number; gross: number | null }[] }>();

  if (!body?.scores?.length) return c.json({ error: "scores array required" }, 400);

  const full = await db.query.match.findFirst({ where: eq(schema.match.id, matchId), with: { players: true } });
  if (!full) return c.json({ error: "match not found" }, 404);
  const validPlayerIds = new Set(full.players.map((p) => p.playerId));

  for (const entry of body.scores) {
    if (!Number.isInteger(entry.holeNumber) || entry.holeNumber < 1 || entry.holeNumber > 18) {
      return c.json({ error: `invalid holeNumber: ${entry.holeNumber}` }, 400);
    }
    if (entry.gross !== null && (!Number.isInteger(entry.gross) || entry.gross < 1 || entry.gross > 20)) {
      return c.json({ error: `invalid gross for hole ${entry.holeNumber}: ${entry.gross}` }, 400);
    }
    if (!validPlayerIds.has(entry.playerId)) {
      return c.json({ error: `player ${entry.playerId} is not in this match` }, 400);
    }
  }

  const now = new Date();
  for (const entry of body.scores) {
    await db
      .insert(schema.holeScore)
      .values({
        matchId,
        playerId: entry.playerId,
        holeNumber: entry.holeNumber,
        gross: entry.gross,
        enteredBy: entry.playerId,
        enteredAt: now,
        clientId: `admin-${crypto.randomUUID()}`,
        queuedAt: null,
      })
      .onConflictDoUpdate({
        target: [schema.holeScore.matchId, schema.holeScore.playerId, schema.holeScore.holeNumber],
        set: { gross: entry.gross, enteredBy: entry.playerId, enteredAt: now, clientId: `admin-${crypto.randomUUID()}`, queuedAt: null },
      });
  }

  return c.json({ ok: true });
});

// ------------------------------------------------------------ quick rules

/** New local rule, appended after whatever's already there -- Admin's list
 *  doesn't ask for a position up front, it's reordered afterwards with the
 *  up/down buttons. */
admin.post("/rules", async (c) => {
  const db = c.get("db");
  const body = await c.req.json<{ title: string; body: string }>();

  if (!body?.title?.trim() || !body?.body?.trim()) return c.json({ error: "title and body required" }, 400);

  const existing = await db.query.quickRule.findMany();
  const nextOrder = existing.length === 0 ? 1 : Math.max(...existing.map((r) => r.sortOrder)) + 1;
  const id = await uniqueId("qr", body.title, async (candidate) => !!(await db.query.quickRule.findFirst({ where: eq(schema.quickRule.id, candidate) })));

  await db.insert(schema.quickRule).values({ id, title: body.title.trim(), body: body.body.trim(), sortOrder: nextOrder });

  return c.json({ ok: true, id });
});

admin.patch("/rules/:ruleId", async (c) => {
  const db = c.get("db");
  const ruleId = c.req.param("ruleId");
  const body = await c.req.json<{ title?: string; body?: string; sortOrder?: number }>();

  const existing = await db.query.quickRule.findFirst({ where: eq(schema.quickRule.id, ruleId) });
  if (!existing) return c.json({ error: "rule not found" }, 404);

  await db
    .update(schema.quickRule)
    .set({
      ...(body.title !== undefined ? { title: body.title.trim() } : {}),
      ...(body.body !== undefined ? { body: body.body.trim() } : {}),
      ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
    })
    .where(eq(schema.quickRule.id, ruleId));

  return c.json({ ok: true });
});

/** Swaps this rule's position with its immediate neighbor -- simpler than a
 *  drag-and-drop reorder for a list this short, and sortOrder is a plain
 *  integer (see schema.ts), not a linked list, so a swap is just two
 *  writes. */
admin.post("/rules/:ruleId/move", async (c) => {
  const db = c.get("db");
  const ruleId = c.req.param("ruleId");
  const body = await c.req.json<{ direction: "up" | "down" }>();

  const all = await db.query.quickRule.findMany();
  all.sort((a, b) => a.sortOrder - b.sortOrder);
  const i = all.findIndex((r) => r.id === ruleId);
  if (i === -1) return c.json({ error: "rule not found" }, 404);
  const j = body.direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= all.length) return c.json({ ok: true }); // already at an end

  await db.batch([
    db.update(schema.quickRule).set({ sortOrder: all[j].sortOrder }).where(eq(schema.quickRule.id, all[i].id)),
    db.update(schema.quickRule).set({ sortOrder: all[i].sortOrder }).where(eq(schema.quickRule.id, all[j].id)),
  ]);

  return c.json({ ok: true });
});

admin.delete("/rules/:ruleId", async (c) => {
  const db = c.get("db");
  const ruleId = c.req.param("ruleId");

  const existing = await db.query.quickRule.findFirst({ where: eq(schema.quickRule.id, ruleId) });
  if (!existing) return c.json({ error: "rule not found" }, 404);

  await db.delete(schema.quickRule).where(eq(schema.quickRule.id, ruleId));

  return c.json({ ok: true });
});

// ------------------------------------------------------------- awards

/** Every award for an event, enabled or not -- see schema.ts's note on
 *  `award`. The public route (events.ts) only ever returns the enabled
 *  ones; this one is for the editor, which needs to show a disabled award
 *  too so it can be turned back on. */
admin.get("/events/:eventId/awards", async (c) => {
  const db = c.get("db");
  const eventId = c.req.param("eventId");
  const rows = await db.query.award.findMany({ where: eq(schema.award.eventId, eventId) });
  rows.sort((a, b) => a.sortOrder - b.sortOrder);
  const labels = await loadPlayerLabels(db);
  return c.json({
    awards: rows.map((a) => ({
      id: a.id,
      name: a.name,
      enabled: a.enabled,
      rule: a.rule,
      holderId: a.holderId,
      holderName: a.holderId ? labels.get(a.holderId) ?? a.holderId : null,
      reason: a.reason,
    })),
  });
});

admin.post("/events/:eventId/awards", async (c) => {
  const db = c.get("db");
  const eventId = c.req.param("eventId");
  const body = await c.req.json<{ name: string }>();
  if (!body?.name?.trim()) return c.json({ error: "name required" }, 400);

  const existing = await db.query.award.findMany({ where: eq(schema.award.eventId, eventId) });
  const nextOrder = existing.length === 0 ? 1 : Math.max(...existing.map((a) => a.sortOrder)) + 1;
  const id = await uniqueId("aw", `${eventId}-${body.name}`, async (candidate) => !!(await db.query.award.findFirst({ where: eq(schema.award.id, candidate) })));

  await db.insert(schema.award).values({ id, eventId, name: body.name.trim(), enabled: true, sortOrder: nextOrder });

  return c.json({ ok: true, id });
});

/** Renames an award, toggles it on/off, changes which rule decides it, or
 *  sets/clears a hand-set holder -- one endpoint, since Admin edits these
 *  inline the same way it edits a round or a rule. holderId: null clears it
 *  back to "—" (not yet decided).
 *
 *  Switching to a derived rule leaves any hand-set holder/reason in the row
 *  untouched: the Board stops reading them (see events.ts), and switching
 *  back to MANUAL should return the award to exactly what an admin last
 *  typed rather than to empty. */
admin.patch("/awards/:awardId", async (c) => {
  const db = c.get("db");
  const awardId = c.req.param("awardId");
  const body = await c.req.json<{ name?: string; enabled?: boolean; rule?: string; holderId?: string | null; reason?: string | null }>();

  const existing = await db.query.award.findFirst({ where: eq(schema.award.id, awardId) });
  if (!existing) return c.json({ error: "award not found" }, 404);
  if (body.rule !== undefined && !isAwardRule(body.rule)) return c.json({ error: "unknown award rule" }, 400);

  await db
    .update(schema.award)
    .set({
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      ...(body.rule !== undefined ? { rule: body.rule } : {}),
      ...(body.holderId !== undefined ? { holderId: body.holderId } : {}),
      ...(body.reason !== undefined ? { reason: body.reason?.trim() || null } : {}),
    })
    .where(eq(schema.award.id, awardId));

  return c.json({ ok: true });
});

admin.delete("/awards/:awardId", async (c) => {
  const db = c.get("db");
  const awardId = c.req.param("awardId");

  const existing = await db.query.award.findFirst({ where: eq(schema.award.id, awardId) });
  if (!existing) return c.json({ error: "award not found" }, 404);

  await db.delete(schema.award).where(eq(schema.award.id, awardId));

  return c.json({ ok: true });
});
