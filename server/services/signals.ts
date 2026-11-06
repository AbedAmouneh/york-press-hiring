// Facts about a candidate that code can work out exactly from the profile, so ranking doesn't depend on an AI
// doing date arithmetic or keyword spotting. Shown on the candidate card, given to Claude as facts, and used as
// features by the learning step. Never uses name, photo, age, gender or nationality.
import type { CriterionKey, ExperienceItem, Signals, Weights } from "../../shared/types.js";
import { mustHaveTerms, splitMustHaves, STOP } from "../../shared/must-haves.js";

type Profile = {
  headline?: string | null;
  currentTitle?: string | null;
  location?: string | null;
  experience: ExperienceItem[];
  skills: string[];
  languages: string[];
  totalYears?: number | null;
  email?: string | null;
  phone?: string | null;
  linkedinUrl?: string | null;
};

type Role = {
  title: string;
  seniority: string;
  mustHaves: string[];
  minYears: number | null;
  idealYears: number | null;
  languages: string[];
  locationPolicy: string;
  searchLocations: string[];
};

export { mustHaveTerms };

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9+#.]+/).filter((w) => w.length > 1 && !STOP.has(w));

/** True when the text contains the term, or all of the term's significant words (for multi-word terms). */
export function mentions(text: string, term: string) {
  const t = text.toLowerCase();
  if (t.includes(term)) return true;
  const w = words(term);
  return w.length > 1 && w.every((x) => t.includes(x));
}

/** "2019-03" or "2019" → months since year 0. Null when missing or unreadable. */
function monthOf(d?: string | null): number | null {
  if (!d) return null;
  const m = /^(\d{4})(?:-(\d{1,2}))?/.exec(d.trim());
  if (!m) return null;
  return Number(m[1]) * 12 + (m[2] ? Number(m[2]) - 1 : 0);
}

const nowMonth = (now: Date) => now.getFullYear() * 12 + now.getMonth();

/** Merge overlapping [start, end) month ranges and return the total length in months. */
function coveredMonths(ranges: [number, number][]) {
  const sorted = ranges.filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cur: [number, number] | null = null;
  for (const r of sorted) {
    if (!cur || r[0] > cur[1]) {
      if (cur) total += cur[1] - cur[0];
      cur = [r[0], r[1]];
    } else cur[1] = Math.max(cur[1], r[1]);
  }
  if (cur) total += cur[1] - cur[0];
  return total;
}

/** Expected years for a level when the request gives none. */
const LEVEL_YEARS: [RegExp, number, number][] = [
  [/entry|intern|trainee|graduate/i, 0, 1],
  [/junior/i, 0, 2],
  [/mid/i, 2, 5],
  [/senior/i, 5, 10],
  [/lead|principal|staff/i, 7, 15],
  [/manager|head|director/i, 5, 20],
];

const JUNIOR_TITLE = /\b(intern|trainee|junior|jr\.?|graduate|apprentice)\b/i;
const SENIOR_TITLE = /\b(senior|sr\.?|lead|principal|staff|head|director|vp|chief|manager)\b/i;

