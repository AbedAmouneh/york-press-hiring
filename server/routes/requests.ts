import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "../db/client.js";
import { hasRole, randomToken, requireRole, type AppEnv, type SessionUser } from "../auth.js";
import { CRITERIA, CURRENCIES, type Weights } from "../../shared/types.js";
import { isStaff, loadRequest } from "./access.js";
import { notifyRoles, notifyUsers } from "../services/notify.js";
import { startRun } from "../services/pipeline.js";

export const requestRoutes = new Hono<AppEnv>();

const list = z.array(z.string().trim().min(1)).default([]);
const RequestInput = z.object({
  title: z.string().trim().min(2, "Add a job title."),
  department: z.string().trim().min(1),
  seniority: z.string().trim().min(1),
  headcount: z.coerce.number().int().min(1).max(50).default(1),
  startDate: z.string().nullable().optional(),
  kind: z.enum(["new", "backfill"]).default("new"),
  jdText: z.string().default(""),
  mustHaves: list,
  niceToHaves: list,
  dealBreakers: list,
  minYears: z.coerce.number().int().min(0).max(40).nullable().optional(),
  idealYears: z.coerce.number().int().min(0).max(40).nullable().optional(),
  languages: list,
  locationPolicy: z.string().trim().default("Remote, global"),
  searchLocations: list,
  timeZone: z.string().nullable().optional(),
  salaryMin: z.coerce.number().int().min(0).nullable().optional(),
  salaryMax: z.coerce.number().int().min(0).nullable().optional(),
  currency: z.enum(CURRENCIES).nullable().optional(),
  salaryPeriod: z.enum(["year", "month"]).default("year"),
  justification: z.string().default(""),
  targetCompanies: list,
  avoidCompanies: list,
  hiringManagerId: z.string().uuid().nullable().optional(),
});

async function event(requestId: string, user: SessionUser | null, action: string, comment?: string | null) {
  const db = await getDb();
  await db.insert(schema.requestEvents).values({ requestId, actorId: user?.id ?? null, actorName: user?.name ?? "System", action, comment: comment ?? null });
}

export async function serializeRequests(rows: (typeof schema.roleRequests.$inferSelect)[]) {
  if (!rows.length) return [];
  const db = await getDb();
  const ids = rows.map((r) => r.id);
  const userIds = [...new Set(rows.flatMap((r) => [r.requesterId, r.hiringManagerId, r.recruiterId]).filter(Boolean) as string[])];
  const users = userIds.length ? await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(inArray(schema.users.id, userIds)) : [];
  const names = new Map(users.map((u) => [u.id, u.name]));
  const counts = await db
    .select({
      requestId: schema.roleCandidates.requestId,
      screened: sql<number>`count(*)::int`,
      contacted: sql<number>`count(*) filter (where ${schema.roleCandidates.status} <> 'new')::int`,
      hmYes: sql<number>`count(*) filter (where ${schema.roleCandidates.hmDecision} = 'yes')::int`,
      topAvg: sql<number>`coalesce(round(avg(${schema.roleCandidates.score}) filter (where ${schema.roleCandidates.isTop10})),0)::int`,
    })
    .from(schema.roleCandidates)
    .where(inArray(schema.roleCandidates.requestId, ids))
    .groupBy(schema.roleCandidates.requestId);
  const byId = new Map(counts.map((c) => [c.requestId, c]));
  const lastEvents = await db
    .select()
    .from(schema.requestEvents)
    .where(inArray(schema.requestEvents.requestId, ids))
    .orderBy(desc(schema.requestEvents.createdAt));
  const lastBy = new Map<string, typeof lastEvents[number]>();
  for (const e of lastEvents) if (!lastBy.has(e.requestId) && e.action !== "edited") lastBy.set(e.requestId, e);
  return rows.map((r) => ({
    ...r,
    code: `R-${100 + r.number}`,
    requesterName: names.get(r.requesterId) ?? null,
    hiringManagerName: r.hiringManagerId ? names.get(r.hiringManagerId) ?? null : null,
    recruiterName: r.recruiterId ? names.get(r.recruiterId) ?? null : null,
    stats: byId.get(r.id) ?? { screened: 0, contacted: 0, hmYes: 0, topAvg: 0 },
    lastEvent: lastBy.get(r.id) ?? null,
  }));
}

requestRoutes.get("/requests", async (c) => {
  const user = c.get("user");
  const db = await getDb();
  const scope = c.req.query("scope");
  const t = schema.roleRequests;
  let where = isStaff(user) ? undefined : or(eq(t.requesterId, user.id), eq(t.hiringManagerId, user.id));
  if (scope === "mine") where = eq(t.requesterId, user.id);
  if (scope === "approvals") where = eq(t.status, "submitted");
  if (scope === "roles") {
    const roleStatuses = inArray(t.status, ["sourcing", "open", "closed"]);
    where = isStaff(user) ? roleStatuses : and(roleStatuses, or(eq(t.requesterId, user.id), eq(t.hiringManagerId, user.id)));
  }
  const rows = await db.select().from(t).where(where).orderBy(desc(t.updatedAt));
  return c.json({ requests: await serializeRequests(rows) });
});

