import { and, desc, eq, gt, inArray, isNotNull, isNull, lt, notInArray, or, sql } from "drizzle-orm";
import { waitUntil } from "@vercel/functions";
import { getDb, schema } from "../db/client.js";
import { aiFeatures, appIsPublic, env, mock, POOL_SIZE, TOP_N } from "../env.js";
import type { RunState } from "../db/schema.js";
import type { Weights } from "../../shared/types.js";
import { buildBrief, collectScoreBatch, scoreBatch, submitScoreBatch, totalScore, webFindings, type ScoreResult } from "./claude.js";
import { lastCreditsLeft, revealContacts, type RevealResult } from "./providers/signalhire.js";
import { providerLabel, revealAvailable, searchProviders, skippedProviders } from "./providers/select.js";
import type { NormalizedProfile } from "./providers/types.js";
import { mergeProfiles, nameKey, prescore, type MergedProfile } from "./merge.js";
import { getSettings, logUsage, updateSettings, weightsFor } from "./settings.js";
import { toAI, toReq } from "./mappers.js";
import { drainEmailQueue, isSuppressed, queueOutreach } from "./outreach.js";
import { notifyRoles, notifyUsers } from "./notify.js";
import { captureError } from "../monitoring.js";
import { enqueueRun, queueEnabled } from "./queue.js";

const STEPS = ["brief", "search", "enrich", "score", "rank", "reveal", "outreach", "done"] as const;
type Step = (typeof STEPS)[number];
type Run = typeof schema.sourcingRuns.$inferSelect;
type Request = typeof schema.roleRequests.$inferSelect;

const TIME_BUDGET_MS = 230_000;
const WEB_ENRICH_TOP = 20;
const REVEAL_WAIT_MS = 20 * 60_000;

// ------------------------------------------------------------------ scheduling

export async function startRun(requestId: string, kind: "initial" | "weekly" | "manual") {
  const db = await getDb();
  const active = await db
    .select({ id: schema.sourcingRuns.id })
    .from(schema.sourcingRuns)
    .where(and(eq(schema.sourcingRuns.requestId, requestId), inArray(schema.sourcingRuns.status, ["queued", "running", "waiting"])))
    .limit(1);
  if (active.length) return active[0].id;
  const [run] = await db.insert(schema.sourcingRuns).values({ requestId, kind, state: { log: [] } }).returning();
  if (kind === "initial") {
    await db.update(schema.roleRequests).set({ status: "sourcing", updatedAt: new Date() }).where(eq(schema.roleRequests.id, requestId));
  }
  kick(run.id);
  return run.id;
}

function reportBackgroundError(e: unknown, runId: string) {
  console.error("pipeline", e);
  void captureError(e, { tags: { area: "pipeline" }, extra: { runId } });
}

/** Queue the run with QStash (retries if a call fails). Returns false when the queue isn't set up or is down. */
async function tryQueue(runId: string) {
  try {
    return await enqueueRun(runId);
  } catch (e) {
    reportBackgroundError(e, runId); // QStash unavailable: fall back below rather than losing the run
    return false;
  }
}

/** Start a run: through the queue when configured, otherwise in the background of this request. */
export function kick(runId: string) {
  const work = (async () => {
    if (await tryQueue(runId)) return;
    await runPipeline(runId);
  })().catch((e) => reportBackgroundError(e, runId));
  if (env.onVercel) waitUntil(work);
}

