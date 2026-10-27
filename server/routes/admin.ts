import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, asc, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "../db/client.js";
import { requireRole, type AppEnv } from "../auth.js";
import { ROLES, type Weights } from "../../shared/types.js";
import { SettingsPatch, TemplateInput, TemplatePatch, UserInviteInput, UserPatch } from "../../shared/schemas.js";
import { env, mock } from "../env.js";
import { inviteUser } from "../services/setup.js";
import { getSettings, updateSettings } from "../services/settings.js";
import { sentTodayCount } from "../services/outreach.js";
import { PLACEHOLDERS } from "../services/templates.js";
import { publicUser } from "./access.js";

export const adminRoutes = new Hono<AppEnv>();

// ---------------------------------------------------------------- users
adminRoutes.get("/users", async (c) => {
  requireRole(c, "admin");
  const db = await getDb();
  const rows = await db.select().from(schema.users).orderBy(asc(schema.users.name));
  return c.json({ users: rows.map(publicUser) });
});

adminRoutes.post("/users", async (c) => {
  const admin = requireRole(c, "admin");
  const body = UserInviteInput.parse(await c.req.json());
  const { user, link } = await inviteUser(body, admin.name);
  return c.json({ user: publicUser(user), inviteLink: mock.email ? link : undefined });
});

adminRoutes.patch("/users/:id", async (c) => {
  const admin = requireRole(c, "admin");
  const body = UserPatch.parse(await c.req.json());
  if (c.req.param("id") === admin.id && (body.active === false || (body.roles && !body.roles.includes("admin")))) {
    throw new HTTPException(400, { message: "You can't remove your own admin access." });
  }
  const db = await getDb();
  const [u] = await db.update(schema.users).set({ ...body, email: body.email?.toLowerCase() }).where(eq(schema.users.id, c.req.param("id"))).returning();
  if (body.active === false) await db.delete(schema.sessions).where(eq(schema.sessions.userId, u.id));
  return c.json({ user: publicUser(u) });
});

adminRoutes.post("/users/:id/invite", async (c) => {
  const admin = requireRole(c, "admin");
  const db = await getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, c.req.param("id")));
  if (!u) throw new HTTPException(404, { message: "User not found." });
  const { link } = await inviteUser({ email: u.email, name: u.name, roles: u.roles as (typeof ROLES)[number][], department: u.department }, admin.name);
  return c.json({ ok: true, inviteLink: mock.email ? link : undefined });
});

// ---------------------------------------------------------------- settings + integrations
adminRoutes.get("/settings", async (c) => {
  requireRole(c, "recruiter", "admin", "ceo");
  const s = await getSettings();
  return c.json({
    settings: s,
    sentToday: await sentTodayCount(),
    integrations: {
      claude: { live: !mock.claude, model: env.claudeModel },
      pdl: { live: !mock.pdl },
      signalhire: { live: !mock.signalhire, creditsLeft: s.signalhireCreditsLeft },
      email: { live: !mock.email, from: env.emailFrom },
      database: { live: !!env.databaseUrl },
      appUrl: env.appUrl,
    },
  });
});

adminRoutes.patch("/settings", async (c) => {
  requireRole(c, "recruiter", "admin");
  const body = SettingsPatch.parse(await c.req.json());
  return c.json({ settings: await updateSettings({ ...body, defaultWeights: body.defaultWeights as Weights | undefined }) });
});

// ---------------------------------------------------------------- templates
adminRoutes.get("/templates", async (c) => {
  requireRole(c, "recruiter", "admin");
  const db = await getDb();
  const rows = await db.select().from(schema.outreachTemplates).orderBy(asc(schema.outreachTemplates.channel), asc(schema.outreachTemplates.name));
  return c.json({ templates: rows, placeholders: PLACEHOLDERS });
});

adminRoutes.post("/templates", async (c) => {
  requireRole(c, "recruiter", "admin");
  const body = TemplateInput.parse(await c.req.json());
  const db = await getDb();
  const [t] = await db.insert(schema.outreachTemplates).values(body).returning();
  return c.json({ template: t });
});

adminRoutes.patch("/templates/:id", async (c) => {
  requireRole(c, "recruiter", "admin");
  const body = TemplatePatch.parse(await c.req.json());
  const db = await getDb();
  const [current] = await db.select().from(schema.outreachTemplates).where(eq(schema.outreachTemplates.id, c.req.param("id")));
  if (!current) throw new HTTPException(404, { message: "Template not found." });
  // Check the merged template, so the LinkedIn length rule applies even when the channel isn't sent.
  TemplateInput.parse({ ...current, ...body });
  const [t] = await db.update(schema.outreachTemplates).set({ ...body, updatedAt: new Date() }).where(eq(schema.outreachTemplates.id, c.req.param("id"))).returning();
  return c.json({ template: t });
});

