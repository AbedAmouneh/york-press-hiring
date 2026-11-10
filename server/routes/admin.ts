import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "../db/client.js";
import { json, query } from "../validate.js";
import { decodeCursor, DEFAULT_PAGE, newestFirst, olderThan, PageQuery, pageOf } from "../paging.js";
import { hasRole, requireRole, type AppEnv } from "../auth.js";
import { suppress } from "../services/suppression.js";
import { ROLES, type Weights } from "../../shared/types.js";
import { SettingsPatch, TemplateInput, TemplatePatch, UserInviteInput, UserPatch } from "../../shared/schemas.js";
import { env, mock, redactSecrets } from "../env.js";
import { createUserWithPassword, inviteUser } from "../services/setup.js";
import { getSettings, updateSettings } from "../services/settings.js";
import { sentTodayCount } from "../services/outreach.js";
import { PLACEHOLDERS } from "../services/templates.js";
import { publicUser } from "./access.js";
import { searchProviders } from "../services/providers/select.js";
import { previewRetention, RETENTION_MONTHS } from "../services/retention.js";
import { signalhireBudget } from "../services/credit-budget.js";
import { hideAuthLinks, sendEmail } from "../services/email.js";
import { MIN_EACH_CLASS, MIN_LABELS, runLearning } from "../services/learning.js";
import { signalhireCredits } from "../services/providers/signalhire.js";
import { linkedinLookupVia } from "../services/linkedin-finder.js";

const AI_LABELS = { gemini: "Gemini", opencode: "OpenCode", anthropic: "Anthropic" } as const;

