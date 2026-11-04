// Learns scorecard weights from what people decide. Each decided candidate is a labelled example: the share of
// each criterion they earned (0–1) and whether the hiring manager said yes / they got an interview (1) or the
// manager said no (0). The weights are tuned so that, ranked by score, the "yes" people sit above the "no" people
// as often as possible (pairwise accuracy, the same as AUC), staying close to the current weights.
// Only job criteria are inputs, so nothing about a person's identity can be learned.
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { getDb, schema } from "../db/client.js";
import { CRITERIA, DEFAULT_WEIGHTS, type CriterionKey, type Weights } from "../../shared/types.js";
import { getSettings } from "./settings.js";
import { notifyRoles } from "./notify.js";

export type Example = { x: Record<CriterionKey, number>; y: 0 | 1 };

/** How far one learning cycle may move a criterion from the starting weights, and from the defaults overall. */
export const STEP_LIMIT = 5;
export const DRIFT_LIMIT = 10;
/** Minimum evidence before anything changes. */
export const MIN_LABELS = 12;
export const MIN_EACH_CLASS = 3;
/** A change must improve pairwise accuracy by at least this much on the decided candidates. */
export const MIN_GAIN = 0.02;
export const MAX_EXAMPLES = 200;

const keys = CRITERIA.map((c) => c.key);

const score = (w: Weights, x: Record<CriterionKey, number>) => keys.reduce((s, k) => s + w[k] * (x[k] ?? 0), 0);

/** Share of (yes, no) pairs ranked the right way round; ties count half. 0.5 = no better than chance. */
export function pairwiseAccuracy(w: Weights, examples: Example[]) {
  const pos = examples.filter((e) => e.y === 1).map((e) => score(w, e.x));
  const neg = examples.filter((e) => e.y === 0).map((e) => score(w, e.x));
  if (!pos.length || !neg.length) return 0.5;
  let right = 0;
  for (const p of pos) for (const n of neg) right += p > n ? 1 : p === n ? 0.5 : 0;
  return right / (pos.length * neg.length);
}

export type LearnResult = {
  weights: Weights;
  accuracyBefore: number;
  accuracyAfter: number;
  labels: number;
  positives: number;
  changed: boolean;
  reason: string;
};

/**
 * Hill-climb in whole points: repeatedly move one point from one criterion to another when it improves accuracy
 * (minus a small pull back towards the starting weights). Weights always add up to the same total, stay within
 * STEP_LIMIT of the start and DRIFT_LIMIT of the defaults, and never go below 0.
 */
