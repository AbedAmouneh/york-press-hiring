// One-off: move CVs stored inline in the database into Vercel Blob.
// Run with DATABASE_URL and BLOB_READ_WRITE_TOKEN set: `npm run cvs:to-blob`
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { getDb, schema } from "../server/db/client.js";
import { env } from "../server/env.js";
import { saveCv } from "../server/services/cv-store.js";

if (!env.blobToken) {
  console.error("Set BLOB_READ_WRITE_TOKEN first (Vercel → Storage → your Blob store → .env.local tab).");
  process.exit(1);
}

const db = await getDb();
const a = schema.applications;
const rows = await db.select({ id: a.id, name: a.cvFileName, type: a.cvMime, b64: a.cvBase64 }).from(a).where(and(isNotNull(a.cvBase64), isNull(a.cvBlobPath)));
console.log(`${rows.length} CVs to move.`);
for (const r of rows) {
  const stored = await saveCv({ name: r.name, type: r.type, bytes: new Uint8Array(Buffer.from(r.b64!, "base64")) });
  await db.update(a).set(stored).where(eq(a.id, r.id));
  console.log(`moved ${r.id}`);
}
console.log("Done.");
process.exit(0);
