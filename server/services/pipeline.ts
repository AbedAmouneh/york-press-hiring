import { and, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, ne, notInArray, or, sql } from "drizzle-orm";
import { waitUntil } from "@vercel/functions";
import { getDb, schema } from "../db/client.js";
import { aiFeatures, appIsPublic, env, mock, POOL_SIZE, redactSecrets, TOP_N } from "../env.js";
import type { RunState } from "../db/schema.js";
import { isContractWork, type Weights } from "../../shared/types.js";
import { buildBrief, collectScoreBatch, scoreBatch, scoreFractions, submitScoreBatch, totalScore, webFindings, type ScoreResult } from "./claude.js";
import { lastCreditsLeft, revealContacts, type RevealResult } from "./providers/signalhire.js";
import { providerLabel, revealAvailable, searchProviders, skippedProviders } from "./providers/select.js";
import type { NormalizedProfile } from "./providers/types.js";
import { CONTRACT_WORK_PATTERN, mergeProfiles, nameKey, prescore, type MergedProfile } from "./merge.js";
import { getSettings, logUsage, updateSettings, weightsFor } from "./settings.js";
import { reserveReveals, settleReveals } from "./credit-budget.js";
import { describeMisses, findLinkedinUrls, linkedinLookupAvailable } from "./linkedin-finder.js";
import { toAI, toReq } from "./mappers.js";
import { applyGuardrails, computeSignals, signalFacts } from "./signals.js";
import { learnedWeightsFor } from "./learning.js";
import { isSuppressed } from "./outreach.js";
import { notifyRoles, notifyUsers } from "./notify.js";
import { captureError } from "../monitoring.js";
import { enqueueRun, queueEnabled } from "./queue.js";

const STEPS = ["brief", "search", "enrich", "score", "rank", "reveal", "deep", "outreach", "done"] as const;
type Step = (typeof STEPS)[number];
type Run = typeof schema.sourcingRuns.$inferSelect;
type Request = typeof schema.roleRequests.$inferSelect;

const TIME_BUDGET_MS = 230_000;
/**
 * The shortlist gets a deep check before anyone is contacted: SignalHire's full profile (dates, education, role
 * descriptions, contacts), web research, and a second scoring on that full data. Search previews have no dates, so
 * the first scoring can't verify years or level; checking a few more than the Top 10 lets better-documented people
 * move up. On the Unlimited plan the extra reveals cost nothing beyond the monthly limit set in Settings.
 */
export const SHORTLIST = TOP_N + 5;
const REVEAL_WAIT_MS = 20 * 60_000;

// ------------------------------------------------------------------ scheduling

/**
 * A "Score again" run only scores everyone already on the role again with the current rules and ranks them: no
 * searches, no contact reveals, no web search and no outreach, so it costs Claude calls only and never contacts anyone.
 */
const RESCORE_STEPS = new Set<Step>(["brief", "score", "rank"]);

export async function startRun(requestId: string, kind: "initial" | "weekly" | "manual" | "rescore") {
  const db = await getDb();
  const active = await db
    .select({ id: schema.sourcingRuns.id })
    .from(schema.sourcingRuns)
    .where(and(eq(schema.sourcingRuns.requestId, requestId), inArray(schema.sourcingRuns.status, ["queued", "running", "waiting"])))
    .limit(1);
  if (active.length) {
    // Picks the run up again if the call that held it died (its lock has expired); otherwise a no-op.
    kick(active[0].id);
    return active[0].id;
  }
  // Until one run has finished, a re-run is still the first run: it checks the top 15 and contacts the Top 10.
  if (kind === "weekly" || kind === "manual") {
    const [finished] = await db
      .select({ id: schema.sourcingRuns.id })
      .from(schema.sourcingRuns)
      .where(and(eq(schema.sourcingRuns.requestId, requestId), eq(schema.sourcingRuns.status, "done")))
      .limit(1);
    if (!finished) kind = "initial";
  }
  // The database allows one active run per role: if another call started one a moment ago, use that one.
  const [run] = await db.insert(schema.sourcingRuns).values({ requestId, kind, state: { log: [] } }).onConflictDoNothing().returning();
  if (!run) {
    const [other] = await db
      .select({ id: schema.sourcingRuns.id })
      .from(schema.sourcingRuns)
      .where(and(eq(schema.sourcingRuns.requestId, requestId), inArray(schema.sourcingRuns.status, ["queued", "running", "waiting"])))
      .limit(1);
    return other.id;
  }
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
      notInArray(schema.sourcingRuns.status, ["done", "failed", "cancelled"]),
      or(isNull(schema.sourcingRuns.lockedUntil), lt(schema.sourcingRuns.lockedUntil, now)),
    ))
    .returning();
  return run ?? null;
}

