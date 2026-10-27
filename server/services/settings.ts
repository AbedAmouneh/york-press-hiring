import { eq } from "drizzle-orm";
import { getDb, schema } from "../db/client.js";
import { DEFAULT_WEIGHTS, type Weights } from "../../shared/types.js";

export async function getSettings() {
  const db = await getDb();
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.id, 1));
  if (row) return row;
  const [created] = await db.insert(schema.settings).values({ id: 1, defaultWeights: DEFAULT_WEIGHTS }).onConflictDoNothing().returning();
  return created ?? (await db.select().from(schema.settings).where(eq(schema.settings.id, 1)))[0];
}

export async function updateSettings(patch: Partial<typeof schema.settings.$inferInsert>) {
  const db = await getDb();
  await getSettings();
  const [row] = await db.update(schema.settings).set({ ...patch, updatedAt: new Date() }).where(eq(schema.settings.id, 1)).returning();
  return row;
}

export function weightsFor(request: { scorecardWeights: Weights | null }, settings: { defaultWeights: Weights | null }): Weights {
  return request.scorecardWeights ?? settings.defaultWeights ?? DEFAULT_WEIGHTS;
}

export async function logUsage(v: typeof schema.usageLog.$inferInsert) {
  const db = await getDb();
  await db.insert(schema.usageLog).values(v);
}
