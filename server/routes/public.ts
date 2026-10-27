import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "../db/client.js";
import { env, mock } from "../env.js";
import { createSession, currentUser, destroySession, hashPassword, verifyPassword } from "../auth.js";
import { runSetup, userCount, DEMO_PASSWORD } from "../services/setup.js";
import { applyRevealResults, resumeWaitingRuns, runPipeline } from "../services/pipeline.js";
import { parseCandidate } from "../services/providers/signalhire.js";
import { runDaily } from "../services/cron.js";
import { scoreCv } from "../services/claude.js";
import { getSettings, weightsFor } from "../services/settings.js";
import { toReq } from "../services/mappers.js";
import { notifyRoles } from "../services/notify.js";
import { normalizeLinkedin } from "../services/providers/types.js";
import { publicUser } from "./access.js";

export const publicRoutes = new Hono();

publicRoutes.get("/health", (c) => c.json({ ok: true }));

// ---------------------------------------------------------------- first-run setup
publicRoutes.get("/setup", async (c) => c.json({ needsSetup: (await userCount()) === 0, demoMode: env.demoMode }));

publicRoutes.post("/setup", async (c) => {
  const body = z.object({
    adminName: z.string().min(2),
    adminEmail: z.string().email(),
    adminPassword: z.string().min(10, "Use at least 10 characters."),
    ceoName: z.string().min(2),
    ceoEmail: z.string().email(),
    managers: z.array(z.object({ name: z.string(), email: z.string(), department: z.string().optional() })).default([]),
  }).parse(await c.req.json());
  const { admin, invites } = await runSetup(body);
  await createSession(c, admin.id);
  return c.json({ ok: true, invites: invites.map((i) => ({ email: i.user.email, link: mock.email ? i.link : undefined })) });
});

// ---------------------------------------------------------------- auth
publicRoutes.post("/auth/login", async (c) => {
  const { email, password } = z.object({ email: z.string(), password: z.string() }).parse(await c.req.json());
  const db = await getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, email.trim().toLowerCase()));
  if (!u || !u.active || !u.passwordHash || !(await verifyPassword(password, u.passwordHash))) {
    throw new HTTPException(401, { message: "Email or password is incorrect." });
  }
  await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, u.id));
  await createSession(c, u.id);
  return c.json({ user: publicUser(u) });
});

publicRoutes.post("/auth/logout", async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

publicRoutes.get("/auth/me", async (c) => {
  const u = await currentUser(c);
  return c.json({ user: u ? publicUser(u) : null, demoMode: env.demoMode, demoPassword: env.demoMode ? DEMO_PASSWORD : undefined });
});

publicRoutes.get("/auth/invite/:token", async (c) => {
  const db = await getDb();
  const [u] = await db.select().from(schema.users).where(and(eq(schema.users.inviteToken, c.req.param("token")), gt(schema.users.inviteExpiresAt, new Date())));
  if (!u) throw new HTTPException(404, { message: "This invite link is invalid or has expired. Ask your admin for a new one." });
  return c.json({ name: u.name, email: u.email });
});

publicRoutes.post("/auth/invite/:token", async (c) => {
  const { password } = z.object({ password: z.string().min(10, "Use at least 10 characters.") }).parse(await c.req.json());
  const db = await getDb();
  const [u] = await db.select().from(schema.users).where(and(eq(schema.users.inviteToken, c.req.param("token")), gt(schema.users.inviteExpiresAt, new Date())));
  if (!u) throw new HTTPException(404, { message: "This invite link is invalid or has expired." });
  await db.update(schema.users).set({ passwordHash: await hashPassword(password), inviteToken: null, inviteExpiresAt: null, lastLoginAt: new Date() }).where(eq(schema.users.id, u.id));
  await createSession(c, u.id);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- candidate apply page
publicRoutes.get("/public/apply/:token", async (c) => {
  const db = await getDb();
  const [r] = await db.select().from(schema.roleRequests).where(eq(schema.roleRequests.applyToken, c.req.param("token")));
  if (!r || !["open", "sourcing"].includes(r.status)) throw new HTTPException(404, { message: "This position is no longer open." });
  return c.json({ title: r.title, department: r.department, locationPolicy: r.locationPolicy, description: r.jdText.slice(0, 3000) });
});

publicRoutes.post("/public/apply/:token", async (c) => {
  const db = await getDb();
  const [r] = await db.select().from(schema.roleRequests).where(eq(schema.roleRequests.applyToken, c.req.param("token")));
  if (!r || !["open", "sourcing"].includes(r.status)) throw new HTTPException(404, { message: "This position is no longer open." });
  const form = await c.req.parseBody();
  const name = String(form.name ?? "").trim();
  const email = String(form.email ?? "").trim().toLowerCase();
  const consent = String(form.consent ?? "") === "on" || String(form.consent ?? "") === "true";
  const file = form.cv;
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) throw new HTTPException(400, { message: "Please enter your name and a valid email." });
  if (!consent) throw new HTTPException(400, { message: "Please agree to the privacy notice so we can process your CV." });
  if (!(file instanceof File)) throw new HTTPException(400, { message: "Please attach your CV." });
  if (file.size > 4 * 1024 * 1024) throw new HTTPException(400, { message: "The CV must be smaller than 4 MB." });
  const okTypes = ["application/pdf", "text/plain", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword"];
  if (!okTypes.includes(file.type)) throw new HTTPException(400, { message: "Please upload a PDF, Word or text file." });
  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const linkedinUrl = normalizeLinkedin(String(form.linkedin ?? ""));
  // Link to an existing candidate when we can.
  const [existing] = await db.select().from(schema.candidates).where(eq(schema.candidates.email, email)).limit(1);
  const [app] = await db.insert(schema.applications).values({
    requestId: r.id, candidateId: existing?.id ?? null, name, email, linkedinUrl, note: String(form.note ?? "").slice(0, 2000),
    cvFileName: file.name.slice(0, 200), cvMime: file.type, cvBase64: base64,
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
});

publicRoutes.get("/public/unsubscribe/:candidateId", async (c) => {
  const db = await getDb();
  const [cand] = await db.select().from(schema.candidates).where(eq(schema.candidates.id, c.req.param("candidateId")));
  if (cand) {
    await db.insert(schema.suppressionList).values({ candidateId: cand.id, email: cand.email, linkedinUrl: cand.linkedinUrl, reason: "opted_out" });
  }
  return c.text("You won't hear from York Press about this again. Your contact details will be deleted.");
});

// ---------------------------------------------------------------- SignalHire webhook
publicRoutes.post("/webhooks/signalhire/:secret", async (c) => {
  if (c.req.param("secret") !== env.webhookSecret) return c.json({ ok: false }, 403);
  const payload = await c.req.json().catch(() => null);
  // Reply fast (SignalHire waits max 10 s); processing is quick DB work.
  if (Array.isArray(payload)) {
    const results = payload.map((r: any) => parseCandidate(String(r.item), String(r.status), r.candidate));
    await applyRevealResults(results);
    await resumeWaitingRuns();
  }
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- cron + internal
publicRoutes.get("/cron/daily", async (c) => {
  const auth = c.req.header("authorization");
  if (env.cronSecret ? auth !== `Bearer ${env.cronSecret}` : env.isProd) return c.json({ ok: false }, 401);
  return c.json(await runDaily());
});

publicRoutes.post("/internal/runs/:id/continue", async (c) => {
  if (c.req.header("x-internal-secret") !== env.internalSecret) return c.json({ ok: false }, 403);
  await runPipeline(c.req.param("id"));
  return c.json({ ok: true });
});