/** Saves progress, unless closing the role cancelled the run meanwhile: a cancelled run is never brought back. */
async function save(runId: string, patch: Partial<typeof schema.sourcingRuns.$inferInsert>) {
  const db = await getDb();
  await db.update(schema.sourcingRuns).set(patch).where(and(eq(schema.sourcingRuns.id, runId), ne(schema.sourcingRuns.status, "cancelled")));
}

/** False once the run was cancelled or its role is no longer open (closed while the run was going). */
async function stillWanted(runId: string, requestId: string) {
  const db = await getDb();
  const [row] = await db
    .select({ run: schema.sourcingRuns.status, role: schema.roleRequests.status })
    .from(schema.sourcingRuns)
    .innerJoin(schema.roleRequests, eq(schema.roleRequests.id, schema.sourcingRuns.requestId))
    .where(and(eq(schema.sourcingRuns.id, runId), eq(schema.roleRequests.id, requestId)));
  return !!row && row.run !== "cancelled" && ["sourcing", "open"].includes(row.role);
}

/** Stops a run for good (the role was closed). */
export async function cancelRuns(requestId: string) {
  const db = await getDb();
  await db
    .update(schema.sourcingRuns)
    .set({ status: "cancelled", lockedUntil: null, finishedAt: new Date() })
    .where(and(eq(schema.sourcingRuns.requestId, requestId), inArray(schema.sourcingRuns.status, ["queued", "running", "waiting"])));
}

function log(state: RunState, msg: string) {
  state.log.push({ at: new Date().toISOString(), msg });
}

/** Saves what the step is doing now, so the role page shows progress during long steps (scoring, the deep check). */
async function showProgress(ctx: { run: Run; state: RunState }, text: string) {
  ctx.state.progress = text;
  await save(ctx.run.id, { state: ctx.state });
}

/**
 * "busy": another call holds the run's lock (it may have crashed; the lock expires after 6 minutes),
 * so the queue should retry later. "skipped": nothing to do (finished, failed or unknown run).
 */
export type RunOutcome = "ran" | "busy" | "skipped";

async function whyNotAcquired(runId: string): Promise<RunOutcome> {
  const db = await getDb();
  const [r] = await db.select({ status: schema.sourcingRuns.status, lockedUntil: schema.sourcingRuns.lockedUntil }).from(schema.sourcingRuns).where(eq(schema.sourcingRuns.id, runId));
  return r && !["done", "failed", "cancelled"].includes(r.status) && r.lockedUntil && r.lockedUntil > new Date() ? "busy" : "skipped";
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
      // Checked before every step, so closing the role stops paid calls, contact lookups and outreach.
      if (!(await stillWanted(runId, request.id))) {
        await cancelRuns(request.id);
        return "ran";
      }
      if (Date.now() > deadline) {
        await save(runId, { step, state, ...counters, lockedUntil: null, status: "queued" });
        continueLater(runId);
        return "ran";
      }
      const result = run.kind === "rescore" && !RESCORE_STEPS.has(step) ? undefined : await STEP_FNS[step]({ run, request, state, counters, deadline });
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
    // A provider error can echo the API key (e.g. an invalid header value), so hide secrets before saving or showing it.
    const raw = redactSecrets(e instanceof Error ? e.message : String(e));
    const message = /invalid header value/i.test(raw)
      ? `An API key in Vercel has a character that isn't allowed, often a space or line break. Paste the key again and redeploy. (${raw})`
      : /invalid x-api-key|authentication_error/i.test(raw)
        ? `Anthropic rejected the Claude API key. Create a new key at console.anthropic.com (it starts with sk-ant-api03-), paste it as ANTHROPIC_API_KEY in Vercel and redeploy. (${raw})`
        : raw;
    captureError(e, { tags: { area: "pipeline", step, kind: run.kind }, extra: { runId, requestId: run.requestId } });
    log(state, `Failed at step "${step}": ${message}`);
    await save(runId, { step, state, ...counters, status: "failed", error: message, lockedUntil: null, finishedAt: new Date() });
    // Only a role that is still sourcing becomes open again (never one closed meanwhile).
    await db.update(schema.roleRequests).set({ status: "open" }).where(and(eq(schema.roleRequests.id, request.id), eq(schema.roleRequests.status, "sourcing")));
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
  deep: stepDeep,
  outreach: stepOutreach,
};

