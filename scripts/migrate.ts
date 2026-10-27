// Apply database migrations: `npm run db:migrate`
// Vercel runs this in the build, before the new version goes live, so functions never migrate on a
// cold start. Prefers Neon's direct (unpooled) connection, which migrations need for their lock.
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const v = (k: string) => (process.env[k] ?? "").trim();
const url = v("DATABASE_URL_UNPOOLED") || v("POSTGRES_URL_NON_POOLING") || v("DATABASE_URL") || v("POSTGRES_URL");

if (!url) {
  console.warn(
    v("VERCEL")
      ? "No DATABASE_URL in this build: migrations skipped. Add the Neon database (SETUP_GUIDE step 3) and redeploy."
      : "No DATABASE_URL: nothing to migrate. Locally the built-in database migrates itself on start.",
  );
  process.exit(0);
}

const client = postgres(url, { max: 1, prepare: false, onnotice: () => undefined });
const started = Date.now();
try {
  await migrate(drizzle(client), { migrationsFolder: "server/db/migrations" });
  console.log(`Database migrations applied in ${Date.now() - started} ms.`);
} catch (e) {
  console.error("Migration failed; the deployment stops here so the old version keeps running.");
  console.error(e);
  process.exitCode = 1;
} finally {
  await client.end();
}