export const adminRoutes = new Hono<AppEnv>()
  // ---------------------------------------------------------------- users
  .get("/users", async (c) => {
    requireRole(c, "admin");
    const db = await getDb();
    const rows = await db.select().from(schema.users).orderBy(asc(schema.users.name));
    return c.json({ users: rows.map(publicUser) });
  })
  .post("/users", json(UserInviteInput), async (c) => {
    const admin = requireRole(c, "admin");
    const { password, ...body } = c.req.valid("json");
    const { user, link } = password
      ? { user: await createUserWithPassword(body, password), link: null }
      : await inviteUser(body, admin.name);
    return c.json({ user: publicUser(user), inviteLink: mock.email && link ? link : undefined });
  })
  /** Cancels an invite nobody accepted: the person never set a password, so the account holds no work of theirs. */
  .delete("/users/:id", async (c) => {
    const admin = requireRole(c, "admin");
    if (c.req.param("id") === admin.id) throw new HTTPException(400, { message: "You can't remove your own account." });
    const db = await getDb();
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, c.req.param("id")));
    if (!u) throw new HTTPException(404, { message: "User not found." });
    if (u.passwordHash || u.lastLoginAt) throw new HTTPException(400, { message: "Only invites that were never accepted can be cancelled. Switch the account off instead." });
    try {
      await db.delete(schema.users).where(eq(schema.users.id, u.id));
    } catch {
      throw new HTTPException(409, { message: `${u.name} is already linked to requests or roles. Switch the account off instead.` });
    }
    return c.json({ ok: true });
  })
  .patch("/users/:id", json(UserPatch), async (c) => {
    const admin = requireRole(c, "admin");
    const body = c.req.valid("json");
    if (c.req.param("id") === admin.id && (body.active === false || (body.roles && !body.roles.includes("admin")))) {
      throw new HTTPException(400, { message: "You can't remove your own admin access." });
    }
    const db = await getDb();
    const [u] = await db.update(schema.users).set({ ...body, email: body.email?.toLowerCase() }).where(eq(schema.users.id, c.req.param("id"))).returning();
    if (body.active === false) await db.delete(schema.sessions).where(eq(schema.sessions.userId, u.id));
    return c.json({ user: publicUser(u) });
  })
  .post("/users/:id/invite", async (c) => {
    const admin = requireRole(c, "admin");
    const db = await getDb();
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, c.req.param("id")));
    if (!u) throw new HTTPException(404, { message: "User not found." });
    const { link } = await inviteUser({ email: u.email, name: u.name, roles: u.roles as (typeof ROLES)[number][], department: u.department }, admin.name);
    return c.json({ ok: true, inviteLink: mock.email ? link : undefined });
  })
  /** For a lost phone: clears two-step login so the person sets it up again at next sign-in. */
  .post("/users/:id/two-factor/reset", async (c) => {
    const admin = requireRole(c, "admin");
    if (c.req.param("id") === admin.id) throw new HTTPException(400, { message: "Ask another admin to reset your two-step login, or use a recovery code." });
    const db = await getDb();
    const [u] = await db.update(schema.users)
      .set({ totpSecret: null, totpPendingSecret: null, totpEnabledAt: null, totpLastStep: null, recoveryCodes: [] })
      .where(eq(schema.users.id, c.req.param("id")))
      .returning();
    if (!u) throw new HTTPException(404, { message: "User not found." });
    await db.delete(schema.sessions).where(eq(schema.sessions.userId, u.id));
    return c.json({ user: publicUser(u) });
  })
  // ---------------------------------------------------------------- settings + integrations
  .get("/settings", async (c) => {
    requireRole(c, "recruiter", "admin", "ceo");
    const s = await getSettings();
    const budget = await signalhireBudget();
    return c.json({
      settings: s,
      sentToday: await sentTodayCount(),
      integrations: {
        claude: { live: !mock.claude, model: env.aiModel, via: env.aiProvider ? AI_LABELS[env.aiProvider] : null },
        // inUse = false when a source has no key while another is live, so runs skip it.
        pdl: { live: !mock.pdl, inUse: searchProviders().some((p) => p.name === "PDL") },
        signalhire: { live: !mock.signalhire, inUse: searchProviders().some((p) => p.name === "SignalHire"), creditsLeft: s.signalhireCreditsLeft, spentThisMonth: budget.spent + budget.held },
        email: { live: !mock.email, from: env.emailFrom },
        database: { live: !!env.databaseUrl },
        linkedinLookup: { via: linkedinLookupVia() },
        appUrl: env.appUrl,
      },
    });
  })
  /** Sends one test email to the signed-in admin, to check the Resend key and the sender domain. */
  .post("/settings/test-email", async (c) => {
    const admin = requireRole(c, "admin");
    const res = await sendEmail({
      kind: "system",
      to: admin.email,
      subject: "Test email from York Press Hiring",
      text: `Hi ${admin.name.split(" ")[0]},\n\nThis is a test email from York Press Hiring. If you can read it, email sending works.\n\nSent from: ${env.emailFrom}`,
    });
    return c.json({ ok: res.ok, mock: res.mock, to: admin.email, error: res.error ?? null });
  })
  /** Asks SignalHire for the current credit balance instead of waiting for the daily check. */
  .post("/settings/signalhire-credits", async (c) => {
    requireRole(c, "recruiter", "admin");
    if (mock.signalhire) return c.json({ creditsLeft: null as number | null, error: null as string | null });
    try {
      const credits = await signalhireCredits();
      if (credits != null) await updateSettings({ signalhireCreditsLeft: credits });
      return c.json({ creditsLeft: credits, error: null as string | null });
    } catch (e) {
      return c.json({ creditsLeft: null as number | null, error: (e as Error).message });
    }
  })
  .patch("/settings", json(SettingsPatch), async (c) => {
    requireRole(c, "recruiter", "admin");
    const body = c.req.valid("json");
    return c.json({ settings: await updateSettings({ ...body, defaultWeights: body.defaultWeights as Weights | undefined }) });
  })
  // ---------------------------------------------------------------- learning from decisions
  .get("/learning", async (c) => {
    requireRole(c, "recruiter", "admin", "ceo");
    const db = await getDb();
    const t = schema.learnedWeights;
    const rows = await db.select().from(t).orderBy(desc(t.createdAt)).limit(30);
    const decided = await db
      .select({ department: schema.roleRequests.department, yes: sql<number>`count(*) filter (where ${schema.roleCandidates.hmDecision} = 'yes' or ${schema.roleCandidates.status} in ('interview','hired'))::int`, no: sql<number>`count(*) filter (where ${schema.roleCandidates.hmDecision} = 'no')::int` })
      .from(schema.roleCandidates)
      .innerJoin(schema.roleRequests, eq(schema.roleRequests.id, schema.roleCandidates.requestId))
      .where(isNotNull(schema.roleCandidates.scoreBreakdown))
      .groupBy(schema.roleRequests.department);
    return c.json({ learned: rows, decided, minLabels: MIN_LABELS, minEachClass: MIN_EACH_CLASS });
  })
  .post("/learning/run", async (c) => {
    requireRole(c, "recruiter", "admin");
    return c.json({ results: await runLearning() });
  })
  .post("/learning/:id/undo", async (c) => {
    requireRole(c, "recruiter", "admin");
    const db = await getDb();
    const [row] = await db.update(schema.learnedWeights).set({ active: false, undoneAt: new Date() }).where(eq(schema.learnedWeights.id, c.req.param("id"))).returning();
    if (!row) throw new HTTPException(404, { message: "Not found." });
    return c.json({ ok: true });
  })
  // ---------------------------------------------------------------- data retention
  .get("/retention", async (c) => {
    requireRole(c, "recruiter", "admin", "ceo");
    return c.json({ months: RETENTION_MONTHS, nextRun: await previewRetention() });
  })
  // ---------------------------------------------------------------- templates
  .get("/templates", async (c) => {
    requireRole(c, "recruiter", "admin");
    const db = await getDb();
    const rows = await db.select().from(schema.outreachTemplates).orderBy(asc(schema.outreachTemplates.channel), asc(schema.outreachTemplates.name));
    return c.json({ templates: rows, placeholders: PLACEHOLDERS });
  })
  .post("/templates", json(TemplateInput), async (c) => {
    requireRole(c, "recruiter", "admin");
    const body = c.req.valid("json");
    const db = await getDb();
    const [t] = await db.insert(schema.outreachTemplates).values(body).returning();
    return c.json({ template: t });
  })
  .patch("/templates/:id", json(TemplatePatch), async (c) => {
    requireRole(c, "recruiter", "admin");
    const body = c.req.valid("json");
    const db = await getDb();
    const [current] = await db.select().from(schema.outreachTemplates).where(eq(schema.outreachTemplates.id, c.req.param("id")));
    if (!current) throw new HTTPException(404, { message: "Template not found." });
    // Check the merged template, so the LinkedIn length rule applies even when the channel isn't sent.
    TemplateInput.parse({ ...current, ...body });
    const [t] = await db.update(schema.outreachTemplates).set({ ...body, updatedAt: new Date() }).where(eq(schema.outreachTemplates.id, c.req.param("id"))).returning();
    return c.json({ template: t });
  })
  // ---------------------------------------------------------------- usage, outbox, suppression
  .get("/usage", async (c) => {
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
        cacheReadTokens: sql<number>`coalesce(sum(${schema.usageLog.cacheReadTokens}),0)::int`,
        batchCalls: sql<number>`count(*) filter (where ${schema.usageLog.action} = 'score_batch')::int`,
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
    return c.json({ byProvider, runs: runs.map((r) => ({ ...r.run, error: r.run.error && redactSecrets(r.run.error), state: undefined, title: r.title })) });
  })
  .get("/outbox", query(z.object(PageQuery)), async (c) => {
    requireRole(c, "recruiter", "admin");
    const { before, limit = DEFAULT_PAGE } = c.req.valid("query");
    const db = await getDb();
    const t = schema.emailLog;
    const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(t);
    const rows = await db.select().from(t).where(olderThan(t.createdAt, t.id, decodeCursor(before))).orderBy(...newestFirst(t.createdAt, t.id)).limit(limit + 1);
    const { items, next } = pageOf(rows, limit, (r) => ({ at: r.createdAt, id: r.id }));
    // Sign-in links never leave the server, even from rows logged before they were hidden at write time.
    return c.json({ emails: items.map((r) => ({ ...r, body: hideAuthLinks(r.body) })), total, next, mock: mock.email });
  })
  .get("/suppression", async (c) => {
    requireRole(c, "recruiter", "admin");
    const db = await getDb();
    return c.json({ entries: await db.select().from(schema.suppressionList).orderBy(desc(schema.suppressionList.createdAt)) });
  })
  .post("/suppression", json(z.object({ email: z.email().optional(), linkedinUrl: z.string().optional(), candidateId: z.uuid().optional(), reason: z.string().default("manual") })), async (c) => {
    requireRole(c, "recruiter", "admin");
    const body = c.req.valid("json");
    if (!body.email && !body.linkedinUrl && !body.candidateId) throw new HTTPException(400, { message: "Give an email, LinkedIn URL or candidate." });
    // Same rules as the unsubscribe link: matched by candidate, email or LinkedIn, unsent messages cancelled.
    const { cancelled } = await suppress(body);
    return c.json({ ok: true, cancelled });
  })
  .delete("/suppression/:id", async (c) => {
    const user = requireRole(c, "recruiter", "admin");
    const db = await getDb();
    const [entry] = await db.select().from(schema.suppressionList).where(eq(schema.suppressionList.id, c.req.param("id")));
    if (!entry) throw new HTTPException(404, { message: "Not found." });
    // Someone who asked not to be contacted stays on the list unless an admin removes them.
    if (entry.reason === "opted_out" && !hasRole(user, "admin")) throw new HTTPException(403, { message: "This person opted out. Only an admin can remove them from the list." });
    await db.delete(schema.suppressionList).where(eq(schema.suppressionList.id, entry.id));
    return c.json({ ok: true });
  })
  // ---------------------------------------------------------------- notifications
  .get("/notifications", query(z.object(PageQuery)), async (c) => {
    const user = c.get("user");
    const { before, limit = DEFAULT_PAGE } = c.req.valid("query");
    const db = await getDb();
    const t = schema.notifications;
    const rows = await db.select().from(t).where(and(eq(t.userId, user.id), olderThan(t.createdAt, t.id, decodeCursor(before)))).orderBy(...newestFirst(t.createdAt, t.id)).limit(limit + 1);
    const { items, next } = pageOf(rows, limit, (r) => ({ at: r.createdAt, id: r.id }));
    const [{ n, total }] = await db.select({ n: sql<number>`count(*) filter (where ${t.readAt} is null)::int`, total: sql<number>`count(*)::int` }).from(t).where(eq(t.userId, user.id));
    return c.json({ notifications: items, unread: n, total, next });
  })
  .post("/notifications/read", json(z.object({ ids: z.array(z.uuid()).optional() })), async (c) => {
    const user = c.get("user");
    const { ids } = c.req.valid("json");
    const db = await getDb();
    const where = ids?.length
      ? and(eq(schema.notifications.userId, user.id), inArray(schema.notifications.id, ids))
      : eq(schema.notifications.userId, user.id);
    await db.update(schema.notifications).set({ readAt: new Date() }).where(and(where, isNull(schema.notifications.readAt)));
    return c.json({ ok: true });
  });