// ------------------------------------------------------------------ steps

async function stepBrief({ run, request, state }: Ctx) {
  const db = await getDb();
  if (run.kind === "rescore") {
    const rows = await db
      .select({ id: schema.roleCandidates.id })
      .from(schema.roleCandidates)
      .where(and(eq(schema.roleCandidates.requestId, request.id), isNotNull(schema.roleCandidates.scoredAt)));
    state.newRoleCandidateIds = rows.map((r) => r.id);
    state.rescoreBefore = run.createdAt.toISOString();
    log(state, `Scoring ${rows.length} people again with the current rules. No new searches, contact lookups or messages.`);
    return;
  }
  if (run.kind !== "initial") {
    const [prev] = await db
      .select({ state: schema.sourcingRuns.state })
      .from(schema.sourcingRuns)
      .where(and(eq(schema.sourcingRuns.requestId, request.id), eq(schema.sourcingRuns.status, "done")))
      .orderBy(desc(schema.sourcingRuns.createdAt))
      .limit(1);
    // Briefs made before core keywords existed are rebuilt once, so later runs search the broader way too.
    if (prev?.state?.brief?.coreKeywords?.length) {
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
  // Chosen universities (current request, not the saved brief) with their short names, e.g. AUB.
  const education = await universityTerms(request.universities);
  const brief = { ...state.brief!, education };
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
    .map((p) => ({ p, pre: prescore(p, brief.titles, brief.skills, request.minYears, isContractWork(request.employmentType)) }))
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
  if (request.universities.length) {
    const n = request.universities.length;
    log(state, run.kind === "initial" && newIds.length < POOL_SIZE
      ? `Only ${newIds.length} people found from the ${n} chosen universit${n === 1 ? "y" : "ies"}. Widen the universities or remove them to search everyone.`
      : `Searched only graduates and students of the ${n} chosen universit${n === 1 ? "y" : "ies"}.`);
  }
}

/** Full names plus the short names people write on profiles (AUB, LAU) for the chosen universities. */
async function universityTerms(names: string[]) {
  if (!names.length) return [];
  const db = await getDb();
  const known = await db.select({ name: schema.universities.name, aka: schema.universities.aka }).from(schema.universities).where(inArray(sql`lower(${schema.universities.name})`, names.map((n) => n.toLowerCase())));
  return [...new Set([...names, ...known.flatMap((u) => u.aka)])];
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

/** Find the LinkedIn profile of every new candidate who arrived without one (Google search through Gemini). */
async function findMissingLinkedin({ run, state, deadline }: Ctx): Promise<StepResult> {
  const ids = state.newRoleCandidateIds ?? [];
  const checked = new Set(state.linkedinChecked ?? []);
  if (!linkedinLookupAvailable() || !ids.length) return;
  const db = await getDb();
  const rows = await db
    .select({ rcId: schema.roleCandidates.id, c: schema.candidates })
    .from(schema.roleCandidates)
    .innerJoin(schema.candidates, eq(schema.candidates.id, schema.roleCandidates.candidateId))
    .where(and(inArray(schema.roleCandidates.id, ids), isNull(schema.candidates.linkedinUrl), eq(schema.candidates.isSample, false)));
  const todo = rows.filter((r) => !checked.has(r.rcId));
  let found = 0;
  const why = { misses: { no_search: 0, not_found: 0, name_mismatch: 0 }, failed: 0, error: null as string | null };
  // Five at a time (one parallel group, at most a minute even if every model is slow), so a slice never runs past the time budget.
  for (let i = 0; i < todo.length; i += 5) {
    if (Date.now() > deadline) return "again";
    const slice = todo.slice(i, i + 5);
    const urls = await findLinkedinUrls(slice.map((r) => ({ id: r.c.id, fullName: r.c.fullName, currentTitle: r.c.currentTitle, currentCompany: r.c.currentCompany, location: r.c.location })), run.id);
    for (const [candidateId, url] of urls) {
      await db.update(schema.candidates).set({ linkedinUrl: url }).where(and(eq(schema.candidates.id, candidateId), isNull(schema.candidates.linkedinUrl)));
      found++;
    }
    for (const k of Object.keys(why.misses) as (keyof typeof why.misses)[]) why.misses[k] += urls.misses[k];
    why.failed += urls.failed;
    why.error ??= urls.error;
    for (const r of slice) checked.add(r.rcId);
    state.linkedinChecked = [...checked];
  }
  // Say why the others weren't found, so a lookup that never works is visible (quota, search not running, names).
  const reasons = found < todo.length ? describeMisses(why) : "";
  if (todo.length) log(state, `Found LinkedIn profiles for ${found} of ${todo.length} people${reasons ? ` (${reasons})` : ""}.`);
}

async function stepEnrich(ctx: Ctx): Promise<StepResult> {
  return findMissingLinkedin(ctx);
}

/** Web research for shortlist rows that don't have it yet. Returns "again" when time runs out. */
async function webResearch({ run, state, counters, deadline }: Ctx, rows: ScoreRow[]): Promise<StepResult> {
  const settings = await getSettings();
  if (mock.claude || !settings.webSearchEnabled || !aiFeatures.webSearch) {
    if (mock.claude) log(state, "Web search skipped (mock mode).");
    else if (settings.webSearchEnabled && !aiFeatures.webSearch) log(state, `Web search skipped (not available through ${env.aiProvider === "gemini" ? "Gemini" : "OpenCode"}).`);
    return;
  }
  const db = await getDb();
  let checked = 0;
  for (const row of rows) {
    if (row.rc.webFindings) continue;
    if (Date.now() > deadline) return "again";
    const res = await webFindings({ ...toAI(row.c, row.rc), fullName: row.c.fullName }, run.id).catch(() => ({ findings: [], searches: 0 }));
    counters.webSearches += res.searches;
    row.rc = { ...row.rc, webFindings: res.findings };
    await db.update(schema.roleCandidates).set({ webFindings: res.findings }).where(eq(schema.roleCandidates.id, row.rc.id));
    checked++;
  }
  if (checked) log(state, `Web search checked ${checked} shortlisted profile(s).`);
}

const SCORE_CHUNK = 5;
const BATCH_POLL_SECONDS = 300;
const BATCH_GIVE_UP_MS = 24 * 3600_000;

type ScoreRow = { rc: typeof schema.roleCandidates.$inferSelect; c: typeof schema.candidates.$inferSelect };

/** What the scorer sees: the profile (no name) plus facts computed in code from it. */
function scoringInput({ c, rc }: ScoreRow, request: Request) {
  return { ...toAI(c, rc), facts: signalFacts(computeSignals(c, request)) };
}

/** People not scored yet, or (for "Score again") last scored before `before`. */
async function unscored(ids: string[], limit?: number, before?: string): Promise<ScoreRow[]> {
  if (!ids.length) return [];
  const db = await getDb();
  const scoredAt = schema.roleCandidates.scoredAt;
  const q = db
    .select({ rc: schema.roleCandidates, c: schema.candidates })
    .from(schema.roleCandidates)
    .innerJoin(schema.candidates, eq(schema.candidates.id, schema.roleCandidates.candidateId))
    .where(and(inArray(schema.roleCandidates.id, ids), before ? or(isNull(scoredAt), lt(scoredAt, new Date(before))) : isNull(scoredAt)));
  return limit ? q.limit(limit) : q;
}

async function saveScores(rows: ScoreRow[], results: ScoreResult[], weights: Weights, request: Request) {
  const db = await getDb();
  const byKey = new Map(results.map((r) => [r.key, r]));
  for (const { rc, c } of rows) {
    const signals = computeSignals(c, request);
    const r = byKey.get(rc.id);
    if (!r) {
      await db.update(schema.roleCandidates).set({ scoredAt: new Date(), signals, gaps: "Needs review: the scorer returned no result." }).where(eq(schema.roleCandidates.id, rc.id));
      continue;
    }
    const guarded = applyGuardrails(r.breakdown, weights, signals);
    const { breakdown, score } = totalScore(guarded.breakdown, weights, r.dealBreakerMissing);
    const adjusted = guarded.notes.length ? ` Score adjusted: ${guarded.notes.join("; ")}.` : "";
    await db.update(schema.roleCandidates).set({
      score,
      scoreBreakdown: breakdown,
      scoreFractions: scoreFractions(guarded.breakdown, weights),
      dealBreakerMissing: r.dealBreakerMissing,
      whyRecommended: r.why,
      gaps: (r.dealBreakerMissing ? `Deal-breaker not met (score capped at 40). ${r.gaps}` : r.gaps) + adjusted,
      redFlags: r.redFlags || null,
      relevantYears: signals.relevantYears ?? r.relevantYears,
      signals,
      evidence: r.evidence?.length ? r.evidence : null,
      scoredAt: new Date(),
    }).where(eq(schema.roleCandidates.id, rc.id));
  }
}

/**
 * Score a few people in one call and save the results. If the answer is cut off (rich profiles, many must-haves)
 * or leaves people out, score them again in smaller groups instead of failing the run. Exported for tests.
 */
export async function scoreRows(rows: ScoreRow[], request: Request, weights: Weights, runId: string | null): Promise<void> {
  if (!rows.length) return;
  let results: ScoreResult[];
  try {
    results = await scoreBatch(toReq(request), weights, rows.map((row) => scoringInput(row, request)), runId);
  } catch (e) {
    if (rows.length > 1 && /cut off/.test((e as Error).message)) {
      const half = Math.ceil(rows.length / 2);
      await scoreRows(rows.slice(0, half), request, weights, runId);
      await scoreRows(rows.slice(half), request, weights, runId);
      return;
    }
    throw e;
  }
  const answered = new Set(results.map((r) => r.key));
  const missing = rows.filter(({ rc }) => !answered.has(rc.id));
  if (missing.length && missing.length < rows.length) {
    await saveScores(rows.filter(({ rc }) => answered.has(rc.id)), results, weights, request);
    await scoreRows(missing, request, weights, runId);
    return;
  }
  // Everyone answered, or a single person the scorer skipped (saved as "needs review").
  if (missing.length === rows.length && rows.length > 1) {
    const half = Math.ceil(rows.length / 2);
    await scoreRows(rows.slice(0, half), request, weights, runId);
    await scoreRows(rows.slice(half), request, weights, runId);
    return;
  }
  await saveScores(rows, results, weights, request);
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
      chunks.push({ id, items: part.map((row) => scoringInput(row, request)) });
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
      await saveScores(await unscored(rcIds), results, weights, request);
    }
    log(state, failed ? `Batch scoring done; ${failed} candidates will be scored directly.` : "Batch scoring done.");
  }
  state.scoreBatch = undefined;
}

/**
 * The scorecard for this role. The first run fixes it on the role: what was learned for the department (or across
 * departments), else the default. Later runs reuse it so all of the role's scores stay comparable.
 */
async function roleWeights(request: Request, run: Run): Promise<Weights> {
  if (request.scorecardWeights) return request.scorecardWeights;
  // A role scored before this existed used the defaults; keep them so its old and new scores stay comparable.
  const learned = run.kind === "initial" ? await learnedWeightsFor(request.department) : null;
  const weights = learned ?? weightsFor(request, await getSettings());
  const db = await getDb();
  await db.update(schema.roleRequests).set({ scorecardWeights: weights }).where(eq(schema.roleRequests.id, request.id));
  request.scorecardWeights = weights;
  return weights;
}

async function stepScore(ctx: Ctx): Promise<StepResult> {
  const { run, request, state, deadline } = ctx;
  const weights = await roleWeights(request, run);
  const ids = state.newRoleCandidateIds ?? [];
  if (useBatchScoring(run) || state.scoreBatch) {
    if ((await batchScore(ctx, weights)) === "waiting") return "waiting";
  }
  // Direct scoring, a few candidates per call; also picks up anything a batch couldn't score.
  while (true) {
    if (Date.now() > deadline) return "again";
    const rows = await unscored(ids, SCORE_CHUNK, state.rescoreBefore);
    if (!rows.length) break;
    await showProgress(ctx, `Scoring ${Math.min(ids.length, ids.length - (await unscored(ids, undefined, state.rescoreBefore)).length + rows.length)} of ${ids.length}`);
    await scoreRows(rows, request, weights, run.id);
  }
  state.progress = undefined;
  log(state, `Scored ${ids.length} candidates.`);
}

/** Rank everyone scored for the role and flag the Top 10. Returns how many people were ranked. */
async function rerank({ run, request, state, counters }: Ctx) {
  const db = await getDb();
  // Contractor and freelance roles: 2 extra points in the ranking for profiles that show freelance or contract work.
  // Only the order changes; the score people see stays the same, and nobody is left out.
  const c = schema.candidates;
  const nudge = isContractWork(request.employmentType)
    ? sql`case when concat_ws(' ', ${c.currentTitle}, ${c.headline}, ${c.currentCompany}) ~* ${CONTRACT_WORK_PATTERN} then 2 else 0 end`
    : sql`0`;
  const all = await db
    .select({ id: schema.roleCandidates.id, wasTop: schema.roleCandidates.isTop10 })
    .from(schema.roleCandidates)
    .innerJoin(c, eq(c.id, schema.roleCandidates.candidateId))
    .where(and(eq(schema.roleCandidates.requestId, request.id), isNotNull(schema.roleCandidates.score)))
    .orderBy(desc(sql`${schema.roleCandidates.score} + ${nudge}`), desc(schema.roleCandidates.score), desc(schema.roleCandidates.prescore));
  const newIds = new Set(state.newRoleCandidateIds ?? []);
  let contenders = 0;
  for (let i = 0; i < all.length; i++) {
    const isTop = i < TOP_N;
    // Scoring again brings nobody new, so it never marks contenders (they would be contacted by the next refresh).
    const newContender = run.kind !== "initial" && run.kind !== "rescore" && isTop && newIds.has(all[i].id);
    if (newContender) contenders++;
    await db.update(schema.roleCandidates).set({ rank: i + 1, isTop10: isTop, ...(newContender ? { newContender: true } : {}) }).where(eq(schema.roleCandidates.id, all[i].id));
  }
  counters.newContenders = contenders;
  return all.length;
}

async function stepRank(ctx: Ctx) {
  if (ctx.run.kind === "rescore") return rankAfterRescore(ctx);
  const n = await rerank(ctx);
  log(ctx.state, ctx.run.kind === "initial"
    ? `Ranked ${n} candidates; the top ${Math.min(SHORTLIST, n)} go to a deep check.`
    : `${ctx.counters.newContenders} new candidate(s) reached the Top ${TOP_N}; checking them in depth.`);
}

/** After "Score again": rank, say how the Top 10 changed and who now qualifies but hasn't been contacted. */
async function rankAfterRescore(ctx: Ctx) {
  const db = await getDb();
  const rc = schema.roleCandidates;
  const topIds = async () => new Set((await db.select({ id: rc.id }).from(rc).where(and(eq(rc.requestId, ctx.request.id), eq(rc.isTop10, true)))).map((r) => r.id));
  const before = await topIds();
  const n = await rerank(ctx);
  const after = await topIds();
  const movedIn = [...after].filter((id) => !before.has(id)).length;
  const { minOutreachScore } = await getSettings();
  const [{ waiting }] = await db
    .select({ waiting: sql<number>`count(*)::int` })
    .from(rc)
    .where(and(eq(rc.requestId, ctx.request.id), eq(rc.isTop10, true), eq(rc.status, "new"), gte(rc.score, minOutreachScore)));
  log(ctx.state, `Ranked ${n} candidates; ${movedIn ? `${movedIn} moved into the Top ${TOP_N}` : `the Top ${TOP_N} held`}.`);
  if (waiting) log(ctx.state, `${waiting} Top-${TOP_N} candidate(s) now score ${minOutreachScore} or more and haven't been contacted. Contact them from the role page.`);
}

/**
 * The people this run checks in depth: the top 15 for the first run; for later runs, new people who reached the
 * top 15. Only people nobody has contacted yet.
 */
async function shortlistRows(run: Run, request: Request, state: RunState): Promise<ScoreRow[]> {
  const db = await getDb();
  const rc = schema.roleCandidates;
  const rows = await db
    .select({ rc, c: schema.candidates })
    .from(rc)
    .innerJoin(schema.candidates, eq(schema.candidates.id, rc.candidateId))
    .where(and(eq(rc.requestId, request.id), isNotNull(rc.rank), lt(rc.rank, SHORTLIST + 1), eq(rc.status, "new")))
    .orderBy(rc.rank);
  if (run.kind === "initial") return rows;
  const newIds = new Set(state.newRoleCandidateIds ?? []);
  return rows.filter(({ rc: r }) => newIds.has(r.id));
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
  // Don't spend credits on people far below the bar: a full profile rarely lifts a score by more than 10 points.
  const floor = settings.minOutreachScore - 10;
  const targets = (await shortlistRows(run, request, state)).filter(({ c, rc }) => !c.email && (rc.score ?? 0) >= floor);
  const existing = targets.length
    ? await db.select({ rcId: schema.contactReveals.roleCandidateId }).from(schema.contactReveals).where(inArray(schema.contactReveals.roleCandidateId, targets.map((t) => t.rc.id)))
    : [];
  const done = new Set(existing.map((e) => e.rcId));
  const wanted = targets.filter(({ rc, c }) => !done.has(rc.id) && (c.linkedinUrl || c.signalhireUid));
  if (!wanted.length) { log(state, "No contacts to reveal."); return; }
  // Hold the credits first, then call SignalHire: two callers can't both spend the last credit.
  const wantedRows = wanted.map(({ rc, c }) => ({ roleCandidateId: rc.id, candidateId: c.id, item: (c.linkedinUrl ?? c.signalhireUid)!, runId: run.id }));
  const { rows: held, budget } = await reserveReveals(wantedRows);
  if (held.length < wanted.length) {
    log(state, `This month's SignalHire limit (${budget.limit} credits) leaves room for ${held.length} of ${wanted.length} contacts; the rest weren't looked up.`);
  }
  if (!held.length) return;
  const items = held.map((h) => h.item);
  const callback = appIsPublic() && !mock.signalhire ? `${env.appUrl}/api/webhooks/signalhire/${env.webhookSecret}` : null;
  let res: Awaited<ReturnType<typeof revealContacts>>;
  try {
    res = await revealContacts(items, callback);
  } catch (e) {
    await settleReveals(held.map((h) => h.id), { failed: true });
    throw e;
  }
  await settleReveals(held.map((h) => h.id), { requestId: res.requestId });
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
    // A result arriving after the person opted out must not bring their contact details back.
    const [person] = await db.select({ id: schema.candidates.id, email: schema.candidates.email, linkedinUrl: schema.candidates.linkedinUrl }).from(schema.candidates).where(eq(schema.candidates.id, reveal.candidateId));
    const optedOut = !!person && (await isSuppressed({ ...person, email: person.email ?? r.email }));
    if (success && !optedOut && (r.email || r.phone)) {
      await db.update(schema.candidates).set({
        email: r.email?.toLowerCase() ?? null,
        phone: r.phone,
        contactSource: "SignalHire",
        contactRetrievedAt: new Date(),
        ...(r.linkedinUrl ? { linkedinUrl: r.linkedinUrl } : {}),
      }).where(and(eq(schema.candidates.id, reveal.candidateId), isNull(schema.candidates.email)));
    }
    // The credit also bought the full profile: keep the LinkedIn link, dated experience and education.
    if (success && (r.linkedinUrl || (r.profile && Object.keys(r.profile).length))) {
      await db.update(schema.candidates).set({
        ...(r.linkedinUrl ? { linkedinUrl: r.linkedinUrl } : {}),
        ...(r.profile ?? {}),
        lastRefreshedAt: new Date(),
      }).where(eq(schema.candidates.id, reveal.candidateId));
    }
  }
  await logUsage({ provider: "signalhire", action: "reveal", units: credits, mock: isMock });
  return credits;
}