export function computeSignals(p: Profile, role: Role, now = new Date()): Signals {
  const today = nowMonth(now);
  const dated = p.experience
    // A finished role's end month counts in full (Jun–Dec is 7 months); a current one runs to this month.
    .map((e) => {
      const end = e.end ? monthOf(e.end) : today;
      return { e, s: monthOf(e.start), end: e.end && end != null ? end + 1 : end };
    })
    .filter((x): x is { e: ExperienceItem; s: number; end: number } => x.s != null && x.end != null && x.end >= x.s);

  // Relevant years: dated roles whose title shares a meaningful word with the role title.
  const roleWords = words(role.title).filter((w) => !/^(developer|engineer|specialist|officer|manager)$/.test(w) || words(role.title).length === 1);
  const relevantRanges = dated.filter(({ e }) => roleWords.some((w) => e.title.toLowerCase().includes(w))).map(({ s, end }) => [s, end] as [number, number]);
  const relevantYears = dated.length ? Math.round((coveredMonths(relevantRanges) / 12) * 10) / 10 : null;
  const totalYears = dated.length ? Math.round((coveredMonths(dated.map(({ s, end }) => [s, end])) / 12) * 10) / 10 : (p.totalYears ?? null);

  // Stability: finished jobs shorter than 12 months that ended in the last six years.
  const finished = dated.filter(({ e }) => !!e.end);
  const shortStints = finished.filter(({ s, end }) => end - s < 12 && today - end <= 72).length;
  const tenures = finished.map(({ s, end }) => end - s).sort((a, b) => a - b);
  const medianTenureMonths = tenures.length ? tenures[Math.floor(tenures.length / 2)] : null;

  // Level: years against the request's band, nudged by the current title.
  const band = LEVEL_YEARS.find(([re]) => re.test(role.seniority));
  const min = role.minYears ?? band?.[1] ?? null;
  const max = role.idealYears != null ? Math.max(role.idealYears + 3, min ?? 0) : band?.[2] ?? null;
  const years = relevantYears ?? totalYears;
  const title = `${p.currentTitle ?? ""} ${p.headline ?? ""}`;
  const wantsSenior = /senior|lead|principal|manager|head|director/i.test(role.seniority);
  let level: Signals["level"] = "unknown";
  if (years != null && min != null) {
    if (years < Math.max(0, min - 1) || (JUNIOR_TITLE.test(title) && !/entry|junior|intern/i.test(role.seniority))) level = "below";
    else if (max != null && years > max + 4 && SENIOR_TITLE.test(title) && !wantsSenior) level = "above";
    else level = "match";
  } else if (JUNIOR_TITLE.test(title) && !/entry|junior|intern/i.test(role.seniority)) level = "below";

  // Core must-haves: seen in the work itself (titles and role summaries) beats only being listed as a skill.
  // Basic ones (office software, degrees, soft skills) are rarely written down, so they are never counted as missing.
  const { core, basic } = splitMustHaves(role.mustHaves);
  const workText = [p.headline ?? "", p.currentTitle ?? "", ...p.experience.map((e) => `${e.title} ${e.summary ?? ""}`)].join(" \n ");
  const skillText = p.skills.join(" \n ");
  const skillsInWork: string[] = [];
  const skillsListedOnly: string[] = [];
  const skillsMissing: string[] = [];
  for (const m of core) {
    const terms = mustHaveTerms(m);
    if (!terms.length) continue;
    if (terms.some((t) => mentions(workText, t))) skillsInWork.push(m);
    else if (terms.some((t) => mentions(skillText, t))) skillsListedOnly.push(m);
    else skillsMissing.push(m);
  }

  // Location only matters for on-site or hybrid roles with known countries.
  const onSite = /on-?site|hybrid/i.test(role.locationPolicy);
  const places = role.searchLocations.map((x) => x.toLowerCase().trim()).filter(Boolean);
  const locationFit: Signals["locationFit"] = !onSite || !places.length || !p.location
    ? "unknown"
    : places.some((x) => p.location!.toLowerCase().includes(x)) ? "match" : "mismatch";

  const needLangs = role.languages.map((l) => l.toLowerCase().trim()).filter(Boolean);
  const hasLangs = p.languages.map((l) => l.toLowerCase());
  const languageFit: Signals["languageFit"] = !needLangs.length || !hasLangs.length
    ? "unknown"
    : needLangs.every((l) => hasLangs.some((h) => h.includes(l))) ? "match" : "missing";

  return {
    relevantYears,
    totalYears,
    level,
    shortStints,
    medianTenureMonths,
    datedProfile: dated.length > 0,
    skillsInWork,
    skillsListedOnly,
    skillsMissing,
    basicMustHaves: basic,
    locationFit,
    languageFit,
    reachable: { email: !!p.email, phone: !!p.phone, linkedin: !!p.linkedinUrl },
  };
}

/**
 * Rules applied in code after scoring, so the facts that can be computed exactly always count the same way:
 * clearly above or below the requested level limits seniority and experience points, three or more short jobs
 * limit trajectory, and being outside the location of an on-site role gives no location points.
 * Returns the adjusted points and a short note for each rule that changed something.
 */
export function applyGuardrails(breakdown: Partial<Weights>, weights: Weights, s: Signals): { breakdown: Partial<Weights>; notes: string[] } {
  const out = { ...breakdown };
  const notes: string[] = [];
  const cap = (k: CriterionKey, share: number) => {
    const max = Math.floor(weights[k] * share);
    if ((out[k] ?? 0) > max) { out[k] = max; return true; }
    return false;
  };
  if (s.level === "above" && [cap("seniority", 0.3), cap("exp", 0.6)].some(Boolean)) notes.push("well above the requested level");
  if (s.level === "below" && [cap("seniority", 0.3), cap("exp", 0.5)].some(Boolean)) notes.push("below the requested level");
  if (s.shortStints >= 3 && cap("trajectory", 0.4)) notes.push(`${s.shortStints} jobs shorter than a year recently`);
  if (s.locationFit === "mismatch" && cap("remote", 0)) notes.push("outside the role's location");
  return { breakdown: out, notes };
}

/** The facts as short sentences for Claude. Facts, not instructions: Claude still judges the evidence. */
export function signalFacts(s: Signals): string[] {
  const out: string[] = [];
  if (s.datedProfile) out.push(`Computed from dated roles: ${s.totalYears ?? "?"} years total, ${s.relevantYears ?? "?"} years in roles with a matching title.`);
  else out.push("The profile has no dates, so years are not verified.");
  if (s.level !== "unknown") out.push(`Level compared with the request: ${s.level}.`);
  if (s.shortStints) out.push(`${s.shortStints} finished job(s) shorter than 12 months in the last six years.`);
  if (s.skillsInWork.length) out.push(`Must-haves seen in their work history: ${s.skillsInWork.join("; ")}.`);
  if (s.skillsListedOnly.length) out.push(`Must-haves only listed as skills, not shown in work history: ${s.skillsListedOnly.join("; ")}.`);
  if (s.skillsMissing.length) out.push(`Must-haves not found anywhere in the profile: ${s.skillsMissing.join("; ")}.`);
  if (s.basicMustHaves?.length) out.push(`Basic requirements not checked (profiles rarely list them; not a gap): ${s.basicMustHaves.join("; ")}.`);
  if (s.locationFit !== "unknown") out.push(`Location fit for this on-site/hybrid role: ${s.locationFit}.`);
  if (s.languageFit !== "unknown") out.push(`Required languages: ${s.languageFit}.`);
  return out;
}
