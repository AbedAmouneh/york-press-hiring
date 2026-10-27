import path from "node:path";
import fs from "node:fs";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";
import { env } from "../env.js";

export type DB = PostgresJsDatabase<typeof schema>;

let dbPromise: Promise<DB> | null = null;

function migrationsFolder() {
  const candidates = [
    path.join(process.cwd(), "server/db/migrations"),
    path.join(path.dirname(new URL(import.meta.url).pathname), "migrations"),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? candidates[0];
}

async function connect(): Promise<DB> {
  const folder = migrationsFolder();
  if (env.databaseUrl) {
    const postgres = (await import("postgres")).default;
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const client = postgres(env.databaseUrl, { prepare: false, max: 3, idle_timeout: 20 });
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: folder });
    return db;
  }
  if (env.onVercel) {
    throw new Error("DATABASE_URL is not set. Add a Postgres database (Neon) to the Vercel project.");
  }
  // Local development: an embedded Postgres stored in .data/
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data/pglite");
  fs.mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: folder });
  return db as unknown as DB;
}

export function getDb(): Promise<DB> {
  if (!dbPromise) {
    dbPromise = connect().catch((e) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

export { schema };
