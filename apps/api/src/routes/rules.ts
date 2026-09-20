import { Hono } from "hono";
import type { AppEnv } from "../types.ts";

export const rules = new Hono<AppEnv>();

/** The group's local rules, in display order -- see schema.ts's note on
 *  quick_rule for why only these (and not the Nassau/Formats/Handicaps
 *  prose on the same page) live in the database. */
rules.get("/", async (c) => {
  const db = c.get("db");
  const rows = await db.query.quickRule.findMany();
  rows.sort((a, b) => a.sortOrder - b.sortOrder);
  return c.json({ rules: rows.map((r) => ({ id: r.id, title: r.title, body: r.body })) });
});