/** Continue a run that used up this call's time budget, in a fresh function call. */
function continueLater(runId: string) {
  const work = (async () => {
    if (await tryQueue(runId)) return;
    if (env.onVercel) {
      await fetch(`${env.appUrl}/api/internal/runs/${runId}/continue`, {
        method: "POST",
        headers: {
          "x-internal-secret": env.internalSecret,
          // Lets the call through Vercel's login wall on protected preview deployments.
          ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET ? { "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET } : {}),
        },
      });
    } else {
      setTimeout(() => kick(runId), 50);
    }
  })().catch((e) => reportBackgroundError(e, runId));
  if (env.onVercel) waitUntil(work);
}

// ------------------------------------------------------------------ runner

async function acquire(runId: string): Promise<Run | null> {
  const db = await getDb();
  const now = new Date();
  const [run] = await db
    .update(schema.sourcingRuns)
    .set({ lockedUntil: new Date(now.getTime() + 6 * 60_000), status: "running", startedAt: sql`coalesce(${schema.sourcingRuns.startedAt}, now())` })
    .where(and(
      eq(schema.sourcingRuns.id, runId),
      notInArray(schema.sourcingRuns.status, ["done", "failed"]),
      or(isNull(schema.sourcingRuns.lockedUntil), lt(schema.sourcingRuns.lockedUntil, now)),
    ))
    .returning();
  return run ?? null;
}

async function save(runId: string, patch: Partial<typeof schema.sourcingRuns.$inferInsert>) {
  const db = await getDb();
  await db.update(schema.sourcingRuns).set(patch).where(eq(schema.sourcingRuns.id, runId));
}

function log(state: RunState, msg: string) {
  state.log.push({ at: new Date().toISOString(), msg });
}

/**
 * "busy": another call holds the run's lock (it may have crashed; the lock expires after 6 minutes),
 * so the queue should retry later. "skipped": nothing to do (finished, failed or unknown run).
 */
export type RunOutcome = "ran" | "busy" | "skipped";

async function whyNotAcquired(runId: string): Promise<RunOutcome> {
  const db = await getDb();
  const [r] = await db.select({ status: schema.sourcingRuns.status, lockedUntil: schema.sourcingRuns.lockedUntil }).from(schema.sourcingRuns).where(eq(schema.sourcingRuns.id, runId));
  return r && !["done", "failed"].includes(r.status) && r.lockedUntil && r.lockedUntil > new Date() ? "busy" : "skipped";
}

export async function runPipeline(runId: string): Promise<RunOutcome> {
  const run = await acquire(runId);
  if (!run) return whyNotAcquired(runId);
  const db = await getDb();
  const [request] = await db.select().from(schema.roleRequests).where(eq(schema.roleRequests.id, run.requestId));
  const deadline = Date.now() + TIME_BUDGET_MS;
  const state: RunState = run.state ?? { log: [] };
  let step = run.step as Step;
  const counters = {
    found: run.found, kept: run.kept, newContenders: run.newContenders, pdlRecords: run.pdlRecords,
    signalhireSearches: run.signalhireSearches, signalhireCredits: run.signalhireCredits, webSearches: run.webSearches,
  };
  try {
    while (step !== "done") {
      if (Date.now() > deadline) {
        await save(runId, { step, state, ...counters, lockedUntil: null, status: "queued" });
        continueLater(runId);
        return "ran";
      }
      const result = await STEP_FNS[step]({ run, request, state, counters, deadline });
      if (result === "waiting") {
        await save(runId, { step, state, ...counters, lockedUntil: null, status: "waiting" });
        return "ran";
      }
      if (result === "again") continue;
      step = STEPS[STEPS.indexOf(step) + 1];
      await save(runId, { step, state, ...counters });
    }
    await finish(run, request, state, counters);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    captureError(e, { tags: { area: "pipeline", step, kind: run.kind }, extra: { runId, requestId: run.requestId } });
    log(state, `Failed at step "${step}": ${message}`);
    await save(runId, { step, state, ...counters, status: "failed", error: message, lockedUntil: null, finishedAt: new Date() });
    if (request.status === "sourcing") {
      await db.update(schema.roleRequests).set({ status: "open" }).where(eq(schema.roleRequests.id, request.id));
    }
    await notifyRoles(["recruiter"], { type: "run_failed", title: `Sourcing failed for ${request.title}`, link: `/roles/${request.id}`, emailBody: `The sourcing run stopped at "${step}": ${message}\nYou can re-run it from the role page.` });
  }
  return "ran";
}

type Ctx = { run: Run; request: Request; state: RunState; counters: Record<string, number>; deadline: number };
type StepResult = void | "waiting" | "again";

const STEP_FNS: Record<Exclude<Step, "done">, (ctx: Ctx) => Promise<StepResult>> = {
  brief: stepBrief,
  search: stepSearch,
  enrich: stepEnrich,
  score: stepScore,
  rank: stepRank,
  reveal: stepReveal,
  outreach: stepOutreach,
};

// ------------------------------------------------------------------ steps

async function stepBrief({ run, request, state }: Ctx) {
  const db = await getDb();
  if (run.kind !== "initial") {
    const [prev] = await db
      .select({ state: schema.sourcingRuns.state })
      .from(schema.sourcingRuns)
      .where(and(eq(schema.sourcingRuns.requestId, request.id), eq(schema.sourcingRuns.status, "done")))
      .orderBy(desc(schema.sourcingRuns.createdAt))
      .limit(1);
    if (prev?.state?.brief) {
      state.brief = prev.state.brief;
      log(state, "Reused the saved search brief.");
      return;
    }
  }
  state.brief = await buildBrief(toReq(request), run.id);
  log(state, `Search brief ready: ${state.brief.titles.join(", ")}.`);
}

async function stepSearch({ run, request, state, counters }: Ctx) {
  const db = await getDb();
  const brief = state.brief!;
  const size = run.kind === "initial" ? POOL_SIZE : 25;
  const seed = Math.floor(Date.now() / 1000) % 100000;
  const providers = searchProviders();
  for (const skipped of skippedProviders()) log(state, `${providerLabel(skipped)} isn't set up, so it was skipped.`);
  const settled = await Promise.allSettled(providers.map((p) => p.search(brief, { size, requestTitle: request.title, seed })));
  const profiles: NormalizedProfile[] = [];
  settled.forEach((s, i) => {
    const provider = providers[i];
    const name = providerLabel(provider);
    if (s.status === "fulfilled") {
      profiles.push(...s.value.profiles);
      if (provider.name === "PDL") counters.pdlRecords += s.value.billedRecords;
      else counters.signalhireSearches += s.value.searches;
      log(state, `${name}: ${s.value.profiles.length} profiles${s.value.mock ? " (sample data)" : ""}.`);
    } else {
      log(state, `${name} search failed: ${s.reason instanceof Error ? s.reason.message : s.reason}`);
    }
  });
  if (settled.every((s) => s.status === "rejected")) throw new Error("Every candidate search failed.");
  for (const provider of providers) {
    const pdl = provider.name === "PDL";
    await logUsage({ runId: run.id, provider: pdl ? "pdl" : "signalhire", action: "search", units: pdl ? counters.pdlRecords : counters.signalhireSearches, mock: pdl ? mock.pdl : mock.signalhire });
  }
  counters.found += profiles.length;

  // Merge duplicates across sources.
  const unique = mergeProfiles(profiles, brief.excludeCompanies);

  // Skip people already screened for this role.
  const already = await db
    .select({ c: schema.candidates })
    .from(schema.roleCandidates)
    .innerJoin(schema.candidates, eq(schema.candidates.id, schema.roleCandidates.candidateId))
    .where(eq(schema.roleCandidates.requestId, request.id));
  const seenKeys = new Set(already.flatMap(({ c }) => [c.linkedinUrl, c.pdlId, c.signalhireUid, nameKey(c)].filter(Boolean) as string[]));

  const scored = unique
    .filter((p) => {
      return ![p.linkedinUrl, p.pdlId, p.signalhireUid, nameKey(p)].some((k) => k && seenKeys.has(k));
    })
    .map((p) => ({ p, pre: prescore(p, brief.titles, brief.skills, request.minYears) }))
    .sort((a, b) => b.pre - a.pre)
    .slice(0, run.kind === "initial" ? POOL_SIZE : 25);

  const newIds: string[] = [];
  for (const { p, pre } of scored) {
    const candidateId = await upsertCandidate(p);
    const [cand] = await db.select().from(schema.candidates).where(eq(schema.candidates.id, candidateId));
    if (await isSuppressed(cand)) continue;
    const [rc] = await db
      .insert(schema.roleCandidates)
      .values({ requestId: request.id, candidateId, runId: run.id, prescore: pre })
      .onConflictDoNothing()
      .returning({ id: schema.roleCandidates.id });
    if (rc) newIds.push(rc.id);
  }
  state.newRoleCandidateIds = newIds;
  counters.kept += newIds.length;
  log(state, `${unique.length} unique people after merging; ${newIds.length} new for this role.`);
}

async function upsertCandidate(p: MergedProfile) {
  const db = await getDb();
  const c = schema.candidates;
  const conds = [];
  if (p.linkedinUrl) conds.push(eq(c.linkedinUrl, p.linkedinUrl));
  if (p.pdlId) conds.push(eq(c.pdlId, p.pdlId));
  if (p.signalhireUid) conds.push(eq(c.signalhireUid, p.signalhireUid));
  conds.push(and(eq(sql`lower(${c.fullName})`, p.fullName.toLowerCase()), eq(sql`lower(coalesce(${c.currentCompany}, ''))`, (p.currentCompany ?? "").toLowerCase()))!);
  const [existing] = await db.select().from(c).where(or(...conds)).limit(1);
  const contact = p.email ? { email: p.email.toLowerCase(), phone: p.phone ?? null, contactSource: "PDL", contactRetrievedAt: new Date() } : {};
  if (existing) {
    await db.update(c).set({
      sources: [...new Set([...existing.sources, ...p.sources])],
      pdlId: existing.pdlId ?? p.pdlId ?? null,
      signalhireUid: existing.signalhireUid ?? p.signalhireUid ?? null,
      linkedinUrl: existing.linkedinUrl ?? p.linkedinUrl ?? null,
      headline: p.headline ?? existing.headline,
      currentTitle: p.currentTitle ?? existing.currentTitle,
      currentCompany: p.currentCompany ?? existing.currentCompany,
      location: p.location ?? existing.location,
      experience: p.experience.some((e) => e.start) || !existing.experience.length ? p.experience : existing.experience,
      education: p.education.length ? p.education : existing.education,
      skills: [...new Set([...existing.skills, ...p.skills])].slice(0, 60),
      totalYears: p.totalYears ?? existing.totalYears,
      openToWork: p.openToWork ?? existing.openToWork,
      profileUpdatedAt: p.profileUpdatedAt ?? existing.profileUpdatedAt,
      lastRefreshedAt: new Date(),
      ...(existing.email ? {} : contact),
    }).where(eq(c.id, existing.id));
    return existing.id;
  }
  const [row] = await db.insert(c).values({
    sources: p.sources,
    pdlId: p.pdlId ?? null,
    signalhireUid: p.signalhireUid ?? null,
    fullName: p.fullName,
    headline: p.headline ?? null,
    currentTitle: p.currentTitle ?? null,
    currentCompany: p.currentCompany ?? null,
    location: p.location ?? null,
    linkedinUrl: p.linkedinUrl ?? null,
    otherUrls: p.otherUrls ?? [],
    experience: p.experience,
    education: p.education,
    skills: p.skills.slice(0, 60),
    certifications: p.certifications ?? [],
    languages: p.languages ?? [],
    totalYears: p.totalYears ?? null,
    openToWork: p.openToWork ?? null,
    profileUpdatedAt: p.profileUpdatedAt ?? null,
    isSample: !!p.isSample,
    ...contact,
  }).returning({ id: c.id });
  return row.id;
}

async function stepEnrich({ run, state, counters, deadline }: Ctx): Promise<StepResult> {
  const settings = await getSettings();
  if (mock.claude || !settings.webSearchEnabled || !aiFeatures.webSearch) {
    if (mock.claude) log(state, "Web search skipped (mock mode).");
    else if (settings.webSearchEnabled && !aiFeatures.webSearch) log(state, "Web search skipped (not available through OpenCode).");
    return;
  }
  const db = await getDb();
  const ids = state.newRoleCandidateIds ?? [];
  if (!ids.length) return;
  const rows = await db
    .select({ rc: schema.roleCandidates, c: schema.candidates })
    .from(schema.roleCandidates)
    .innerJoin(schema.candidates, eq(schema.candidates.id, schema.roleCandidates.candidateId))
    .where(inArray(schema.roleCandidates.id, ids))
    .orderBy(desc(schema.roleCandidates.prescore))
    .limit(WEB_ENRICH_TOP);
  for (const { rc, c } of rows) {
    if (rc.webFindings) continue;
    if (Date.now() > deadline) return "again";
    const res = await webFindings({ ...toAI(c, rc), fullName: c.fullName }, run.id).catch(() => ({ findings: [], searches: 0 }));
    counters.webSearches += res.searches;
    await db.update(schema.roleCandidates).set({ webFindings: res.findings }).where(eq(schema.roleCandidates.id, rc.id));
  }
  log(state, `Web search checked the top ${rows.length} profiles.`);
}

const SCORE_CHUNK = 5;
const BATCH_POLL_SECONDS = 300;
const BATCH_GIVE_UP_MS = 24 * 3600_000;

type ScoreRow = { rc: typeof schema.roleCandidates.$inferSelect; c: typeof schema.candidates.$inferSelect };

async function unscored(ids: string[], limit?: number): Promise<ScoreRow[]> {
  if (!ids.length) return [];
  const db = await getDb();
  const q = db
    .select({ rc: schema.roleCandidates, c: schema.candidates })
    .from(schema.roleCandidates)
    .innerJoin(schema.candidates, eq(schema.candidates.id, schema.roleCandidates.candidateId))
    .where(and(inArray(schema.roleCandidates.id, ids), isNull(schema.roleCandidates.scoredAt)));
  return limit ? q.limit(limit) : q;
}

async function saveScores(rows: ScoreRow[], results: ScoreResult[], weights: Weights) {
  const db = await getDb();
  const byKey = new Map(results.map((r) => [r.key, r]));
  for (const { rc } of rows) {
    const r = byKey.get(rc.id);
    if (!r) {
      await db.update(schema.roleCandidates).set({ scoredAt: new Date(), gaps: "Needs review: the scorer returned no result." }).where(eq(schema.roleCandidates.id, rc.id));
      continue;
    }
    const { breakdown, score } = totalScore(r.breakdown, weights, r.dealBreakerMissing);
    await db.update(schema.roleCandidates).set({
      score,
      scoreBreakdown: breakdown,
      dealBreakerMissing: r.dealBreakerMissing,
      whyRecommended: r.why,
      gaps: r.dealBreakerMissing ? `Deal-breaker not met (score capped at 40). ${r.gaps}` : r.gaps,
      redFlags: r.redFlags || null,
      relevantYears: r.relevantYears,
      scoredAt: new Date(),
    }).where(eq(schema.roleCandidates.id, rc.id));
  }
}

/**
 * Weekly refreshes aren't urgent, so they score through the Message Batches API at half price.
 * The run waits and the queue checks back every few minutes. Needs the queue (QStash) to poll.
 */
const useBatchScoring = (run: Run) => run.kind === "weekly" && !mock.claude && aiFeatures.batches && queueEnabled();

/** Returns "waiting" while a batch is in flight; undefined once batch results (if any) are saved. */
async function batchScore({ run, request, state }: Ctx, weights: Weights): Promise<StepResult> {
  const ids = state.newRoleCandidateIds ?? [];
  if (!state.scoreBatch) {
    const rows = await unscored(ids);
    if (!rows.length) return;
    const chunks: { id: string; items: ReturnType<typeof toAI>[] }[] = [];
    const map: Record<string, string[]> = {};
    for (let i = 0; i < rows.length; i += SCORE_CHUNK) {
      const part = rows.slice(i, i + SCORE_CHUNK);
      const id = `chunk-${i / SCORE_CHUNK}`;
      chunks.push({ id, items: part.map(({ c, rc }) => toAI(c, rc)) });
      map[id] = part.map(({ rc }) => rc.id);
    }
    const batchId = await submitScoreBatch(toReq(request), weights, chunks);
    state.scoreBatch = { id: batchId, submittedAt: new Date().toISOString(), chunks: map };
    log(state, `Sent ${rows.length} candidates for batch scoring (half price; usually under an hour).`);
    await enqueueRun(run.id, { delaySeconds: BATCH_POLL_SECONDS });
    return "waiting";
  }
  const { id, submittedAt, chunks } = state.scoreBatch;
  const outcome = await collectScoreBatch(id, run.id);
  if (outcome.status === "processing") {
    if (Date.now() - Date.parse(submittedAt) < BATCH_GIVE_UP_MS) {
      await enqueueRun(run.id, { delaySeconds: BATCH_POLL_SECONDS });
      return "waiting";
    }
    log(state, "Batch scoring took over 24 hours; scoring the rest directly.");
  } else {
    let failed = 0;
    for (const [chunkId, rcIds] of Object.entries(chunks)) {
      const results = outcome.results.get(chunkId);
      if (!results) { failed += rcIds.length; continue; }
      await saveScores(await unscored(rcIds), results, weights);
    }
    log(state, failed ? `Batch scoring done; ${failed} candidates will be scored directly.` : "Batch scoring done.");
  }
  state.scoreBatch = undefined;
}

async function stepScore(ctx: Ctx): Promise<StepResult> {
  const { run, request, state, deadline } = ctx;
  const weights = weightsFor(request, await getSettings());
  const ids = state.newRoleCandidateIds ?? [];
  if (useBatchScoring(run) || state.scoreBatch) {
    if ((await batchScore(ctx, weights)) === "waiting") return "waiting";
  }
  // Direct scoring, a few candidates per call; also picks up anything a batch couldn't score.
  while (true) {
    if (Date.now() > deadline) return "again";
    const rows = await unscored(ids, SCORE_CHUNK);
    if (!rows.length) break;
    await saveScores(rows, await scoreBatch(toReq(request), weights, rows.map(({ c, rc }) => toAI(c, rc)), run.id), weights);
  }
  log(state, `Scored ${ids.length} candidates.`);
}

async function stepRank({ run, request, state, counters }: Ctx) {
  const db = await getDb();
  const all = await db
    .select({ id: schema.roleCandidates.id, wasTop: schema.roleCandidates.isTop10 })
    .from(schema.roleCandidates)
    .where(and(eq(schema.roleCandidates.requestId, request.id), isNotNull(schema.roleCandidates.score)))
    .orderBy(desc(schema.roleCandidates.score), desc(schema.roleCandidates.prescore));
  const newIds = new Set(state.newRoleCandidateIds ?? []);
  let contenders = 0;
  for (let i = 0; i < all.length; i++) {
    const isTop = i < TOP_N;
    const newContender = run.kind !== "initial" && isTop && newIds.has(all[i].id);
    if (newContender) contenders++;
    await db.update(schema.roleCandidates).set({ rank: i + 1, isTop10: isTop, ...(newContender ? { newContender: true } : {}) }).where(eq(schema.roleCandidates.id, all[i].id));
  }
  counters.newContenders = contenders;
  log(state, run.kind === "initial" ? `Ranked ${all.length} candidates; Top ${Math.min(TOP_N, all.length)} flagged.` : `${contenders} new contender(s) entered the Top ${TOP_N}.`);
}

/** Top-10 people to reach out to in this run: all of them for the first run, only new contenders afterwards. */
async function outreachTargets(run: Run, requestId: string) {
  const db = await getDb();
  const rc = schema.roleCandidates;
  return db
    .select({ rc, c: schema.candidates })
    .from(rc)
    .innerJoin(schema.candidates, eq(schema.candidates.id, rc.candidateId))
    .where(and(eq(rc.requestId, requestId), eq(rc.isTop10, true), eq(rc.status, "new"), ...(run.kind === "initial" ? [] : [eq(rc.newContender, true)])));
}

async function stepReveal({ run, request, state, counters }: Ctx) {
  const settings = await getSettings();
  if (!settings.signalhireRevealEnabled) { log(state, "Contact reveal is turned off in Settings."); return; }
  if (!revealAvailable()) { log(state, "SignalHire isn't set up, so contact details weren't looked up."); return; }
  const db = await getDb();
  const targets = (await outreachTargets(run, request.id)).filter(({ c }) => !c.email);
  const existing = targets.length
    ? await db.select({ rcId: schema.contactReveals.roleCandidateId }).from(schema.contactReveals).where(inArray(schema.contactReveals.roleCandidateId, targets.map((t) => t.rc.id)))
    : [];
  const done = new Set(existing.map((e) => e.rcId));
  const todo = targets.filter(({ rc, c }) => !done.has(rc.id) && (c.linkedinUrl || c.signalhireUid));
  if (!todo.length) { log(state, "No contacts to reveal."); return; }
  const items = todo.map(({ c }) => (c.linkedinUrl ?? c.signalhireUid)!);
  const callback = appIsPublic() && !mock.signalhire ? `${env.appUrl}/api/webhooks/signalhire/${env.webhookSecret}` : null;
  const res = await revealContacts(items, callback);
  for (let i = 0; i < todo.length; i++) {
    await db.insert(schema.contactReveals).values({
      roleCandidateId: todo[i].rc.id, candidateId: todo[i].c.id, runId: run.id, item: items[i], requestId: res.requestId,
    });
  }
  if (res.results) {
    const credits = await applyRevealResults(res.results, res.mock);
    counters.signalhireCredits += credits;
    log(state, `SignalHire revealed contacts for ${credits} of ${items.length} people${res.mock ? " (sample data)" : ""}.`);
  } else {
    log(state, `Asked SignalHire for ${items.length} contacts; waiting for results.`);
  }
  if (res.creditsLeft != null || lastCreditsLeft != null) await updateSettings({ signalhireCreditsLeft: res.creditsLeft ?? lastCreditsLeft });
}

/** Apply SignalHire results (from sync mode, mock mode or the webhook). Returns credits used. */
export async function applyRevealResults(results: RevealResult[], isMock = false) {
  const db = await getDb();
  let credits = 0;
  for (const r of results) {
    const [reveal] = await db
      .select()
      .from(schema.contactReveals)
      .where(and(eq(schema.contactReveals.item, r.item), eq(schema.contactReveals.status, "pending")))
      .orderBy(desc(schema.contactReveals.requestedAt))
      .limit(1);
    if (!reveal) continue;
    const success = r.status === "success";
    if (success) credits++;
    await db.update(schema.contactReveals).set({ status: r.status, receivedAt: new Date(), creditsUsed: success && !isMock ? 1 : 0 }).where(eq(schema.contactReveals.id, reveal.id));
    if (success && (r.email || r.phone)) {
      await db.update(schema.candidates).set({
        email: r.email?.toLowerCase() ?? null,
        phone: r.phone,
        contactSource: "SignalHire",
        contactRetrievedAt: new Date(),
        ...(r.linkedinUrl ? { linkedinUrl: r.linkedinUrl } : {}),
      }).where(and(eq(schema.candidates.id, reveal.candidateId), isNull(schema.candidates.email)));
    }
  }
  await logUsage({ provider: "signalhire", action: "reveal", units: credits, mock: isMock });
  return credits;
}

async function stepOutreach({ run, request, state }: Ctx): Promise<StepResult> {
  const db = await getDb();
  const pending = await db
    .select({ id: schema.contactReveals.id })
    .from(schema.contactReveals)
    .where(and(eq(schema.contactReveals.runId, run.id), eq(schema.contactReveals.status, "pending"), gt(schema.contactReveals.requestedAt, new Date(Date.now() - REVEAL_WAIT_MS))));
  if (pending.length) {
    log(state, `Waiting for ${pending.length} contact result(s) from SignalHire.`);
    return "waiting";
  }
  const targets = await outreachTargets(run, request.id);
  const q = await queueOutreach(request.id, targets.map((t) => t.rc.id), run.id);
  const drained = await drainEmailQueue();
  log(state, `Outreach: ${q.email} email(s) queued, ${q.linkedin} LinkedIn message(s) awaiting approval; ${drained.paused ? "sending is paused" : `${drained.sent} sent now`}.`);
}

async function finish(run: Run, request: Request, state: RunState, counters: Record<string, number>) {
  const db = await getDb();
  log(state, "Run finished.");
  await save(run.id, { step: "done", state, ...counters, status: "done", lockedUntil: null, finishedAt: new Date() });
  if (request.status === "sourcing" || request.status === "open") {
    await db.update(schema.roleRequests).set({ status: "open", updatedAt: new Date() }).where(eq(schema.roleRequests.id, request.id));
  }
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.roleCandidates).where(eq(schema.roleCandidates.requestId, request.id));
  if (run.kind === "initial") {
    await notifyRoles(["recruiter", "ceo"], {
      type: "run_done",
      title: `${request.title}: ${n} candidates screened, Top 10 ready`,
      link: `/roles/${request.id}`,
      emailBody: `Sourcing for ${request.title} is finished. ${n} candidates were screened and scored, and the Top 10 are flagged. Top-10 candidates with an email were contacted automatically; the rest are in the LinkedIn queue for approval.`,
    }, [request.hiringManagerId, request.requesterId]);
  } else if (counters.newContenders > 0) {
    await notifyRoles(["recruiter"], {
      type: "new_contender",
      title: `${request.title}: ${counters.newContenders} new contender(s) in the Top 10`,
      link: `/roles/${request.id}`,
      emailBody: `This week's refresh found ${counters.kept} new profile(s) for ${request.title}; ${counters.newContenders} beat the current #10.`,
    }, [request.hiringManagerId]);
  }
}

/** Called by the SignalHire webhook and the daily cron to resume runs that were waiting for contacts. */
export async function resumeWaitingRuns(force = false) {
  const db = await getDb();
  const waiting = await db.select().from(schema.sourcingRuns).where(eq(schema.sourcingRuns.status, "waiting"));
  for (const run of waiting) {
    const [pending] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.contactReveals)
      .where(and(eq(schema.contactReveals.runId, run.id), eq(schema.contactReveals.status, "pending"), gt(schema.contactReveals.requestedAt, new Date(Date.now() - REVEAL_WAIT_MS))));
    if (force || pending.n === 0) kick(run.id);
  }
}

/** Runs whose lock expired mid-way (function crashed or timed out). */
export async function resumeStaleRuns() {
  const db = await getDb();
  const stale = await db
    .select({ id: schema.sourcingRuns.id })
    .from(schema.sourcingRuns)
    .where(and(inArray(schema.sourcingRuns.status, ["queued", "running"]), or(isNull(schema.sourcingRuns.lockedUntil), lt(schema.sourcingRuns.lockedUntil, new Date()))));
  stale.forEach((r) => kick(r.id));
  return stale.length;
}

export { notifyUsers };
