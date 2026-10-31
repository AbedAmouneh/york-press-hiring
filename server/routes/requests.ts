import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "../db/client.js";
import { hasRole, randomToken, requireRole, type AppEnv, type SessionUser } from "../auth.js";
import { CRITERIA, type Weights } from "../../shared/types.js";
import { DecisionInput, MessageInput, RequestInput, RequestPatch, WeightsInput } from "../../shared/schemas.js";
import { canDeleteMessage, MESSAGE_DELETE_MINUTES } from "../../shared/messages.js";
import { canViewRequest, isStaff, loadRequest } from "./access.js";
import { notifyRoles, notifyUsers, usersWithRoles } from "../services/notify.js";
import { assertWithinLimits, MESSAGE_LIMITS, recordHit } from "../services/rate-limit.js";
import { decisionNotice } from "../services/decision-notice.js";
import { startRun } from "../services/pipeline.js";
import { json, query } from "../validate.js";
import { redactSecrets } from "../env.js";

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
      hmPending: sql<number>`count(*) filter (where ${schema.roleCandidates.isTop10} and ${schema.roleCandidates.hmDecision} is null)::int`,
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
    stats: byId.get(r.id) ?? { screened: 0, contacted: 0, hmYes: 0, hmPending: 0, topAvg: 0 },
    lastEvent: lastBy.get(r.id) ?? null,
  }));
}

async function notifyKhalil(id: string, title: string, dept: string, by: string) {
  await notifyRoles(["ceo"], {
    type: "approval_needed",
    title: `New request awaiting approval: ${title}`,
    link: `/requests/${id}`,
    emailBody: `${by} requested a new position: ${title} (${dept}). Please review it in York Press Hiring and approve, reject or request changes.`,
  });
}

/** A request may only point at a location that exists (a deleted one would otherwise fail on the foreign key). */
async function assertLocation(locationId: string | null | undefined) {
  if (!locationId) return;
  const db = await getDb();
  const [l] = await db.select({ id: schema.locations.id }).from(schema.locations).where(eq(schema.locations.id, locationId));
  if (!l) throw new HTTPException(400, { message: "That location no longer exists. Choose another one." });
}

