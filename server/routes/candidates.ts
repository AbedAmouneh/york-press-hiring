import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import { getDb, schema } from "../db/client.js";
import { json } from "../validate.js";
import { hasRole, requireRole, type AppEnv, type SessionUser } from "../auth.js";
import { ApplicationPatch, ContactDraftInput, ContactInput, RoleCandidatePatch } from "../../shared/schemas.js";
import { ContactError, draftContact, sendContact } from "../services/outreach.js";
import { canEditCandidates, isStaff, loadRequest, visibleRequests } from "./access.js";
import { appIsPublic, env, mock } from "../env.js";
import { revealContacts } from "../services/providers/signalhire.js";
import { applyRevealResults } from "../services/pipeline.js";
import { updateSettings } from "../services/settings.js";
import { readCv } from "../services/cv-store.js";
import { scoreApplication } from "../services/applications.js";
import { revealAvailable } from "../services/providers/select.js";
import { reserveReveals, settleReveals } from "../services/credit-budget.js";
import { findLinkedinUrls, linkedinLookupAvailable, probeLookup } from "../services/linkedin-finder.js";

const canSeeContacts = (u: SessionUser, r: typeof schema.roleRequests.$inferSelect) => isStaff(u) || r.hiringManagerId === u.id;

async function latestOutreach(rcIds: string[]) {
  if (!rcIds.length) return new Map<string, typeof schema.outreachMessages.$inferSelect>();
  const db = await getDb();
  // The newest message per candidate only, not every message ever queued.
  const msgs = await db
    .selectDistinctOn([schema.outreachMessages.roleCandidateId])
    .from(schema.outreachMessages)
    .where(inArray(schema.outreachMessages.roleCandidateId, rcIds))
    .orderBy(schema.outreachMessages.roleCandidateId, desc(schema.outreachMessages.queuedAt));
  return new Map(msgs.map((x) => [x.roleCandidateId, x]));
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
  /** Look up LinkedIn profiles for this role's candidates who don't have one yet (Top 10 first, at most 50). */
  .post("/requests/:id/linkedin", async (c) => {
    const user = requireRole(c, "recruiter", "admin");
    const r = await loadRequest(c.req.param("id"), user);
    if (!linkedinLookupAvailable()) throw new HTTPException(400, { message: "LinkedIn lookup needs a Brave Search or Gemini key (BRAVE_SEARCH_API_KEY or GEMINI_API_KEY)." });
    const db = await getDb();
    const rows = await db
      .select({ c: schema.candidates })
      .from(schema.roleCandidates)
      .innerJoin(schema.candidates, eq(schema.candidates.id, schema.roleCandidates.candidateId))
      .where(and(eq(schema.roleCandidates.requestId, r.id), isNull(schema.candidates.linkedinUrl), eq(schema.candidates.isSample, false)))
      .orderBy(desc(schema.roleCandidates.isTop10), asc(schema.roleCandidates.rank))
      .limit(50);
    const people = rows.map(({ c: p }) => ({ id: p.id, fullName: p.fullName, currentTitle: p.currentTitle, currentCompany: p.currentCompany, location: p.location }));
    // Stop starting new lookups after 3.5 minutes so the request ends well inside the 5-minute function limit.
    const urls = await findLinkedinUrls(people, null, 5, Date.now() + 210_000);
    for (const [candidateId, url] of urls) {
      await db.update(schema.candidates).set({ linkedinUrl: url }).where(and(eq(schema.candidates.id, candidateId), isNull(schema.candidates.linkedinUrl)));
    }
    if (!urls.size && urls.error) throw new HTTPException(502, { message: urls.error });
    return c.json({ checked: urls.checked, found: urls.size, remaining: people.length - urls.checked });
  })
  /** Diagnostics for one candidate: what each Gemini model answered to the LinkedIn search. */
  .post("/role-candidates/:id/linkedin-probe", async (c) => {
    const user = requireRole(c, "recruiter", "admin");
    const { c: p } = await loadRc(c.req.param("id"), user);
    if (!linkedinLookupAvailable()) throw new HTTPException(400, { message: "LinkedIn lookup needs a Brave Search or Gemini key (BRAVE_SEARCH_API_KEY or GEMINI_API_KEY)." });
    return c.json({ person: p.fullName, results: await probeLookup(p) });
  })
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
        phone: contacts ? cand.phone : null,
        linkedinUrl: cand.linkedinUrl,
        dateContacted: rc.dateContacted,
        followUpDate: rc.followUpDate,
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
      // Only roles this viewer may open: a hiring manager must not learn about other roles a candidate is on.
      .where(and(eq(schema.roleCandidates.candidateId, cand.id), ne(schema.roleCandidates.requestId, request.id), visibleRequests(user)));
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
      // Who pressed Send on each message, by user id.
      senders: Object.fromEntries((contacts && messages.some((m) => m.senderId)
        ? await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(inArray(schema.users.id, [...new Set(messages.map((m) => m.senderId).filter((x): x is string => !!x))]))
        : []).map((u) => [u.id, u.name])) as Record<string, string>,
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
    const sent = Object.entries(body).filter(([, v]) => v !== undefined).map(([k]) => k);
    // Hiring managers decide Yes/No and comment; status and dates are the recruiter's.
    if (!recruiter && sent.some((k) => k !== "hmDecision" && k !== "hmComment")) {
      throw new HTTPException(403, { message: "Only recruiters can change a candidate's status or dates." });
    }
    const patch = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
    if (!Object.keys(patch).length) throw new HTTPException(400, { message: "Nothing to change." });
    const db = await getDb();
    await db.update(schema.roleCandidates).set(patch).where(eq(schema.roleCandidates.id, rc.id));
    if (body.status === "rejected" && recruiter) {
      await db.update(schema.outreachMessages).set({ status: "cancelled" }).where(and(eq(schema.outreachMessages.roleCandidateId, rc.id), inArray(schema.outreachMessages.status, ["queued", "awaiting_approval", "approved"])));
    }
    return c.json({ ok: true });
  })
  /** The message the Contact window starts with, for one channel. Nothing is saved or sent. */
  .post("/role-candidates/:id/contact/draft", json(ContactDraftInput), async (c) => {
    const user = c.get("user");
    const row = await loadRc(c.req.param("id"), user);
    if (!canEditCandidates(user, row.request)) throw new HTTPException(403, { message: "Only recruiters and this role's hiring manager can contact candidates." });
    const { channel, kind } = c.req.valid("json");
    return c.json(await draftContact(row, channel, kind, user));
  })
  /** Send (email), approve for Cowork (LinkedIn) or record (WhatsApp) a message someone wrote or edited. */
  .post("/role-candidates/:id/contact", json(ContactInput), async (c) => {
    const user = c.get("user");
    const row = await loadRc(c.req.param("id"), user);
    if (!canEditCandidates(user, row.request)) throw new HTTPException(403, { message: "Only recruiters and this role's hiring manager can contact candidates." });
    try {
      const { message, link } = await sendContact(row, c.req.valid("json"), user);
      return c.json({ ok: true, messageId: message.id, status: message.status, link });
    } catch (e) {
      if (e instanceof ContactError) throw new HTTPException(400, { message: e.message });
      throw e;
    }
  })
  .post("/role-candidates/:id/reveal", async (c) => {
    const user = requireRole(c, "recruiter", "admin");
    const { rc, c: cand } = await loadRc(c.req.param("id"), user);
    if (cand.email) return c.json({ ok: true, already: true });
    if (!revealAvailable()) throw new HTTPException(400, { message: "SignalHire isn't set up yet, so contact details can't be looked up." });
    const item = cand.linkedinUrl ?? cand.signalhireUid;
    if (!item) throw new HTTPException(400, { message: "No LinkedIn URL or SignalHire ID to look this person up." });
    // Hold the credit first (so two clicks or a running reveal can't both spend the last one), then call SignalHire.
    const { rows: held, budget } = await reserveReveals([{ roleCandidateId: rc.id, candidateId: cand.id, item }]);
    if (!held.length) throw new HTTPException(400, { message: `This month's SignalHire limit of ${budget.limit} credits is used up. It can be raised in Settings.` });
    const callback = appIsPublic() && !mock.signalhire ? `${env.appUrl}/api/webhooks/signalhire/${env.webhookSecret}` : null;
    let res: Awaited<ReturnType<typeof revealContacts>>;
    try {
      res = await revealContacts([item], callback);
    } catch (e) {
      await settleReveals([held[0].id], { failed: true });
      throw e;
    }
    await settleReveals([held[0].id], { requestId: res.requestId });
    const db = await getDb();
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
        status: schema.applications.status, hmDecision: schema.applications.hmDecision, hmComment: schema.applications.hmComment,
      })
      .from(schema.applications)
      .where(eq(schema.applications.requestId, r.id))
      .orderBy(desc(schema.applications.createdAt));
    const contacts = canSeeContacts(c.get("user"), r);
    // One row per email: the newest CV, with earlier ones from the same email listed under it.
    const groups = new Map<string, { latest: (typeof rows)[number]; earlier: { id: string; cvFileName: string; score: number | null; createdAt: Date }[] }>();
    for (const x of rows) {
      const key = x.email.toLowerCase();
      const g = groups.get(key);
      if (g) g.earlier.push({ id: x.id, cvFileName: x.cvFileName, score: x.score, createdAt: x.createdAt });
      else groups.set(key, { latest: x, earlier: [] });
    }
    // Possible match with someone already sourced for this role (same email). Unverified: shown, never applied.
    const emails = [...groups.keys()];
    const matches = contacts && emails.length
      ? await db
        .select({ email: schema.candidates.email, rank: schema.roleCandidates.rank, rcId: schema.roleCandidates.id })
        .from(schema.roleCandidates)
        .innerJoin(schema.candidates, eq(schema.candidates.id, schema.roleCandidates.candidateId))
        .where(and(eq(schema.roleCandidates.requestId, r.id), inArray(schema.candidates.email, emails)))
      : [];
    const matchBy = new Map(matches.map((m) => [m.email?.toLowerCase(), { rank: m.rank, roleCandidateId: m.rcId }]));
    return c.json({
      canEdit: canEditCandidates(c.get("user"), r),
      isRecruiter: hasRole(c.get("user"), "recruiter", "admin"),
      applications: [...groups.values()].map(({ latest: x, earlier }) => ({
        ...x,
        email: contacts ? x.email : null,
        sourcedMatch: contacts ? matchBy.get(x.email.toLowerCase()) ?? null : null,
        earlier: contacts ? earlier : [],
      })),
    });
  })
  /** Status (recruiters) and Yes/Maybe/No with a comment (hiring manager) for a CV received. */
  .patch("/applications/:id", json(ApplicationPatch), async (c) => {
    const user = c.get("user");
    const db = await getDb();
    const [a] = await db.select().from(schema.applications).where(eq(schema.applications.id, c.req.param("id")));
    if (!a) throw new HTTPException(404, { message: "CV not found." });
    const r = await loadRequest(a.requestId, user);
    if (!canEditCandidates(user, r)) throw new HTTPException(403, { message: "You can view but not change applicants for this role." });
    const patch = Object.fromEntries(Object.entries(c.req.valid("json")).filter(([, v]) => v !== undefined));
    if (!hasRole(user, "recruiter", "admin") && "status" in patch) {
      throw new HTTPException(403, { message: "Only recruiters can change an applicant's status." });
    }
    if (!Object.keys(patch).length) throw new HTTPException(400, { message: "Nothing to change." });
    // Every CV from the same email on this role shares one decision.
    await db.update(schema.applications).set(patch).where(and(eq(schema.applications.requestId, a.requestId), eq(schema.applications.email, a.email)));
    return c.json({ ok: true });
  })
  /** Score a CV again (e.g. after the AI service failed the first time). */
  .post("/applications/:id/score", async (c) => {
    const user = requireRole(c, "recruiter", "admin");
    const db = await getDb();
    const [a] = await db.select().from(schema.applications).where(eq(schema.applications.id, c.req.param("id")));
    if (!a) throw new HTTPException(404, { message: "CV not found." });
    const r = await loadRequest(a.requestId, user);
    return c.json({ ok: await scoreApplication(a, r) });
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