requestRoutes.get("/requests/:id", async (c) => {
  const user = c.get("user");
  const r = await loadRequest(c.req.param("id"), user);
  const db = await getDb();
  const events = await db.select().from(schema.requestEvents).where(eq(schema.requestEvents.requestId, r.id)).orderBy(asc(schema.requestEvents.createdAt));
  const [serialized] = await serializeRequests([r]);
  return c.json({ request: serialized, events });
});

requestRoutes.post("/requests", async (c) => {
  const user = requireRole(c, "manager", "recruiter", "admin");
  const input = RequestInput.parse(await c.req.json());
  const submit = c.req.query("submit") === "true";
  const db = await getDb();
  const [r] = await db.insert(schema.roleRequests).values({
    ...input,
    requesterId: user.id,
    hiringManagerId: input.hiringManagerId ?? (hasRole(user, "hm", "manager") ? user.id : null),
    status: submit ? "submitted" : "draft",
    submittedAt: submit ? new Date() : null,
    applyToken: randomToken(12),
  }).returning();
  await event(r.id, user, submit ? "Submitted" : "Created draft");
  if (submit) await notifyKhalil(r.id, r.title, r.department, user.name);
  return c.json({ id: r.id });
});

requestRoutes.patch("/requests/:id", async (c) => {
  const user = c.get("user");
  const r = await loadRequest(c.req.param("id"), user);
  const editable = (r.requesterId === user.id && ["draft", "changes_requested"].includes(r.status)) || hasRole(user, "admin", "recruiter");
  if (!editable) throw new HTTPException(403, { message: "This request can't be edited now." });
  const input = RequestInput.partial().parse(await c.req.json());
  const db = await getDb();
  await db.update(schema.roleRequests).set({ ...input, updatedAt: new Date() }).where(eq(schema.roleRequests.id, r.id));
  await event(r.id, user, "edited");
  return c.json({ ok: true });
});

async function notifyKhalil(id: string, title: string, dept: string, by: string) {
  await notifyRoles(["ceo"], {
    type: "approval_needed",
    title: `New request awaiting approval: ${title}`,
    link: `/requests/${id}`,
    emailBody: `${by} requested a new position: ${title} (${dept}). Please review it in York Press Hiring and approve, reject or request changes.`,
  });
}

requestRoutes.post("/requests/:id/submit", async (c) => {
  const user = c.get("user");
  const r = await loadRequest(c.req.param("id"), user);
  if (r.requesterId !== user.id && !hasRole(user, "admin", "recruiter")) throw new HTTPException(403, { message: "Only the requester can submit." });
  if (!["draft", "changes_requested"].includes(r.status)) throw new HTTPException(400, { message: "This request was already submitted." });
  const db = await getDb();
  await db.update(schema.roleRequests).set({ status: "submitted", submittedAt: new Date(), reminderSentAt: null, updatedAt: new Date() }).where(eq(schema.roleRequests.id, r.id));
  await event(r.id, user, r.status === "changes_requested" ? "Resubmitted" : "Submitted");
  await notifyKhalil(r.id, r.title, r.department, user.name);
  return c.json({ ok: true });
});

requestRoutes.post("/requests/:id/decision", async (c) => {
  const user = requireRole(c, "ceo");
  const r = await loadRequest(c.req.param("id"), user);
  const { action, comment } = z.object({ action: z.enum(["approve", "reject", "request_changes"]), comment: z.string().trim().optional() }).parse(await c.req.json());
  if (r.status !== "submitted") throw new HTTPException(400, { message: "This request isn't waiting for a decision." });
  if (action !== "approve" && !comment) throw new HTTPException(400, { message: "Add a comment so the manager knows why." });
  const db = await getDb();
  const status = action === "approve" ? "sourcing" : action === "reject" ? "rejected" : "changes_requested";
  await db.update(schema.roleRequests).set({ status, decidedAt: new Date(), updatedAt: new Date() }).where(eq(schema.roleRequests.id, r.id));
  const label = action === "approve" ? "Approved" : action === "reject" ? "Rejected" : "Requested changes";
  await event(r.id, user, label, comment);
  await notifyUsers([r.requesterId, r.hiringManagerId], {
    type: "decision",
    title: `${user.name} ${label.toLowerCase()} ${r.title}`,
    link: `/requests/${r.id}`,
    emailBody: `${user.name} ${label.toLowerCase()} your request for ${r.title}.${comment ? `\n\nComment: ${comment}` : ""}${action === "approve" ? "\n\nSourcing has started; you'll be notified when candidates are ready." : ""}`,
  });
  if (action === "approve") {
    await notifyRoles(["recruiter"], { type: "approved", title: `${r.title} approved — sourcing started`, link: `/roles/${r.id}` });
    await startRun(r.id, "initial");
  }
  return c.json({ ok: true });
});