export const requestRoutes = new Hono<AppEnv>()
  .get("/requests", query(z.object({ scope: z.enum(["mine", "approvals", "roles"]).optional() })), async (c) => {
    const user = c.get("user");
    const db = await getDb();
    const { scope } = c.req.valid("query");
    const t = schema.roleRequests;
    let where = isStaff(user) ? undefined : or(eq(t.requesterId, user.id), eq(t.hiringManagerId, user.id));
    if (scope === "mine") where = eq(t.requesterId, user.id);
    // Approvals are the CEO's queue; anyone else only sees their own requests waiting there.
    if (scope === "approvals") where = isStaff(user) ? eq(t.status, "submitted") : and(eq(t.status, "submitted"), or(eq(t.requesterId, user.id), eq(t.hiringManagerId, user.id)));
    if (scope === "roles") {
      const roleStatuses = inArray(t.status, ["sourcing", "open", "closed"]);
      where = isStaff(user) ? roleStatuses : and(roleStatuses, or(eq(t.requesterId, user.id), eq(t.hiringManagerId, user.id)));
    }
    const rows = await db.select().from(t).where(where).orderBy(desc(t.updatedAt));
    return c.json({ requests: await serializeRequests(rows) });
  })
  .get("/requests/:id", async (c) => {
    const user = c.get("user");
    const r = await loadRequest(c.req.param("id"), user);
    const db = await getDb();
    const events = await db.select().from(schema.requestEvents).where(eq(schema.requestEvents.requestId, r.id)).orderBy(asc(schema.requestEvents.createdAt));
    const [serialized] = await serializeRequests([r]);
    return c.json({ request: serialized, events });
  })
  .get("/requests/:id/messages", async (c) => {
    const user = c.get("user");
    const r = await loadRequest(c.req.param("id"), user);
    const db = await getDb();
    const m = schema.requestMessages;
    const rows = await db.select().from(m).where(eq(m.requestId, r.id)).orderBy(asc(m.createdAt));
    return c.json({ messages: rows.map((x) => ({ ...x, canDelete: canDeleteMessage(x, user.id) })) });
  })
  .post("/requests/:id/messages", json(MessageInput), async (c) => {
    const user = c.get("user");
    const r = await loadRequest(c.req.param("id"), user);
    const limits = MESSAGE_LIMITS(user.id);
    await assertWithinLimits(limits, "You're sending messages very quickly. Please wait a minute.");
    await recordHit(limits);
    const { body } = c.req.valid("json");
    const db = await getDb();
    const [message] = await db.insert(schema.requestMessages).values({ requestId: r.id, authorId: user.id, authorName: user.name, body }).returning();
    // Everyone involved hears about it, except the author: the requester, hiring manager, assigned recruiter,
    // the CEO, and anyone who has already joined the discussion.
    const earlier = await db.selectDistinct({ id: schema.requestMessages.authorId }).from(schema.requestMessages).where(eq(schema.requestMessages.requestId, r.id));
    const ceos = await usersWithRoles(["ceo"]);
    const ids = [...new Set([r.requesterId, r.hiringManagerId, r.recruiterId, ...ceos.map((u) => u.id), ...earlier.map((e) => e.id)])]
      .filter((id): id is string => !!id && id !== user.id);
    // Someone who took part earlier may since have lost access (e.g. a new hiring manager was set): they don't get the text.
    const people = ids.length ? await db.select().from(schema.users).where(inArray(schema.users.id, ids)) : [];
    const recipients = people.filter((u) => canViewRequest(u, r)).map((u) => u.id);
    await notifyUsers(recipients, {
      type: "message",
      title: `${user.name} wrote on ${r.title}`,
      link: `/requests/${r.id}#discussion`,
      emailBody: `${user.name} wrote on the request for ${r.title}:\n\n${body}\n\nReply in York Press Hiring.`,
    });
    return c.json({ message: { ...message, canDelete: true } });
  })
  .delete("/requests/:id/messages/:messageId", async (c) => {
    const user = c.get("user");
    const r = await loadRequest(c.req.param("id"), user);
    const db = await getDb();
    const m = schema.requestMessages;
    const [message] = await db.select().from(m).where(and(eq(m.id, c.req.param("messageId")), eq(m.requestId, r.id)));
    if (!message) throw new HTTPException(404, { message: "Message not found." });
    if (!canDeleteMessage(message, user.id)) {
      throw new HTTPException(403, { message: `You can only delete your own message, within ${MESSAGE_DELETE_MINUTES} minutes of sending it.` });
    }
    await db.delete(m).where(eq(m.id, message.id));
    return c.json({ ok: true });
  })
  .post("/requests", query(z.object({ submit: z.enum(["true", "false"]).optional() })), json(RequestInput), async (c) => {
    const user = requireRole(c, "manager", "recruiter", "admin");
    const input = c.req.valid("json");
    await assertLocation(input.locationId);
    const submit = c.req.valid("query").submit === "true";
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
  })
  .patch("/requests/:id", json(RequestPatch), async (c) => {
    const user = c.get("user");
    const r = await loadRequest(c.req.param("id"), user);
    const editable = (r.requesterId === user.id && ["draft", "changes_requested"].includes(r.status)) || hasRole(user, "admin", "recruiter");
    if (!editable) throw new HTTPException(403, { message: "This request can't be edited now." });
    const input = c.req.valid("json");
    await assertLocation(input.locationId);
    const db = await getDb();
    await db.update(schema.roleRequests).set({ ...input, updatedAt: new Date() }).where(eq(schema.roleRequests.id, r.id));
    await event(r.id, user, "edited");
    return c.json({ ok: true });
  })
  .post("/requests/:id/submit", async (c) => {
    const user = c.get("user");
    const r = await loadRequest(c.req.param("id"), user);
    if (r.requesterId !== user.id && !hasRole(user, "admin", "recruiter")) throw new HTTPException(403, { message: "Only the requester can submit." });
    if (!["draft", "changes_requested"].includes(r.status)) throw new HTTPException(400, { message: "This request was already submitted." });
    const db = await getDb();
    await db.update(schema.roleRequests).set({ status: "submitted", submittedAt: new Date(), reminderSentAt: null, updatedAt: new Date() }).where(eq(schema.roleRequests.id, r.id));
    await event(r.id, user, r.status === "changes_requested" ? "Resubmitted" : "Submitted");
    await notifyKhalil(r.id, r.title, r.department, user.name);
    return c.json({ ok: true });
  })
  .post("/requests/:id/decision", json(DecisionInput), async (c) => {
    const user = requireRole(c, "ceo");
    const r = await loadRequest(c.req.param("id"), user);
    const { action, comment } = c.req.valid("json");
    if (r.status !== "submitted") throw new HTTPException(400, { message: "This request isn't waiting for a decision." });
    const db = await getDb();
    const status = action === "approve" ? "sourcing" : action === "reject" ? "rejected" : "changes_requested";
    // Only move a request that is still waiting, so two decisions sent at once can't both apply (or start two runs).
    const moved = await db
      .update(schema.roleRequests)
      .set({ status, decidedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.roleRequests.id, r.id), eq(schema.roleRequests.status, "submitted")))
      .returning({ id: schema.roleRequests.id });
    if (!moved.length) throw new HTTPException(409, { message: "This request was just decided. Reload to see the decision." });
    const label = action === "approve" ? "Approved" : action === "reject" ? "Rejected" : "Requested changes";
    await event(r.id, user, label, comment);
    await notifyUsers([r.requesterId, r.hiringManagerId], { type: "decision", link: `/requests/${r.id}`, ...decisionNotice(action, user.name, r.title, comment) });
    if (action === "approve") {
      await notifyRoles(["recruiter"], { type: "approved", title: `${r.title} approved — sourcing started`, link: `/roles/${r.id}` });
      await startRun(r.id, "initial");
    }
    return c.json({ ok: true });
  })
  .post("/requests/:id/runs", async (c) => {
    const user = requireRole(c, "recruiter", "admin");
    const r = await loadRequest(c.req.param("id"), user);
    if (!["open", "sourcing"].includes(r.status)) throw new HTTPException(400, { message: "Only approved roles can be sourced." });
    const db = await getDb();
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.roleCandidates).where(eq(schema.roleCandidates.requestId, r.id));
    const runId = await startRun(r.id, n ? "manual" : "initial");
    return c.json({ runId });
  })
  .get("/requests/:id/runs", async (c) => {
    const r = await loadRequest(c.req.param("id"), c.get("user"));
    const db = await getDb();
    const runs = await db.select().from(schema.sourcingRuns).where(eq(schema.sourcingRuns.requestId, r.id)).orderBy(desc(schema.sourcingRuns.createdAt));
    // Older runs may hold an error that echoed an API key: hide it on the way out too.
    return c.json({ runs: runs.map((run) => ({ ...run, error: run.error && redactSecrets(run.error), state: JSON.parse(redactSecrets(JSON.stringify(run.state))) as typeof run.state })) });
  })
  .patch("/requests/:id/weights", json(WeightsInput), async (c) => {
    const user = requireRole(c, "recruiter", "admin");
    const r = await loadRequest(c.req.param("id"), user);
    const weights: Weights = c.req.valid("json");
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
  })
  .post("/requests/:id/close", json(z.object({ deleteContacts: z.boolean().default(false) })), async (c) => {
    const user = requireRole(c, "recruiter", "admin");
    const r = await loadRequest(c.req.param("id"), user);
    const { deleteContacts } = c.req.valid("json");
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
  })
  .get("/people/hiring-managers", async (c) => {
    const db = await getDb();
    const rows = await db.select({ id: schema.users.id, name: schema.users.name, department: schema.users.department, roles: schema.users.roles }).from(schema.users).where(eq(schema.users.active, true)).orderBy(asc(schema.users.name));
    return c.json({ users: rows.filter((u) => u.roles.some((r) => ["hm", "manager", "recruiter", "admin"].includes(r))) });
  });
