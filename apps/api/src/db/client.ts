import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import { drizzle as drizzleLibsql } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema.ts";

/**
 * The one Drizzle instance shape every route uses -- select/insert/update/
 * delete/batch/query, the whole SQLite-dialect surface this app actually
 * calls. D1 (Cloudflare) and libSQL (Turso, or a local file for
 * self-hosting off Cloudflare entirely -- see docs/DEPLOY.md) both
 * implement it identically; only how the connection itself gets opened
 * differs, which is exactly what this file exists to isolate. Every route
 * file gets its db from `c.get("db")` (set once by whichever entrypoint's
 * middleware -- src/index.ts for Cloudflare, src/node.ts for everyone
 * else), never by calling `drizzle()` itself, so no route file has to
 * know or care which driver is actually underneath it.
 */
export type AppDb = ReturnType<typeof drizzleD1<typeof schema>>;

export function createD1Db(d1: D1Database): AppDb {
  return drizzleD1(d1, { schema });
}

/**
 * `url` is either a Turso connection string (libsql://...) or a local
 * file (file:./data.db, for running this on a bare server or your own
 * machine with no external database at all). Structurally the same query
 * surface as createD1Db above -- the cast exists because Drizzle types
 * each driver's return value against that driver's own client type, not a
 * shared interface, even though every method this app actually calls
 * (select/insert/update/delete/batch/query.*) behaves identically on
 * both. If a future change here ever calls something D1-only (there is
 * nothing that does today), TypeScript won't catch it -- that's the
 * price of the cast, paid once, here, rather than scattered across every
 * route file.
 */
export function createLibsqlDb(url: string, authToken?: string): AppDb {
  const client = createClient({ url, authToken });
  return drizzleLibsql(client, { schema }) as unknown as AppDb;
}
