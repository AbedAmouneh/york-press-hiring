import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, asc, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { getDb, schema } from "../db/client.js";
import { json } from "../validate.js";
import { hasRole, requireRole, type AppEnv, type SessionUser } from "../auth.js";
import { RoleCandidatePatch } from "../../shared/schemas.js";
import { canEditCandidates, isStaff, loadRequest } from "./access.js";
import { appIsPublic, env, mock } from "../env.js";
import { revealContacts } from "../services/providers/signalhire.js";
import { applyRevealResults } from "../services/pipeline.js";
import { updateSettings } from "../services/settings.js";
import { readCv } from "../services/cv-store.js";
import { revealAvailable } from "../services/providers/select.js";

const canSeeContacts = (u: SessionUser, r: typeof schema.roleRequests.$inferSelect) => isStaff(u) || r.hiringManagerId === u.id;

async function latestOutreach(rcIds: string[]) {
  if (!rcIds.length) return new Map<string, typeof schema.outreachMessages.$inferSelect>();
  const db = await getDb();
  const msgs = await db.select().from(schema.outreachMessages).where(inArray(schema.outreachMessages.roleCandidateId, rcIds)).orderBy(desc(schema.outreachMessages.queuedAt));
  const m = new Map<string, typeof msgs[number]>();
  for (const x of msgs) if (!m.has(x.roleCandidateId)) m.set(x.roleCandidateId, x);
  return m;
}

async function loadRc(id: string, user: SessionUser) {
  const db = await getDb();
  const [row] = await db
    .select({ rc: schema.roleCandidates, c: schema.candidates })
    .from(schema.roleCandidates)
    .innerJoin(schema.candidates, eq(schema.candidates.id, schema.roleCandidates.candidateId))
    .where(eq(schema.roleCandidates.id, id));
  if (!row) throw new HTTPException(404, { message: "Candidate not found." });
  const request = await loadRequest(row.rc.requestId, user);
  return { ...row, request };
}

export { isNotNull };

