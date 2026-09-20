import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

/**
 * Applies apps/api/drizzle's migrations to a libSQL/Turso database or a
 * local SQLite file -- the Node-runtime equivalent of `wrangler d1
 * migrations apply`. Reads the same migration files Cloudflare uses
 * (drizzle-kit's output is plain SQLite DDL either way, see
 * db/client.ts's note on why D1 and libSQL can share one schema), so
 * there's nothing target-specific here beyond which client built `db`.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required env var: ${name}`);
  return value;
}

const url = requireEnv("DATABASE_URL");
const authToken = process.env.DATABASE_AUTH_TOKEN;

const client = createClient({ url, authToken });
const db = drizzle(client);

await migrate(db, { migrationsFolder: "./drizzle" });
console.log(`migrations applied to ${url}`);
client.close();