// ---------------------------------------------------------------- usage, outbox, suppression
adminRoutes.get("/usage", async (c) => {
  requireRole(c, "recruiter", "admin", "ceo");
  const db = await getDb();
  const since = new Date(Date.now() - 30 * 864e5);
  const byProvider = await db
    .select({
      provider: schema.usageLog.provider,
      mock: schema.usageLog.mock,
      units: sql<number>`coalesce(sum(${schema.usageLog.units}),0)::int`,
      inputTokens: sql<number>`coalesce(sum(${schema.usageLog.inputTokens}),0)::int`,
      outputTokens: sql<number>`coalesce(sum(${schema.usageLog.outputTokens}),0)::int`,
      calls: sql<number>`count(*)::int`,
    })
    .from(schema.usageLog)
    .where(gte(schema.usageLog.createdAt, since))
    .groupBy(schema.usageLog.provider, schema.usageLog.mock);
  const runs = await db
    .select({ run: schema.sourcingRuns, title: schema.roleRequests.title })
    .from(schema.sourcingRuns)
    .innerJoin(schema.roleRequests, eq(schema.roleRequests.id, schema.sourcingRuns.requestId))
    .orderBy(desc(schema.sourcingRuns.createdAt))
    .limit(50);
  return c.json({ byProvider, runs: runs.map((r) => ({ ...r.run, state: undefined, title: r.title })) });
});

adminRoutes.get("/outbox", async (c) => {
  requireRole(c, "recruiter", "admin");
  const db = await getDb();
  const rows = await db.select().from(schema.emailLog).orderBy(desc(schema.emailLog.createdAt)).limit(200);
  return c.json({ emails: rows, mock: mock.email });
});

adminRoutes.get("/suppression", async (c) => {
  requireRole(c, "recruiter", "admin");
  const db = await getDb();
  return c.json({ entries: await db.select().from(schema.suppressionList).orderBy(desc(schema.suppressionList.createdAt)) });
});

adminRoutes.post("/suppression", async (c) => {
  requireRole(c, "recruiter", "admin");
  const body = z.object({ email: z.string().email().optional(), linkedinUrl: z.string().optional(), candidateId: z.string().uuid().optional(), reason: z.string().default("manual") }).parse(await c.req.json());
  if (!body.email && !body.linkedinUrl && !body.candidateId) throw new HTTPException(400, { message: "Give an email, LinkedIn URL or candidate." });
  const db = await getDb();
  if (body.candidateId) {
    const [cand] = await db.select().from(schema.candidates).where(eq(schema.candidates.id, body.candidateId));
    if (cand) { body.email ??= cand.email ?? undefined; body.linkedinUrl ??= cand.linkedinUrl ?? undefined; }
    // Cancel anything not yet sent to this person.
    const rcIds = db.select({ id: schema.roleCandidates.id }).from(schema.roleCandidates).where(eq(schema.roleCandidates.candidateId, body.candidateId));
    await db.update(schema.outreachMessages).set({ status: "cancelled" }).where(and(inArray(schema.outreachMessages.roleCandidateId, rcIds), inArray(schema.outreachMessages.status, ["queued", "awaiting_approval", "approved"])));
    if (body.reason === "opted_out") {
      await db.update(schema.candidates).set({ email: null, phone: null, contactSource: null, contactRetrievedAt: null }).where(eq(schema.candidates.id, body.candidateId));
    }
  }
  await db.insert(schema.suppressionList).values({ email: body.email?.toLowerCase() ?? null, linkedinUrl: body.linkedinUrl ?? null, candidateId: body.candidateId ?? null, reason: body.reason });
  return c.json({ ok: true });
});

adminRoutes.delete("/suppression/:id", async (c) => {
  requireRole(c, "recruiter", "admin");
  const db = await getDb();
  await db.delete(schema.suppressionList).where(eq(schema.suppressionList.id, c.req.param("id")));
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- notifications
adminRoutes.get("/notifications", async (c) => {
  const user = c.get("user");
  const db = await getDb();
  const rows = await db.select().from(schema.notifications).where(eq(schema.notifications.userId, user.id)).orderBy(desc(schema.notifications.createdAt)).limit(100);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.notifications).where(and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt)));
  return c.json({ notifications: rows, unread: n });
});

adminRoutes.post("/notifications/read", async (c) => {
  const user = c.get("user");
  const { ids } = z.object({ ids: z.array(z.string().uuid()).optional() }).parse(await c.req.json().catch(() => ({})));
  const db = await getDb();
  const where = ids?.length
    ? and(eq(schema.notifications.userId, user.id), inArray(schema.notifications.id, ids))
    : eq(schema.notifications.userId, user.id);
  await db.update(schema.notifications).set({ readAt: new Date() }).where(and(where, isNull(schema.notifications.readAt)));
  return c.json({ ok: true });
});