export const candidateRoutes = new Hono<AppEnv>()
  .get("/requests/:id/candidates", async (c) => {
    const user = c.get("user");
    const r = await loadRequest(c.req.param("id"), user);
    const db = await getDb();
    const rows = await db
      .select({ rc: schema.roleCandidates, c: schema.candidates })
      .from(schema.roleCandidates)
      .innerJoin(schema.candidates, eq(schema.candidates.id, schema.roleCandidates.candidateId))
      .where(eq(schema.roleCandidates.requestId, r.id))
      .orderBy(asc(schema.roleCandidates.rank), desc(schema.roleCandidates.prescore));
    const outreach = await latestOutreach(rows.map((x) => x.rc.id));
    const contacts = canSeeContacts(user, r);
    return c.json({
      canEdit: canEditCandidates(user, r),
      isRecruiter: hasRole(user, "recruiter", "admin"),
      candidates: rows.map(({ rc, c: cand }) => ({
        id: rc.id,
        candidateId: cand.id,
        rank: rc.rank,
        score: rc.score,
        isTop10: rc.isTop10,
        newContender: rc.newContender,
        status: rc.status,
        hmDecision: rc.hmDecision,
        fullName: cand.fullName,
        headline: cand.headline,
        currentTitle: cand.currentTitle,
        currentCompany: cand.currentCompany,
        location: cand.location,
        totalYears: cand.totalYears,
        sources: cand.sources,
        isSample: cand.isSample,
        hasEmail: !!cand.email,
        email: contacts ? cand.email : null,
        linkedinUrl: cand.linkedinUrl,
        redFlags: rc.redFlags,
        outreach: outreach.get(rc.id) ? { channel: outreach.get(rc.id)!.channel, status: outreach.get(rc.id)!.status } : null,
      })),
    });
  })
  .get("/role-candidates/:id", async (c) => {
    const user = c.get("user");
    const { rc, c: cand, request } = await loadRc(c.req.param("id"), user);
    const db = await getDb();
    const messages = await db.select().from(schema.outreachMessages).where(eq(schema.outreachMessages.roleCandidateId, rc.id)).orderBy(desc(schema.outreachMessages.queuedAt));
    const reveals = await db.select().from(schema.contactReveals).where(eq(schema.contactReveals.roleCandidateId, rc.id)).orderBy(desc(schema.contactReveals.requestedAt));
    const otherRoles = await db
      .select({ id: schema.roleRequests.id, title: schema.roleRequests.title, status: schema.roleCandidates.status, score: schema.roleCandidates.score })
      .from(schema.roleCandidates)
      .innerJoin(schema.roleRequests, eq(schema.roleRequests.id, schema.roleCandidates.requestId))
      .where(and(eq(schema.roleCandidates.candidateId, cand.id), ne(schema.roleCandidates.requestId, request.id)));
    const applications = await db
      .select({ id: schema.applications.id, createdAt: schema.applications.createdAt, cvFileName: schema.applications.cvFileName, score: schema.applications.score })
      .from(schema.applications)
      .where(and(eq(schema.applications.requestId, request.id), eq(schema.applications.candidateId, cand.id)));
    const contacts = canSeeContacts(user, request);
    return c.json({
      canEdit: canEditCandidates(user, request),
      isRecruiter: hasRole(user, "recruiter", "admin"),
      request: { id: request.id, title: request.title, scorecardWeights: request.scorecardWeights },
      roleCandidate: rc,
      candidate: { ...cand, email: contacts ? cand.email : null, phone: contacts ? cand.phone : null, hasEmail: !!cand.email },
      messages: contacts ? messages : [],
      reveals,
      otherRoles,
      applications,
    });
  })
  .patch("/role-candidates/:id", json(RoleCandidatePatch), async (c) => {
    const user = c.get("user");
    const { rc, request } = await loadRc(c.req.param("id"), user);
    if (!canEditCandidates(user, request)) throw new HTTPException(403, { message: "You can view but not change candidates for this role." });
    const body = c.req.valid("json");
    const recruiter = hasRole(user, "recruiter", "admin");
    const patch = recruiter ? body : { hmDecision: body.hmDecision, hmComment: body.hmComment };
    const db = await getDb();
    await db.update(schema.roleCandidates).set(Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))).where(eq(schema.roleCandidates.id, rc.id));
    if (body.status === "rejected" && recruiter) {
      await db.update(schema.outreachMessages).set({ status: "cancelled" }).where(and(eq(schema.outreachMessages.roleCandidateId, rc.id), inArray(schema.outreachMessages.status, ["queued", "awaiting_approval", "approved"])));
    }
    return c.json({ ok: true });
  })
  .post("/role-candidates/:id/reveal", async (c) => {
    const user = requireRole(c, "recruiter", "admin");
    const { rc, c: cand } = await loadRc(c.req.param("id"), user);
    if (cand.email) return c.json({ ok: true, already: true });
    if (!revealAvailable()) throw new HTTPException(400, { message: "SignalHire isn't set up yet, so contact details can't be looked up." });
    const item = cand.linkedinUrl ?? cand.signalhireUid;
    if (!item) throw new HTTPException(400, { message: "No LinkedIn URL or SignalHire ID to look this person up." });
    const db = await getDb();
    const callback = appIsPublic() && !mock.signalhire ? `${env.appUrl}/api/webhooks/signalhire/${env.webhookSecret}` : null;
    const res = await revealContacts([item], callback);
    await db.insert(schema.contactReveals).values({ roleCandidateId: rc.id, candidateId: cand.id, item, requestId: res.requestId });
    if (res.creditsLeft != null) await updateSettings({ signalhireCreditsLeft: res.creditsLeft });
    if (res.results) {
      await applyRevealResults(res.results, res.mock);
      const [updated] = await db.select().from(schema.candidates).where(eq(schema.candidates.id, cand.id));
      return c.json({ ok: true, found: !!updated.email || !!updated.phone, pending: false });
    }
    return c.json({ ok: true, pending: true });
  })
  .get("/requests/:id/applications", async (c) => {
    const r = await loadRequest(c.req.param("id"), c.get("user"));
    const db = await getDb();
    const rows = await db
      .select({
        id: schema.applications.id, name: schema.applications.name, email: schema.applications.email, linkedinUrl: schema.applications.linkedinUrl,
        note: schema.applications.note, cvFileName: schema.applications.cvFileName, score: schema.applications.score,
        analysis: schema.applications.analysis, candidateId: schema.applications.candidateId, createdAt: schema.applications.createdAt,
      })
      .from(schema.applications)
      .where(eq(schema.applications.requestId, r.id))
      .orderBy(desc(schema.applications.createdAt));
    return c.json({ applications: canSeeContacts(c.get("user"), r) ? rows : rows.map((x) => ({ ...x, email: null })) });
  })
  .get("/applications/:id/cv", async (c) => {
    const db = await getDb();
    const [a] = await db.select().from(schema.applications).where(eq(schema.applications.id, c.req.param("id")));
    if (!a) throw new HTTPException(404, { message: "CV not found." });
    const r = await loadRequest(a.requestId, c.get("user"));
    if (!canSeeContacts(c.get("user"), r)) throw new HTTPException(403, { message: "You don't have access to CVs for this role." });
    const bytes = await readCv(a);
    if (!bytes) throw new HTTPException(404, { message: "This CV file is no longer stored." });
    return new Response(bytes, {
      headers: {
        "Content-Type": a.cvMime,
        "Content-Disposition": `attachment; filename="${a.cvFileName.replace(/["\\\r\n]/g, "")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
