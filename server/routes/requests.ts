import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, asc, desc, eq, inArray, isNotNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "../db/client.js";
import { hasRole, randomToken, requireRole, type AppEnv, type SessionUser } from "../auth.js";
import type { RequestStatus, Weights } from "../../shared/types.js";
import { DecisionInput, MessageInput, rangeProblems, RequestInput, RequestPatch, submitProblems, WeightsInput, type Problem } from "../../shared/schemas.js";
import { canDeleteMessage, MESSAGE_DELETE_MINUTES } from "../../shared/messages.js";
import { canViewRequest, isStaff, loadRequest, visibleRequests } from "./access.js";
import { notifyRoles, notifyUsers, usersWithRoles } from "../services/notify.js";
import { admit, MESSAGE_LIMITS } from "../services/rate-limit.js";
import { decisionNotice } from "../services/decision-notice.js";
import { cancelRuns, startRun } from "../services/pipeline.js";
import { getSettings, weightsFor } from "../services/settings.js";
import { scoreFractions, scoreWithWeights, type Fractions } from "../services/claude.js";
import { json, query } from "../validate.js";
import { redactDeep, redactSecrets } from "../env.js";
import { localDate } from "../services/dates.js";

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
      followUpsDue: sql<number>`count(*) filter (where ${schema.roleCandidates.status} = 'contacted' and ${schema.roleCandidates.followUpDate} <= ${localDate()})::int`,
    })
    .from(schema.roleCandidates)
    .where(inArray(schema.roleCandidates.requestId, ids))
    .groupBy(schema.roleCandidates.requestId);
  const byId = new Map(counts.map((c) => [c.requestId, c]));
  // Only the newest event per request (edits don't count), not every event of every request.
  const lastEvents = await db
    .selectDistinctOn([schema.requestEvents.requestId])
    .from(schema.requestEvents)
    .where(and(inArray(schema.requestEvents.requestId, ids), ne(schema.requestEvents.action, "edited")))
    .orderBy(schema.requestEvents.requestId, desc(schema.requestEvents.createdAt));
  const lastBy = new Map(lastEvents.map((e) => [e.requestId, e]));
  return rows.map((r) => ({
    ...r,
    code: `R-${100 + r.number}`,
    requesterName: names.get(r.requesterId) ?? null,
    hiringManagerName: r.hiringManagerId ? names.get(r.hiringManagerId) ?? null : null,
    recruiterName: r.recruiterId ? names.get(r.recruiterId) ?? null : null,
    stats: byId.get(r.id) ?? { screened: 0, contacted: 0, hmYes: 0, hmPending: 0, topAvg: 0, followUpsDue: 0 },
    lastEvent: lastBy.get(r.id) ?? null,
  }));
}

async function notifyKhalil(id: string, title: string, dept: string, by: string) {
  // Without an active CEO approver the request would wait forever: tell the admins instead.
  if (!(await usersWithRoles(["ceo"])).length) {
    await notifyRoles(["admin"], {
      type: "approval_needed",
      title: `Nobody can approve ${title}: add a CEO approver`,
      link: "/admin/users",
      emailBody: `${by} submitted ${title} (${dept}), but no active user has the CEO approver role, so nobody can approve it. Add Khalil (or another approver) in Users with the CEO approver role.`,
    });
    return;
  }
  await notifyRoles(["ceo"], {
    type: "approval_needed",
    title: `New request awaiting approval: ${title}`,
    link: `/requests/${id}`,
    emailBody: `${by} requested a new position: ${title} (${dept}). Please review it in York Press Hiring and approve, reject or request changes.`,
  });
}

/** Turns rule problems into one 400 with every message, like the form shows them. */
function assertNoProblems(problems: Problem[]) {
  if (problems.length) throw new HTTPException(400, { message: problems.map((p) => p.message).join(" ") });
}