/**
 * Deep check: wait for SignalHire's full profiles, research the shortlist on the web, score it again on the full
 * data, then rank again so the Top 10 that gets contacted is judged on dates, role descriptions and evidence rather
 * than search previews.
 */
async function stepDeep(ctx: Ctx): Promise<StepResult> {
  const { run, request, state, deadline } = ctx;
  const db = await getDb();
  const pending = await db
    .select({ id: schema.contactReveals.id })
    .from(schema.contactReveals)
    .where(and(eq(schema.contactReveals.runId, run.id), eq(schema.contactReveals.status, "pending"), gt(schema.contactReveals.requestedAt, new Date(Date.now() - REVEAL_WAIT_MS))));
  if (pending.length) {
    log(state, `Waiting for ${pending.length} full profile(s) from SignalHire.`);
    return "waiting";
  }
  const rows = await shortlistRows(run, request, state);
  if (!rows.length) { log(state, "Nobody new to check in depth."); return; }
  if ((await webResearch(ctx, rows)) === "again") return "again";
  const weights = await roleWeights(request, run);
  const done = new Set(state.deepScored ?? []);
  const todo = rows.filter(({ rc }) => !done.has(rc.id));
  for (let i = 0; i < todo.length; i += SCORE_CHUNK) {
    if (Date.now() > deadline) return "again";
    const part = todo.slice(i, i + SCORE_CHUNK);
    await showProgress(ctx, `Checking the top ${rows.length} in depth: ${done.size + part.length} of ${rows.length}`);
    await scoreRows(part, request, weights, run.id);
    for (const { rc } of part) done.add(rc.id);
    state.deepScored = [...done];
  }
  state.progress = undefined;
  // The whole Top 10 before re-ranking, not only the shortlisted rows, or everyone already there counts as "moved in".
  const before = new Set((await db
    .select({ id: schema.roleCandidates.id })
    .from(schema.roleCandidates)
    .where(and(eq(schema.roleCandidates.requestId, request.id), eq(schema.roleCandidates.isTop10, true)))).map((r) => r.id));
  await rerank(ctx);
  const after = await db
    .select({ id: schema.roleCandidates.id })
    .from(schema.roleCandidates)
    .where(and(eq(schema.roleCandidates.requestId, request.id), eq(schema.roleCandidates.isTop10, true)));
  const movedIn = after.filter((a) => !before.has(a.id)).length;
  state.deepScored = undefined;
  log(state, `Checked ${rows.length} shortlisted people in depth and scored them again on their full profiles${movedIn ? `; ${movedIn} moved into the Top ${TOP_N}` : "; the Top 10 held"}.`);
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
  // Nothing is drafted or sent here: a recruiter or the hiring manager presses Contact on each person.
  const all = await outreachTargets(run, request.id);
  const { minOutreachScore } = await getSettings();
  const targets = all.filter(({ rc }) => (rc.score ?? 0) >= minOutreachScore);
  if (run.kind === "initial" && targets.length < 3) {
    await notifyRoles(["recruiter"], {
      type: "few_matches",
      title: `${request.title}: only ${targets.length} strong match${targets.length === 1 ? "" : "es"}`,
      link: `/roles/${request.id}`,
      emailBody: `The search for ${request.title} found only ${targets.length} candidate(s) scoring ${minOutreachScore} or more. Check the requirements (a must-have that few people list, like office software, narrows the field), widen the location, or look at the others on the role page.`,
    });
  }
  const reachable = all.filter(({ c }) => c.email || c.linkedinUrl || c.phone).length;
  log(state, `${all.length} Top-${TOP_N} candidate(s) are ready to contact (${reachable} with an email, LinkedIn or phone). Nothing is sent until someone presses Contact.`);
}

