// SignalHire Search + Person APIs — https://docs.signalhire.com
import { env, mock } from "../../env.js";
import { mockContact, mockProfiles } from "./mock.js";
import { countriesFrom } from "./pdl.js";
import { normalizeLinkedin, type CandidateSearchProvider, type NormalizedProfile } from "./types.js";
import type { EducationItem, ExperienceItem } from "../../../shared/types.js";

/** Person API candidate object (only the fields we read). https://docs.signalhire.com/person-api/candidate-object */
export type SHCandidate = {
  headLine?: string | null;
  locations?: { name?: string | null }[];
  skills?: string[];
  experienceYears?: number | null;
  contacts?: { type: string; value: string; rating?: number; subType?: string | null }[];
  social?: { type: string; link: string }[];
  experience?: { position?: string | null; company?: string | null; current?: boolean; started?: string | null; ended?: string | null; summary?: string | null }[];
  education?: { university?: string | null; faculty?: string | null; degree?: string[] | null; startedYear?: number | null; endedYear?: number | null }[];
  language?: { name?: string | null }[];
  certification?: { name?: string | null }[];
} | null | undefined;

/** The full profile a reveal returns: dated experience, education, languages. Fields missing upstream stay out. */
export type RevealProfile = {
  headline?: string | null;
  location?: string | null;
  experience?: ExperienceItem[];
  education?: EducationItem[];
  skills?: string[];
  languages?: string[];
  certifications?: string[];
  totalYears?: number | null;
};

const month = (iso?: string | null) => (iso && /^\d{4}-\d{2}/.test(iso) ? iso.slice(0, 7) : null);

export function profileFrom(c: NonNullable<SHCandidate>): RevealProfile {
  const p: RevealProfile = {};
  if (c.headLine) p.headline = c.headLine;
  if (c.locations?.[0]?.name) p.location = c.locations[0].name;
  const exp = (c.experience ?? []).filter((e) => e.position || e.company).map((e) => ({
    title: e.position ?? "", company: e.company ?? "", start: month(e.started), end: e.current ? null : month(e.ended), summary: e.summary ?? null,
  }));
  if (exp.length) p.experience = exp;
  const edu = (c.education ?? []).filter((e) => e.university).map((e) => ({
    school: e.university!, degree: e.degree?.join(", ") || null, field: e.faculty ?? null,
    start: e.startedYear ? String(e.startedYear) : null, end: e.endedYear ? String(e.endedYear) : null,
  }));
  if (edu.length) p.education = edu;
  if (c.skills?.length) p.skills = c.skills;
  const langs = (c.language ?? []).map((l) => l.name).filter((n): n is string => !!n);
  if (langs.length) p.languages = langs;
  const certs = (c.certification ?? []).map((l) => l.name).filter((n): n is string => !!n);
  if (certs.length) p.certifications = certs;
  if (typeof c.experienceYears === "number") p.totalYears = c.experienceYears;
  return p;
}
type SHItem = { item: string; status: string; candidate?: SHCandidate };

const BASE = "https://www.signalhire.com/api/v1";

async function call(path: string, init: { method?: string; body?: unknown } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? "POST",
    headers: { apikey: env.signalhireKey, "Content-Type": "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const credits = res.headers.get("x-credits-left");
  const text = await res.text();
  // Raw API response; each caller narrows it to the documented shape.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  if (!res.ok) {
    const msg = typeof json === "object" && json ? json.error ?? json.message ?? JSON.stringify(json) : text;
    throw new Error(`SignalHire error ${res.status}: ${msg}`);
  }
  return { json, creditsLeft: credits ? Number(credits) : null };
}