export function learnWeights(start: Weights, defaults: Weights, examples: Example[]): LearnResult {
  const positives = examples.filter((e) => e.y === 1).length;
  const negatives = examples.length - positives;
  const before = pairwiseAccuracy(start, examples);
  const base = { weights: start, accuracyBefore: before, accuracyAfter: before, labels: examples.length, positives, changed: false };
  if (examples.length < MIN_LABELS || positives < MIN_EACH_CLASS || negatives < MIN_EACH_CLASS) {
    return { ...base, reason: `Needs at least ${MIN_LABELS} decisions with ${MIN_EACH_CLASS} yes and ${MIN_EACH_CLASS} no (has ${positives} yes, ${negatives} no).` };
  }
  const penalty = (w: Weights) => keys.reduce((s, k) => s + (w[k] - start[k]) ** 2, 0) / 2000;
  // A smooth version of pairwise accuracy (how far apart each yes/no pair is, through a sigmoid), so single-point
  // moves that close a gap count even before the order flips.
  const pos = examples.filter((e) => e.y === 1);
  const neg = examples.filter((e) => e.y === 0);
  const smooth = (w: Weights) => {
    let total = 0;
    for (const p of pos) for (const n of neg) total += 1 / (1 + Math.exp(-(score(w, p.x) - score(w, n.x)) / 2));
    return total / (pos.length * neg.length);
  };
  const objective = (w: Weights) => smooth(w) - penalty(w);
  let w = { ...start };
  let best = objective(w);
  for (let iter = 0; iter < 60; iter++) {
    let move: Weights | null = null;
    for (const up of keys) {
      for (const down of keys) {
        if (up === down || w[down] <= 0) continue;
        const next = { ...w, [up]: w[up] + 1, [down]: w[down] - 1 };
        const ok = [up, down].every((k) => Math.abs(next[k] - start[k]) <= STEP_LIMIT && Math.abs(next[k] - defaults[k]) <= DRIFT_LIMIT);
        if (!ok) continue;
        const v = objective(next);
        if (v > best + 1e-9) { best = v; move = next; }
      }
    }
    if (!move) break;
    w = move;
  }
  const after = pairwiseAccuracy(w, examples);
  if (after < before + MIN_GAIN) {
    return { ...base, accuracyAfter: after, reason: `No change: the best adjustment only reached ${pct(after)} vs ${pct(before)} now.` };
  }
  return { weights: w, accuracyBefore: before, accuracyAfter: after, labels: examples.length, positives, changed: true, reason: `Ranks the decided candidates right ${pct(after)} of the time, up from ${pct(before)}.` };
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** "*" holds what was learned across all departments; it is used where a department has too few decisions. */
export const ALL_DEPARTMENTS = "*";

/** The learned weights a new role in this department should start from, if any. */
export async function learnedWeightsFor(department: string): Promise<Weights | null> {
  const db = await getDb();
  const t = schema.learnedWeights;
  for (const dept of [department, ALL_DEPARTMENTS]) {
    const [row] = await db.select().from(t).where(and(eq(t.department, dept), eq(t.active, true))).orderBy(desc(t.createdAt)).limit(1);
    if (row) return row.weights;
  }
  return null;
}

/**
 * Learn from every decided candidate: once per department with enough decisions, and once across all
 * departments. Changes apply automatically to roles created afterwards; everyone in recruiting is told.
 */
export async function runLearning() {
  const db = await getDb();
  const settings = await getSettings();
  const defaults = settings.defaultWeights ?? DEFAULT_WEIGHTS;
  const rows = await db
    .select({ rc: schema.roleCandidates, department: schema.roleRequests.department, weights: schema.roleRequests.scorecardWeights })
    .from(schema.roleCandidates)
    .innerJoin(schema.roleRequests, eq(schema.roleRequests.id, schema.roleCandidates.requestId))
    .where(isNotNull(schema.roleCandidates.scoreBreakdown))
    .orderBy(desc(schema.roleCandidates.createdAt));
  // The most recent decisions per department, so learning follows current taste and stays fast.
  const byDept = new Map<string, Example[]>();
  for (const r of rows) {
    const ex = toExample(r.rc, r.weights ?? defaults);
    if (!ex) continue;
    for (const d of [r.department, ALL_DEPARTMENTS]) {
      const list = byDept.get(d) ?? [];
      if (list.length < MAX_EXAMPLES) byDept.set(d, [...list, ex]);
    }
  }
  const results: { department: string; result: LearnResult }[] = [];
  for (const [department, examples] of byDept) {
    const t = schema.learnedWeights;
    const [current] = await db.select().from(t).where(and(eq(t.department, department), eq(t.active, true))).orderBy(desc(t.createdAt)).limit(1);
    const start = current?.weights ?? (department === ALL_DEPARTMENTS ? defaults : (await learnedWeightsFor(ALL_DEPARTMENTS)) ?? defaults);
    const result = learnWeights(start, defaults, examples);
    results.push({ department, result });
    if (!result.changed) continue;
    await db.update(t).set({ active: false }).where(and(eq(t.department, department), eq(t.active, true)));
    await db.insert(t).values({
      department, weights: result.weights, previous: start, labels: result.labels, positives: result.positives,
      accuracyBefore: result.accuracyBefore, accuracyAfter: result.accuracyAfter,
    });
    const label = department === ALL_DEPARTMENTS ? "All departments" : department;
    await notifyRoles(["recruiter", "admin"], {
      type: "learning",
      title: `${label}: the scorecard learned from ${result.labels} decisions`,
      link: "/settings",
      emailBody: `${label}: ${describeChange(start, result.weights)}. ${result.reason} New roles use these weights. You can undo it in Settings.`,
    });
  }
  return results.map(({ department, result }) => ({ department, changed: result.changed, reason: result.reason }));
}

/** "Must-have skills 35 → 38, Industry 15 → 12" */
export function describeChange(from: Weights, to: Weights) {
  const moved = CRITERIA.filter((c) => from[c.key] !== to[c.key]).map((c) => `${c.label} ${from[c.key]} → ${to[c.key]}`);
  return moved.length ? moved.join(", ") : "no change";
}

/**
 * Turn a decided candidate into an example. Yes from the hiring manager, an interview or a hire = 1; no from the
 * hiring manager = 0. "Maybe", undecided and "rejected" without a manager's no (it may be the candidate who said
 * no) are left out.
 */
export function toExample(row: { scoreBreakdown: Partial<Weights> | null; hmDecision: string | null; status: string }, weights: Weights): Example | null {
  if (!row.scoreBreakdown) return null;
  const positive = row.hmDecision === "yes" || row.status === "interview" || row.status === "hired";
  const negative = row.hmDecision === "no";
  if (!positive && !negative) return null;
  const x = Object.fromEntries(keys.map((k) => [k, weights[k] ? Math.min(1, Math.max(0, (row.scoreBreakdown![k] ?? 0) / weights[k])) : 0])) as Record<CriterionKey, number>;
  return { x, y: positive ? 1 : 0 };
}
