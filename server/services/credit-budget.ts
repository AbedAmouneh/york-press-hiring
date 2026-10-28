import { and, eq, gte, sql } from "drizzle-orm";
import { getDb, schema } from "../db/client.js";
import { mock } from "../env.js";
import { getSettings } from "./settings.js";

// A pending reveal holds a credit for this long. After that SignalHire has either answered or never will.
const HOLD_MS = 24 * 60 * 60_000;

/** First moment of the current calendar month (UTC). */
export function monthStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Credits still allowed this month. No limit means Infinity; never below zero. */
export function creditsAllowed(limit: number | null | undefined, spent: number, held: number) {
  if (limit == null) return Infinity;
  return Math.max(0, limit - spent - held);
}

/**
 * The month's SignalHire budget: credits spent (results received this month), credits held by
 * reveals still waiting for an answer, and what the monthly limit in Settings still allows.
 * Sample data costs nothing, so in mock mode nothing is limited.
 */
export async function signalhireBudget(now = new Date()) {
  const settings = await getSettings();
  const limit = settings.signalhireMonthlyLimit;
  const db = await getDb();
  const from = monthStart(now);
  const holdFrom = new Date(Math.max(from.getTime(), now.getTime() - HOLD_MS));
  const r = schema.contactReveals;
  const [spentRow] = await db
    .select({ n: sql<number>`coalesce(sum(${r.creditsUsed}), 0)` })
    .from(r)
    .where(gte(r.receivedAt, from));
  const [heldRow] = await db
    .select({ n: sql<number>`count(*)` })
    .from(r)
    .where(and(eq(r.status, "pending"), gte(r.requestedAt, holdFrom)));
  const spent = Number(spentRow?.n ?? 0);
  const held = Number(heldRow?.n ?? 0);
  const allowed = mock.signalhire ? Infinity : creditsAllowed(limit, spent, held);
  return { limit, spent, held, allowed };
}