/** "(Senior AND Editor) OR (Commissioning AND Editor)" from a list of titles. Slashes split words ("Python/Django"). */
export function titleBoolean(titles: string[]) {
  return titles
    .slice(0, 8)
    .map((t) => t.replace(/[()"/|,&]/g, " ").split(/\s+/).filter((w) => w.length > 1 && !/^(and|or|not|of|the)$/i.test(w)))
    .filter((words) => words.length)
    .map((words) => (words.length > 1 ? `(${words.join(" AND ")})` : words[0]))
    .join(" OR ");
}

/** A Boolean term for one keyword: multi-word keywords become a quoted phrase. */
const term = (k: string) => {
  const clean = k.replace(/[()"]/g, " ").replace(/\s+/g, " ").trim();
  return clean.includes(" ") ? `"${clean}"` : clean;
};

/**
 * The searches to try, from precise to broad, until enough people are found. Titles alone miss people whose title
 * doesn't name the technology ("Backend Developer" who works in Django); keywords alone find people who only mention
 * it once. So: role titles AND the core skill, then any past or current matching title AND the core skill, then the
 * core skill alone, then the role titles alone. Exported for tests.
 */
export function searchLadder(brief: { titles: string[]; skills: string[]; coreKeywords?: string[] }) {
  const core = (brief.coreKeywords?.length ? brief.coreKeywords : brief.skills.slice(0, 1)).slice(0, 3);
  const coreQuery = core.length ? core.map(term).join(" OR ") : null;
  const titles = titleBoolean(brief.titles);
  const steps: Record<string, string>[] = [];
  if (titles && coreQuery) steps.push({ currentTitle: titles, keywords: coreQuery });
  if (titles && coreQuery) steps.push({ currentPastTitle: titles, keywords: coreQuery });
  if (coreQuery) steps.push({ keywords: coreQuery });
  if (titles) steps.push({ currentTitle: titles });
  return steps;
}

/**
 * SignalHire's `education` filter (Boolean over university name, faculty and degree) for the chosen universities:
 * "American University of Beirut" OR AUB OR … Short names under 3 letters are left out (too many false matches).
 * Exported for tests.
 */
export function educationQuery(names?: string[]) {
  const terms = [...new Set((names ?? []).map((n) => n.trim()).filter((n) => n.length >= 3))];
  return terms.length ? terms.map(term).join(" OR ") : null;
}

type SHProfile = { uid: string; fullName: string; location?: string | null; experience?: { company?: string | null; title?: string | null }[]; skills?: string[]; openToWork?: boolean };

function mapSearchProfile(p: SHProfile): NormalizedProfile {
  const exp = (p.experience ?? []).map((e) => ({ title: e.title ?? "", company: e.company ?? "", start: null, end: null }));
  return {
    source: "SignalHire",
    sourceId: p.uid,
    fullName: p.fullName,
    headline: exp[0] ? `${exp[0].title} at ${exp[0].company}` : null,
    currentTitle: exp[0]?.title ?? null,
    currentCompany: exp[0]?.company ?? null,
    location: p.location ?? null,
    experience: exp,
    education: [],
    skills: p.skills ?? [],
    openToWork: p.openToWork ?? null,
  };
}

export let lastCreditsLeft: number | null = null;

export const signalhireProvider: CandidateSearchProvider = {
  name: "SignalHire",
  async search(brief, { size, seed }) {
    if (mock.signalhire) {
      return { profiles: mockProfiles("SignalHire", brief, size, seed + 7).map((p) => ({ ...p, email: null })), total: size, billedRecords: 0, searches: 1, mock: true };
    }
    const countries = countriesFrom(brief.locations).map((c) => c.replace(/\b\w/g, (m) => m.toUpperCase()));
    const education = educationQuery(brief.education);
    // Searches are free (a daily quota), so step from precise to broad until the pool is full.
    const found = new Map<string, SHProfile>();
    let searches = 0;
    let total = 0;
    for (const step of searchLadder(brief)) {
      if (found.size >= size) break;
      const body: Record<string, unknown> = { ...step, size: Math.min(size, 100) };
      if (countries.length) body.location = countries;
      if (education) body.education = education;
      const { json, creditsLeft } = await call("/candidate/searchByQuery", { body });
      searches++;
      if (creditsLeft != null) lastCreditsLeft = creditsLeft;
      total = Math.max(total, json?.total ?? 0);
      for (const p of (json?.profiles ?? []) as SHProfile[]) {
        if (found.size >= size) break;
        if (!found.has(p.uid)) found.set(p.uid, p);
      }
    }
    const profiles = [...found.values()];
    return { profiles: profiles.map(mapSearchProfile), total: Math.max(total, profiles.length), billedRecords: 0, searches, mock: false };
  },
};

export type RevealResult = { item: string; status: string; email: string | null; phone: string | null; linkedinUrl: string | null; profile?: RevealProfile };

export function parseCandidate(item: string, status: string, c: SHCandidate): RevealResult {
  if (status !== "success" || !c) return { item, status, email: null, phone: null, linkedinUrl: null };
  const contacts = c.contacts ?? [];
  const emails = contacts.filter((x) => x.type === "email").sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (a.subType === "work" ? -1 : 1));
  const phones = contacts.filter((x) => x.type === "phone").sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  const li = (c.social ?? []).find((s) => s.type === "li")?.link ?? null;
  return { item, status, email: emails[0]?.value ?? null, phone: phones[0]?.value ?? null, linkedinUrl: normalizeLinkedin(li), profile: profileFrom(c) };
}

/**
 * Reveal contacts. With a callbackUrl the results arrive at our webhook later (async, best coverage).
 * Without one we use "withoutWaterfall" sync mode and return results directly.
 */
export async function revealContacts(items: string[], callbackUrl: string | null): Promise<{ requestId: string | null; results: RevealResult[] | null; creditsLeft: number | null; mock: boolean }> {
  if (mock.signalhire) {
    const results = items.map((item) => {
      const c = mockContact(item);
      return { item, status: c ? "success" : "failed", email: c?.email ?? null, phone: c?.phone ?? null, linkedinUrl: null };
    });
    return { requestId: `mock-${Date.now()}`, results, creditsLeft: null, mock: true };
  }
  if (callbackUrl) {
    const { json, creditsLeft } = await call("/candidate/search", { body: { items, callbackUrl } });
    if (creditsLeft != null) lastCreditsLeft = creditsLeft;
    return { requestId: String(json?.requestId ?? ""), results: null, creditsLeft, mock: false };
  }
  const { json, creditsLeft } = await call("/candidate/search", { body: { items, withoutWaterfall: true } });
  if (creditsLeft != null) lastCreditsLeft = creditsLeft;
  const arr: SHItem[] = Array.isArray(json) ? json : json?.items ?? [];
  return { requestId: null, results: arr.map((r) => parseCandidate(r.item, r.status, r.candidate)), creditsLeft, mock: false };
}

export async function signalhireCredits(): Promise<number | null> {
  if (mock.signalhire) return null;
  const { json } = await call("/credits", { method: "GET" });
  return typeof json?.credits === "number" ? json.credits : null;
}
