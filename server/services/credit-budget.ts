import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb, schema, type DB } from "../db/client.js";
import { mock } from "../env.js";
import { getSettings } from "./settings.js";

type Executor = Pick<DB, "select" | "insert" | "update" | "execute">;

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
export async function signalhireBudget(now = new Date(), tx?: Executor, limitNow?: number | null) {
  // Read before any transaction: on the single-connection local database a read outside it would wait for it.
  const limit = limitNow !== undefined ? limitNow : (await getSettings()).signalhireMonthlyLimit;
  const db = tx ?? (await getDb());
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

export type RevealWanted = { roleCandidateId: string; candidateId: string; item: string; runId?: string | null };

/**
 * Holds credits before SignalHire is called: inside one transaction that locks the settings row, it checks what
 * the monthly limit still allows and inserts a pending reveal row for each person it can afford. Two callers (a
 * manual reveal and a run, two clicks) can't both take the last credit. The caller then calls SignalHire and
 * fills in its request id, or marks the rows failed if the call fails, which releases the hold.
 */
export async function reserveReveals(wanted: RevealWanted[], now = new Date()) {
  const db = await getDb();
  const { signalhireMonthlyLimit } = await getSettings();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from settings where id = 1 for update`);
    const budget = await signalhireBudget(now, tx, signalhireMonthlyLimit);
    const take = wanted.slice(0, Number.isFinite(budget.allowed) ? budget.allowed : wanted.length);
    const rows = take.length ? await tx.insert(schema.contactReveals).values(take.map((w) => ({ ...w, runId: w.runId ?? null }))).returning() : [];
    return { rows, budget };
  });
}

/** After the SignalHire call: record its request id, or release the holds if the call failed. */
export async function settleReveals(ids: string[], outcome: { requestId: string | null } | { failed: true }) {
  if (!ids.length) return;
  const db = await getDb();
  const r = schema.contactReveals;
  if ("failed" in outcome) await db.update(r).set({ status: "failed", receivedAt: new Date() }).where(inArray(r.id, ids));
  else await db.update(r).set({ requestId: outcome.requestId }).where(inArray(r.id, ids));
}
