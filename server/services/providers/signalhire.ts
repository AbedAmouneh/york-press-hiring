// SignalHire Search + Person APIs — https://docs.signalhire.com
import { env, mock } from "../../env.js";
import { mockContact, mockProfiles } from "./mock.js";
import { countriesFrom } from "./pdl.js";
import { normalizeLinkedin, type CandidateSearchProvider, type NormalizedProfile } from "./types.js";

/** Person API candidate object (only the fields we read). https://docs.signalhire.com/person-api/candidate-object */
export type SHCandidate = {
  contacts?: { type: string; value: string; rating?: number; subType?: string | null }[];
  social?: { type: string; link: string }[];
} | null | undefined;
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

/** "(Senior AND Editor) OR (Commissioning AND Editor)" from a list of titles. */
export function titleBoolean(titles: string[]) {
  return titles
    .slice(0, 8)
    .map((t) => t.replace(/[()"]/g, " ").split(/\s+/).filter((w) => w.length > 1 && !/^(and|or|not|of|the)$/i.test(w)))
    .filter((words) => words.length)
    .map((words) => (words.length > 1 ? `(${words.join(" AND ")})` : words[0]))
    .join(" OR ");
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
    const body: Record<string, unknown> = { currentTitle: titleBoolean(brief.titles), size: Math.min(size, 100) };
    if (countries.length) body.location = countries;
    if (brief.skills.length) body.keywords = brief.skills.slice(0, 4).map((s) => (s.includes(" ") ? `(${s.split(/\s+/).join(" AND ")})` : s)).join(" OR ");
    let { json, creditsLeft } = await call("/candidate/searchByQuery", { body });
    let profiles: SHProfile[] = json?.profiles ?? [];
    // Too narrow with skills? Retry with titles only.
    if (!profiles.length && body.keywords) {
      delete body.keywords;
      ({ json, creditsLeft } = await call("/candidate/searchByQuery", { body }));
      profiles = json?.profiles ?? [];
    }
    if (creditsLeft != null) lastCreditsLeft = creditsLeft;
    return { profiles: profiles.map(mapSearchProfile), total: json?.total ?? profiles.length, billedRecords: 0, searches: body.keywords ? 1 : 2, mock: false };
  },
};

export type RevealResult = { item: string; status: string; email: string | null; phone: string | null; linkedinUrl: string | null };

export function parseCandidate(item: string, status: string, c: SHCandidate): RevealResult {
  if (status !== "success" || !c) return { item, status, email: null, phone: null, linkedinUrl: null };
  const contacts = c.contacts ?? [];
  const emails = contacts.filter((x) => x.type === "email").sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (a.subType === "work" ? -1 : 1));
  const phones = contacts.filter((x) => x.type === "phone").sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  const li = (c.social ?? []).find((s) => s.type === "li")?.link ?? null;
  return { item, status, email: emails[0]?.value ?? null, phone: phones[0]?.value ?? null, linkedinUrl: normalizeLinkedin(li) };
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