requestRoutes.post("/requests/:id/runs", async (c) => {
  const user = requireRole(c, "recruiter", "admin");
  const r = await loadRequest(c.req.param("id"), user);
  if (!["open", "sourcing"].includes(r.status)) throw new HTTPException(400, { message: "Only approved roles can be sourced." });
  const db = await getDb();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.roleCandidates).where(eq(schema.roleCandidates.requestId, r.id));
  const runId = await startRun(r.id, n ? "manual" : "initial");
  return c.json({ runId });
});

requestRoutes.get("/requests/:id/runs", async (c) => {
  const r = await loadRequest(c.req.param("id"), c.get("user"));
  const db = await getDb();
  const runs = await db.select().from(schema.sourcingRuns).where(eq(schema.sourcingRuns.requestId, r.id)).orderBy(desc(schema.sourcingRuns.createdAt));
  return c.json({ runs });
});

requestRoutes.patch("/requests/:id/weights", async (c) => {
  const user = requireRole(c, "recruiter", "admin");
  const r = await loadRequest(c.req.param("id"), user);
  const weights = z.object(Object.fromEntries(CRITERIA.map((k) => [k.key, z.number().int().min(0).max(100)]))).parse(await c.req.json()) as Weights;
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  if (total !== 100) throw new HTTPException(400, { message: `Weights must add up to 100 (now ${total}).` });
  const db = await getDb();
  await db.update(schema.roleRequests).set({ scorecardWeights: weights }).where(eq(schema.roleRequests.id, r.id));
  // Re-score everyone with the new weights by re-weighting their stored breakdown proportionally.
  const rcs = await db.select().from(schema.roleCandidates).where(eq(schema.roleCandidates.requestId, r.id));
  const old = r.scorecardWeights;
  for (const rc of rcs) {
    if (!rc.scoreBreakdown) continue;
    let sum = 0;
    for (const k of CRITERIA) {
      const prevMax = old?.[k.key] ?? k.weight;
      const frac = prevMax ? (rc.scoreBreakdown[k.key] ?? 0) / prevMax : 0;
      sum += frac * weights[k.key];
    }
    const score = rc.dealBreakerMissing ? Math.min(40, Math.round(sum)) : Math.round(sum);
    const breakdown = Object.fromEntries(CRITERIA.map((k) => [k.key, Math.round(((rc.scoreBreakdown![k.key] ?? 0) / ((old?.[k.key] ?? k.weight) || 1)) * weights[k.key])]));
    await db.update(schema.roleCandidates).set({ score, scoreBreakdown: breakdown }).where(eq(schema.roleCandidates.id, rc.id));
  }
  const ranked = await db.select({ id: schema.roleCandidates.id }).from(schema.roleCandidates).where(eq(schema.roleCandidates.requestId, r.id)).orderBy(desc(schema.roleCandidates.score));
  for (let i = 0; i < ranked.length; i++) {
    await db.update(schema.roleCandidates).set({ rank: i + 1, isTop10: i < 10 }).where(eq(schema.roleCandidates.id, ranked[i].id));
  }
  await event(r.id, user, "Changed scorecard weights");
  return c.json({ ok: true });
});

requestRoutes.post("/requests/:id/close", async (c) => {
  const user = requireRole(c, "recruiter", "admin");
  const r = await loadRequest(c.req.param("id"), user);
  const { deleteContacts } = z.object({ deleteContacts: z.boolean().default(false) }).parse(await c.req.json().catch(() => ({})));
  const db = await getDb();
  await db.update(schema.roleRequests).set({ status: "closed", closedAt: new Date(), updatedAt: new Date() }).where(eq(schema.roleRequests.id, r.id));
  await db.update(schema.outreachMessages).set({ status: "cancelled" })
    .where(and(inArray(schema.outreachMessages.status, ["queued", "awaiting_approval", "approved"]), inArray(schema.outreachMessages.roleCandidateId, db.select({ id: schema.roleCandidates.id }).from(schema.roleCandidates).where(eq(schema.roleCandidates.requestId, r.id)))));
  if (deleteContacts) {
    const ids = db.select({ id: schema.roleCandidates.candidateId }).from(schema.roleCandidates).where(eq(schema.roleCandidates.requestId, r.id));
    await db.update(schema.candidates).set({ email: null, phone: null, contactSource: null, contactRetrievedAt: null }).where(inArray(schema.candidates.id, ids));
  }
  await event(r.id, user, "Closed the role", deleteContacts ? "Contact details deleted" : null);
  return c.json({ ok: true });
});

requestRoutes.get("/people/hiring-managers", async (c) => {
  const db = await getDb();
  const rows = await db.select({ id: schema.users.id, name: schema.users.name, department: schema.users.department, roles: schema.users.roles }).from(schema.users).where(eq(schema.users.active, true)).orderBy(asc(schema.users.name));
  return c.json({ users: rows.filter((u) => u.roles.some((r) => ["hm", "manager", "recruiter", "admin"].includes(r))) });
});
