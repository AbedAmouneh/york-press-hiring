import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, eq, gt } from "drizzle-orm";
import { getDb, schema } from "../db/client.js";
import { ApplyFields, cvProblem, InvitePasswordInput, LoginInput, SetupInput } from "../../shared/schemas.js";
import { env, mock } from "../env.js";
import { createSession, currentUser, destroySession, hashPassword, randomToken, verifyPassword } from "../auth.js";
import { runSetup, userCount, DEMO_PASSWORD } from "../services/setup.js";
import { applyRevealResults, resumeWaitingRuns, runPipeline } from "../services/pipeline.js";
import { parseCandidate, type SHCandidate } from "../services/providers/signalhire.js";
import { runDaily } from "../services/cron.js";
import { scoreCv } from "../services/claude.js";
import { getSettings, weightsFor } from "../services/settings.js";
import { toReq } from "../services/mappers.js";
import { notifyRoles } from "../services/notify.js";
import { normalizeLinkedin } from "../services/providers/types.js";
import { saveCv } from "../services/cv-store.js";
import { verifyQueueRequest } from "../services/queue.js";
import { z } from "zod";
import { form, json } from "../validate.js";
import { publicUser } from "./access.js";
import { APPLY_LIMITS, assertWithinLimits, clearHits, clientIp, INVITE_LIMITS, LOGIN_LIMITS, recordHit } from "../services/rate-limit.js";

/** The apply page's multipart form. Field rules live in ApplyFields and cvProblem, checked in the handler. */
const ApplyForm = z.object({
  name: z.string().default(""),
  email: z.string().default(""),
  linkedin: z.string().optional(),
  note: z.string().optional(),
  consent: z.string().optional(),
  cv: z.instanceof(File, { error: "Please attach your CV." }),
});

// A bcrypt hash of a random secret, compared against when the email doesn't exist.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= hashPassword(randomToken()));