/** SignalHire credits spent on contact reveals for a run, including results that came back through the webhook. */
export async function creditsSpentOnRun(runId: string) {
  const db = await getDb();
  const [{ used }] = await db
    .select({ used: sql<number>`coalesce(sum(${schema.contactReveals.creditsUsed}), 0)::int` })
    .from(schema.contactReveals)
    .where(eq(schema.contactReveals.runId, runId));
  return Number(used);
}

async function finish(run: Run, request: Request, state: RunState, counters: Record<string, number>) {
  const db = await getDb();
  // Contacts that arrived later through the webhook were paid for too: count every credit spent for this run.
  counters.signalhireCredits = Math.max(counters.signalhireCredits ?? 0, await creditsSpentOnRun(run.id));
  log(state, "Run finished.");
  await save(run.id, { step: "done", state, ...counters, status: "done", lockedUntil: null, finishedAt: new Date() });
  // Conditional on the current status, not this run's copy: a role closed while the run finished stays closed.
  await db.update(schema.roleRequests).set({ status: "open", updatedAt: new Date() }).where(and(eq(schema.roleRequests.id, request.id), inArray(schema.roleRequests.status, ["sourcing", "open"])));
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.roleCandidates).where(eq(schema.roleCandidates.requestId, request.id));
  if (run.kind === "initial") {
    await notifyRoles(["recruiter", "ceo"], {
      type: "run_done",
      title: `${request.title}: ${n} candidates screened, Top 10 ready`,
      link: `/roles/${request.id}`,
      emailBody: `Sourcing for ${request.title} is finished. ${n} candidates were screened and scored, and the Top 10 are flagged. Nobody has been contacted: open the role and press Contact on the people you want to reach.`,
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