/** The hiring manager must be an active person who can manage hiring (an unknown id would fail on the foreign key). */
async function assertHiringManager(userId: string | null | undefined) {
  if (!userId) return;
  const db = await getDb();
  const [u] = await db.select({ active: schema.users.active, roles: schema.users.roles }).from(schema.users).where(eq(schema.users.id, userId));
  if (!u?.active || !u.roles.some((r) => ["hm", "manager", "recruiter", "admin"].includes(r))) {
    throw new HTTPException(400, { message: "That hiring manager can't be chosen. Pick someone from the list." });
  }
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
    let where = visibleRequests(user);
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
    await admit(limits, "You're sending messages very quickly. Please wait a minute.");
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
    await assertHiringManager(input.hiringManagerId);
    const submit = c.req.valid("query").submit === "true";
    if (submit) assertNoProblems(submitProblems(input));
    const db = await getDb();
    const [r] = await db.insert(schema.roleRequests).values({
      ...input,
      requesterId: user.id,
      // "Me" on the form sends no hiring manager: the requester is the hiring manager.
      hiringManagerId: input.hiringManagerId ?? user.id,
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
    await assertHiringManager(input.hiringManagerId);
    // Check the request as it will be after the change, not only the fields sent.
    assertNoProblems(rangeProblems({ ...r, ...input }));
    const db = await getDb();
    // "Me" (null) means the requester, as when the request was created.
    const hm = input.hiringManagerId === null ? { hiringManagerId: r.requesterId } : {};
    await db.update(schema.roleRequests).set({ ...input, ...hm, updatedAt: new Date() }).where(eq(schema.roleRequests.id, r.id));
    await event(r.id, user, "edited");
    return c.json({ ok: true });
  })
  .post("/requests/:id/submit", async (c) => {
    const user = c.get("user");
    const r = await loadRequest(c.req.param("id"), user);
    if (r.requesterId !== user.id && !hasRole(user, "admin", "recruiter")) throw new HTTPException(403, { message: "Only the requester can submit." });
    if (!["draft", "changes_requested"].includes(r.status)) throw new HTTPException(400, { message: "This request was already submitted." });
    assertNoProblems(submitProblems(r));
    const db = await getDb();
    await db.update(schema.roleRequests).set({ status: "submitted", submittedAt: new Date(), reminderSentAt: null, updatedAt: new Date() }).where(eq(schema.roleRequests.id, r.id));
    await event(r.id, user, r.status === "changes_requested" ? "Resubmitted" : "Submitted");
    await notifyKhalil(r.id, r.title, r.department, user.name);
    return c.json({ ok: true });
  })
  /** The requester takes a request back before the CEO decides; it becomes a draft they can edit or delete. */
  .post("/requests/:id/withdraw", async (c) => {
    const user = c.get("user");
    const r = await loadRequest(c.req.param("id"), user);
    if (r.requesterId !== user.id && !hasRole(user, "admin", "recruiter")) throw new HTTPException(403, { message: "Only the requester can withdraw this request." });
    const db = await getDb();
    const moved = await db.update(schema.roleRequests).set({ status: "draft", updatedAt: new Date() })
      .where(and(eq(schema.roleRequests.id, r.id), inArray(schema.roleRequests.status, ["submitted", "changes_requested"])))
      .returning({ id: schema.roleRequests.id });
    if (!moved.length) throw new HTTPException(400, { message: "Only a request waiting for a decision can be withdrawn." });
    await event(r.id, user, "Withdrew the request");
    if (r.status === "submitted") {
      await notifyRoles(["ceo"], { type: "decision", title: `${user.name} withdrew ${r.title}`, link: `/requests/${r.id}`, emailBody: `${user.name} withdrew the request for ${r.title}. Nothing is waiting for you on it.` });
    }
    return c.json({ ok: true });
  })
  /** A draft that was never approved can be deleted by its requester (or a recruiter/admin). */
  .delete("/requests/:id", async (c) => {
    const user = c.get("user");
    const r = await loadRequest(c.req.param("id"), user);
    if (r.requesterId !== user.id && !hasRole(user, "admin", "recruiter")) throw new HTTPException(403, { message: "Only the requester can delete this draft." });
    // An admin (not a demo account) can also remove a request that is still waiting for a decision (clean-up),
    // without notifying anyone. Anything approved stays: close the role instead, so its candidates and history are kept.
    const cleanUp = hasRole(user, "admin") && !user.isDemo;
    const deletable: RequestStatus[] = cleanUp ? ["draft", "submitted", "changes_requested"] : ["draft"];
    if (!deletable.includes(r.status)) {
      throw new HTTPException(400, { message: cleanUp ? "Only requests that haven't been approved can be deleted. Close the role instead." : "Only drafts can be deleted. Withdraw the request first, or close the role." });
    }
    const db = await getDb();
    await db.delete(schema.roleRequests).where(and(eq(schema.roleRequests.id, r.id), inArray(schema.roleRequests.status, deletable)));
    return c.json({ ok: true });
  })
  /** A role closed by mistake opens again; nothing is searched or sent until someone presses Refresh. */
  .post("/requests/:id/reopen", async (c) => {
    const user = requireRole(c, "recruiter", "admin");
    const r = await loadRequest(c.req.param("id"), user);
    const db = await getDb();
    const moved = await db.update(schema.roleRequests).set({ status: "open", closedAt: null, updatedAt: new Date() })
      .where(and(eq(schema.roleRequests.id, r.id), eq(schema.roleRequests.status, "closed")))
      .returning({ id: schema.roleRequests.id });
    if (!moved.length) throw new HTTPException(400, { message: "Only a closed role can be reopened." });
    await event(r.id, user, "Reopened the role");
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
  // Score everyone already on the role again with the current rules: no searches, credits or messages.
  .post("/requests/:id/rescore", async (c) => {
    const user = requireRole(c, "recruiter", "admin");
    const r = await loadRequest(c.req.param("id"), user);
    if (!["open", "sourcing"].includes(r.status)) throw new HTTPException(400, { message: "Only open roles can be scored again." });
    const db = await getDb();
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.roleCandidates).where(and(eq(schema.roleCandidates.requestId, r.id), isNotNull(schema.roleCandidates.scoredAt)));
    if (!n) throw new HTTPException(400, { message: "Nobody has been scored for this role yet." });
    const runId = await startRun(r.id, "rescore");
    return c.json({ runId });
  })
  .get("/requests/:id/runs", async (c) => {
    const r = await loadRequest(c.req.param("id"), c.get("user"));
    const db = await getDb();
    const runs = await db.select().from(schema.sourcingRuns).where(eq(schema.sourcingRuns.requestId, r.id)).orderBy(desc(schema.sourcingRuns.createdAt));
    // Older runs may hold an error that echoed an API key: hide it on the way out too.
    // The page polls this every few seconds during a run, so send only what it shows: not the run's
    // internal bookkeeping (candidate id lists, batch ids).
    return c.json({
      runs: runs.map(({ state, ...run }) => ({
        ...run,
        error: run.error && redactSecrets(run.error),
        state: redactDeep({ brief: state.brief, log: state.log, progress: state.progress }),
      })),
    });
  })
  .patch("/requests/:id/weights", json(WeightsInput), async (c) => {
    const user = requireRole(c, "recruiter", "admin");
    const r = await loadRequest(c.req.param("id"), user);
    const weights: Weights = c.req.valid("json");
    const db = await getDb();
    // The weights the stored scores were made with: the role's own, else (older roles) today's defaults.
    const old = r.scorecardWeights ?? weightsFor(r, await getSettings());
    await db.transaction(async (tx) => {
      await tx.update(schema.roleRequests).set({ scorecardWeights: weights }).where(eq(schema.roleRequests.id, r.id));
      const rcs = await tx.select().from(schema.roleCandidates).where(eq(schema.roleCandidates.requestId, r.id));
      for (const rc of rcs) {
        if (!rc.scoreBreakdown) continue;
        // Scores keep each criterion's unrounded share, so changing weights and back gives the same scores.
        const fractions = { ...scoreFractions(rc.scoreBreakdown, old), ...(rc.scoreFractions ?? {}) } as Fractions;
        const { breakdown, score } = scoreWithWeights(fractions, weights, rc.dealBreakerMissing);
        await tx.update(schema.roleCandidates).set({ score, scoreBreakdown: breakdown, scoreFractions: fractions }).where(eq(schema.roleCandidates.id, rc.id));
      }
      // Only scored people are ranked; anyone without a score has no rank and is never in the Top 10.
      const ranked = await tx
        .select({ id: schema.roleCandidates.id, score: schema.roleCandidates.score })
        .from(schema.roleCandidates)
        .where(eq(schema.roleCandidates.requestId, r.id))
        .orderBy(sql`${schema.roleCandidates.score} desc nulls last`, desc(schema.roleCandidates.prescore), asc(schema.roleCandidates.id));
      let rank = 0;
      for (const row of ranked) {
        const scored = row.score != null;
        if (scored) rank++;
        await tx.update(schema.roleCandidates).set({ rank: scored ? rank : null, isTop10: scored && rank <= 10 }).where(eq(schema.roleCandidates.id, row.id));
      }
    });
    await event(r.id, user, "Changed scorecard weights");
    return c.json({ ok: true });
  })
  .post("/requests/:id/close", json(z.object({ deleteContacts: z.boolean().default(false) })), async (c) => {
    const user = requireRole(c, "recruiter", "admin");
    const r = await loadRequest(c.req.param("id"), user);
    const { deleteContacts } = c.req.valid("json");
    const db = await getDb();
    if (r.status === "closed") return c.json({ ok: true, keptContacts: 0 });
    // Only approved roles are closed here; a request still waiting for the CEO is not the recruiter's to end.
    const closed = await db
      .update(schema.roleRequests)
      .set({ status: "closed", closedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.roleRequests.id, r.id), inArray(schema.roleRequests.status, ["sourcing", "open"])))
      .returning({ id: schema.roleRequests.id });
    if (!closed.length) throw new HTTPException(400, { message: "Only approved roles can be closed." });
    // Stop its sourcing run for good, so nothing more is searched, revealed or sent.
    await cancelRuns(r.id);
    await db.update(schema.outreachMessages).set({ status: "cancelled" })
      .where(and(inArray(schema.outreachMessages.status, ["queued", "awaiting_approval", "approved"]), inArray(schema.outreachMessages.roleCandidateId, db.select({ id: schema.roleCandidates.id }).from(schema.roleCandidates).where(eq(schema.roleCandidates.requestId, r.id)))));
    let kept = 0;
    if (deleteContacts) {
      const rc = schema.roleCandidates;
      const onThisRole = (await db.select({ id: rc.candidateId }).from(rc).where(eq(rc.requestId, r.id))).map((x) => x.id);
      // People also on another open role keep their details: that role may still need to reach them.
      const stillNeeded = onThisRole.length
        ? new Set((await db
          .select({ id: rc.candidateId })
          .from(rc)
          .innerJoin(schema.roleRequests, eq(schema.roleRequests.id, rc.requestId))
          .where(and(inArray(rc.candidateId, onThisRole), ne(rc.requestId, r.id), inArray(schema.roleRequests.status, ["sourcing", "open"])))).map((x) => x.id))
        : new Set<string>();
      kept = stillNeeded.size;
      const toDelete = onThisRole.filter((cid) => !stillNeeded.has(cid));
      if (toDelete.length) await db.update(schema.candidates).set({ email: null, phone: null, contactSource: null, contactRetrievedAt: null }).where(inArray(schema.candidates.id, toDelete));
    }
    await event(r.id, user, "Closed the role", deleteContacts ? `Contact details deleted${kept ? ` (kept for ${kept} people on other open roles)` : ""}` : null);
    return c.json({ ok: true, keptContacts: kept });
  })
  .get("/people/hiring-managers", async (c) => {
    const db = await getDb();
    const rows = await db.select({ id: schema.users.id, name: schema.users.name, department: schema.users.department, roles: schema.users.roles }).from(schema.users).where(eq(schema.users.active, true)).orderBy(asc(schema.users.name));
    return c.json({ users: rows.filter((u) => u.roles.some((r) => ["hm", "manager", "recruiter", "admin"].includes(r))) });
  });