export const publicRoutes = new Hono()
  .get("/health", (c) => c.json({ ok: true }))
  // ---------------------------------------------------------------- first-run setup
  .get("/setup", async (c) => c.json({ needsSetup: (await userCount()) === 0, demoMode: env.demoMode }))
  .post("/setup", json(SetupInput), async (c) => {
    const body = c.req.valid("json");
    const { admin, invites } = await runSetup(body);
    await createSession(c, admin.id);
    return c.json({ ok: true, invites: invites.map((i) => ({ email: i.user.email, link: mock.email ? i.link : undefined })) });
  })
  // ---------------------------------------------------------------- auth
  .post("/auth/login", json(LoginInput), async (c) => {
    const { email: rawEmail, password } = c.req.valid("json");
    const email = rawEmail.trim().toLowerCase();
    const limits = LOGIN_LIMITS(email, clientIp(c));
    await assertWithinLimits(limits, "Too many failed sign-in attempts. Please wait 15 minutes and try again.");
    const db = await getDb();
    const [u] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    // Always run bcrypt, so the response time doesn't reveal whether the email exists.
    const valid = await verifyPassword(password, u?.passwordHash ?? (await getDummyHash()));
    if (!u || !u.active || !u.passwordHash || !valid) {
      await recordHit(limits);
      throw new HTTPException(401, { message: "Email or password is incorrect." });
    }
    await clearHits([limits[0].key]);
    await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, u.id));
    await createSession(c, u.id);
    return c.json({ user: publicUser(u) });
  })
  .post("/auth/logout", async (c) => {
    await destroySession(c);
    return c.json({ ok: true });
  })
  .get("/auth/me", async (c) => {
    const u = await currentUser(c);
    return c.json({ user: u ? publicUser(u) : null, demoMode: env.demoMode, demoPassword: env.demoMode ? DEMO_PASSWORD : undefined, preview: env.isPreview });
  })
  .get("/auth/invite/:token", async (c) => {
    const db = await getDb();
    const [u] = await db.select().from(schema.users).where(and(eq(schema.users.inviteToken, c.req.param("token")), gt(schema.users.inviteExpiresAt, new Date())));
    if (!u) throw new HTTPException(404, { message: "This invite link is invalid or has expired. Ask your admin for a new one." });
    return c.json({ name: u.name, email: u.email });
  })
  .post("/auth/invite/:token", json(InvitePasswordInput), async (c) => {
    const { password } = c.req.valid("json");
    const limits = INVITE_LIMITS(clientIp(c));
    await assertWithinLimits(limits);
    const db = await getDb();
    const [u] = await db.select().from(schema.users).where(and(eq(schema.users.inviteToken, c.req.param("token")), gt(schema.users.inviteExpiresAt, new Date())));
    if (!u) {
      await recordHit(limits);
      throw new HTTPException(404, { message: "This invite link is invalid or has expired." });
    }
    await db.update(schema.users).set({ passwordHash: await hashPassword(password), inviteToken: null, inviteExpiresAt: null, lastLoginAt: new Date() }).where(eq(schema.users.id, u.id));
    await createSession(c, u.id);
    return c.json({ ok: true });
  })
  // ---------------------------------------------------------------- candidate apply page
  .get("/public/apply/:token", async (c) => {
    const db = await getDb();
    const [r] = await db.select().from(schema.roleRequests).where(eq(schema.roleRequests.applyToken, c.req.param("token")));
    if (!r || !["open", "sourcing"].includes(r.status)) throw new HTTPException(404, { message: "This position is no longer open." });
    return c.json({ title: r.title, department: r.department, locationPolicy: r.locationPolicy, description: r.jdText.slice(0, 3000) });
  })
  .post("/public/apply/:token", form(ApplyForm), async (c) => {
    const db = await getDb();
    const [r] = await db.select().from(schema.roleRequests).where(eq(schema.roleRequests.applyToken, c.req.param("token")));
    if (!r || !["open", "sourcing"].includes(r.status)) throw new HTTPException(404, { message: "This position is no longer open." });
    // Each CV costs a Claude call, so cap uploads per visitor.
    const limits = APPLY_LIMITS(clientIp(c));
    await assertWithinLimits(limits, "We've received several CVs from this connection. Please try again in an hour.");
    await recordHit(limits);
    const body = c.req.valid("form");
    const fields = ApplyFields.parse({
      name: body.name,
      email: body.email.trim().toLowerCase(),
      linkedin: body.linkedin || undefined,
      note: body.note || undefined,
      consent: ["on", "true"].includes(body.consent ?? ""),
    });
    const { name, email } = fields;
    const file = body.cv;
    const problem = cvProblem(file);
    if (problem) throw new HTTPException(400, { message: problem });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const base64 = Buffer.from(bytes).toString("base64"); // for Claude only; storage is decided by saveCv
    const stored = await saveCv({ name: file.name, type: file.type, bytes });
    const linkedinUrl = normalizeLinkedin(fields.linkedin ?? "");
    // Link to an existing candidate when we can.
    const [existing] = await db.select().from(schema.candidates).where(eq(schema.candidates.email, email)).limit(1);
    const [app] = await db.insert(schema.applications).values({
      requestId: r.id, candidateId: existing?.id ?? null, name, email, linkedinUrl, note: fields.note ?? "",
      cvFileName: file.name.slice(0, 200), cvMime: file.type, ...stored,
    }).returning();
    if (existing) {
      await db.update(schema.roleCandidates).set({ status: "replied" }).where(and(eq(schema.roleCandidates.candidateId, existing.id), eq(schema.roleCandidates.requestId, r.id)));
    }
    try {
      const settings = await getSettings();
      const res = await scoreCv(toReq(r), weightsFor(r, settings), { base64, mime: file.type, fileName: file.name });
      await db.update(schema.applications).set({ score: res.score, analysis: { why: res.why, gaps: res.gaps, breakdown: res.breakdown } }).where(eq(schema.applications.id, app.id));
    } catch (e) {
      console.error("cv score", e);
    }
    await notifyRoles(["recruiter"], { type: "application", title: `New CV for ${r.title}: ${name}`, link: `/roles/${r.id}?tab=applications` }, [r.hiringManagerId]);
    return c.json({ ok: true });
  })
  .get("/public/unsubscribe/:candidateId", async (c) => {
    const db = await getDb();
    const [cand] = await db.select().from(schema.candidates).where(eq(schema.candidates.id, c.req.param("candidateId")));
    if (cand) {
      await db.insert(schema.suppressionList).values({ candidateId: cand.id, email: cand.email, linkedinUrl: cand.linkedinUrl, reason: "opted_out" });
    }
    return c.text("You won't hear from York Press about this again. Your contact details will be deleted.");
  })
  // ---------------------------------------------------------------- SignalHire webhook
  .post("/webhooks/signalhire/:secret", async (c) => {
    if (c.req.param("secret") !== env.webhookSecret) return c.json({ ok: false }, 403);
    const payload = await c.req.json().catch(() => null);
    // Reply fast (SignalHire waits max 10 s); processing is quick DB work.
    if (Array.isArray(payload)) {
      const results = (payload as { item?: unknown; status?: unknown; candidate?: SHCandidate }[]).map((r) => parseCandidate(String(r.item), String(r.status), r.candidate));
      await applyRevealResults(results);
      await resumeWaitingRuns();
    }
    return c.json({ ok: true });
  })
  // ---------------------------------------------------------------- cron + internal
  .get("/cron/daily", async (c) => {
    const auth = c.req.header("authorization");
    if (env.cronSecret ? auth !== `Bearer ${env.cronSecret}` : env.isProd) return c.json({ ok: false }, 401);
    return c.json(await runDaily());
  })
  // QStash delivers queued runs here. Only signed calls for this exact URL are accepted.
  .post("/internal/queue/runs", async (c) => {
    const body = await c.req.text();
    if (!(await verifyQueueRequest(c.req.header("upstash-signature"), body))) return c.json({ ok: false }, 401);
    const { runId } = z.object({ runId: z.uuid() }).parse(JSON.parse(body));
    const outcome = await runPipeline(runId);
    // 503 tells QStash to retry later, by which time a crashed call's lock has expired.
    return c.json({ ok: outcome !== "busy", outcome }, outcome === "busy" ? 503 : 200);
  })
  .post("/internal/runs/:id/continue", async (c) => {
    if (c.req.header("x-internal-secret") !== env.internalSecret) return c.json({ ok: false }, 403);
    await runPipeline(c.req.param("id"));
    return c.json({ ok: true });
  });
