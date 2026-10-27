import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "../db/client.js";
import { json, query } from "../validate.js";
import { z } from "zod";
import { OUTREACH_STATUSES } from "../../shared/types.js";
import { OutreachEdit } from "../../shared/schemas.js";
import { requireRole, type AppEnv } from "../auth.js";
import { drainEmailQueue, markContacted, sentTodayCount } from "../services/outreach.js";
import { getSettings } from "../services/settings.js";

async function loadMessage(id: string) {
  const db = await getDb();
  const [msg] = await db.select().from(schema.outreachMessages).where(eq(schema.outreachMessages.id, id));
  if (!msg) throw new HTTPException(404, { message: "Message not found." });
  return msg;
}

export const outreachRoutes = new Hono<AppEnv>()
  .get("/outreach", query(z.object({
    channel: z.enum(["email", "linkedin"]).optional(),
    /** Comma-separated, e.g. "awaiting_approval,approved". */
    status: z.string().transform((v) => v.split(",")).pipe(z.array(z.enum(OUTREACH_STATUSES))).optional(),
  })), async (c) => {
    requireRole(c, "recruiter", "admin");
    const { channel, status } = c.req.valid("query");
    const db = await getDb();
    const m = schema.outreachMessages;
    const conds = [];
    if (channel) conds.push(eq(m.channel, channel));
    if (status) conds.push(inArray(m.status, status));
    const rows = await db
      .select({
        m,
        name: schema.candidates.fullName,
        rank: schema.roleCandidates.rank,
        score: schema.roleCandidates.score,
        roleTitle: schema.roleRequests.title,
        requestId: schema.roleRequests.id,
        rcStatus: schema.roleCandidates.status,
        dateContacted: schema.roleCandidates.dateContacted,
        followUpDate: schema.roleCandidates.followUpDate,
      })
      .from(m)
      .innerJoin(schema.roleCandidates, eq(schema.roleCandidates.id, m.roleCandidateId))
      .innerJoin(schema.candidates, eq(schema.candidates.id, schema.roleCandidates.candidateId))
      .innerJoin(schema.roleRequests, eq(schema.roleRequests.id, schema.roleCandidates.requestId))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(m.queuedAt))
      .limit(500);
    const settings = await getSettings();
    return c.json({
      messages: rows.map((r) => ({ ...r.m, candidateName: r.name, rank: r.rank, score: r.score, roleTitle: r.roleTitle, requestId: r.requestId, rcStatus: r.rcStatus, dateContacted: r.dateContacted, followUpDate: r.followUpDate })),
      sentToday: await sentTodayCount(),
      dailyCap: settings.dailySendCap,
      autoSendEnabled: settings.autoSendEnabled,
    });
  })
  .patch("/outreach/:id", json(OutreachEdit), async (c) => {
    requireRole(c, "recruiter", "admin");
    const msg = await loadMessage(c.req.param("id"));
    if (!["queued", "awaiting_approval", "approved"].includes(msg.status)) throw new HTTPException(400, { message: "Only unsent messages can be edited." });
    const body = c.req.valid("json");
    if (msg.channel === "linkedin" && body.body.length > 300) throw new HTTPException(400, { message: "LinkedIn connection notes are limited to 300 characters." });
    const db = await getDb();
    await db.update(schema.outreachMessages).set(body).where(eq(schema.outreachMessages.id, msg.id));
    return c.json({ ok: true });
  })
  .post("/outreach/:id/cancel", async (c) => {
    requireRole(c, "recruiter", "admin");
    const msg = await loadMessage(c.req.param("id"));
    if (!["queued", "awaiting_approval", "approved"].includes(msg.status)) throw new HTTPException(400, { message: "This message was already sent." });
    const db = await getDb();
    await db.update(schema.outreachMessages).set({ status: "cancelled" }).where(eq(schema.outreachMessages.id, msg.id));
    return c.json({ ok: true });
  })
  /** LinkedIn: approve a message so the Claude in Chrome session can send it. */
  .post("/outreach/:id/approve", async (c) => {
    const user = requireRole(c, "recruiter", "admin");
    const msg = await loadMessage(c.req.param("id"));
    if (msg.channel !== "linkedin" || msg.status !== "awaiting_approval") throw new HTTPException(400, { message: "Only LinkedIn messages waiting for approval can be approved." });
    const db = await getDb();
    await db.update(schema.outreachMessages).set({ status: "approved", approvedById: user.id }).where(eq(schema.outreachMessages.id, msg.id));
    return c.json({ ok: true });
  })
  /** LinkedIn: mark as sent after it was sent from Abed's account. */
  .post("/outreach/:id/sent", async (c) => {
    requireRole(c, "recruiter", "admin");
    const msg = await loadMessage(c.req.param("id"));
    if (msg.channel !== "linkedin" || msg.status !== "approved") throw new HTTPException(400, { message: "Approve the message before marking it sent." });
    const db = await getDb();
    await db.update(schema.outreachMessages).set({ status: "sent", sentAt: new Date() }).where(eq(schema.outreachMessages.id, msg.id));
    await markContacted(msg.roleCandidateId);
    return c.json({ ok: true });
  })
  .post("/outreach/send-now", async (c) => {
    requireRole(c, "recruiter", "admin");
    return c.json(await drainEmailQueue());
  });
