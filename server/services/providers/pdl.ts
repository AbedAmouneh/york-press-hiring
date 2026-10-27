// People Data Labs Person Search API — https://docs.peopledatalabs.com/docs/reference-person-search-api
import { env, mock } from "../../env.js";
import { mockProfiles } from "./mock.js";
import { normalizeLinkedin, titleCase, totalYearsFromExperience, type CandidateSearchProvider, type NormalizedProfile } from "./types.js";
import type { SearchBrief } from "../../db/schema.js";

const ENDPOINT = "https://api.peopledatalabs.com/v5/person/search";
const NON_COUNTRIES = /remote|global|worldwide|anywhere|mena|middle east|europe|gcc/i;

export function countriesFrom(locations: string[]) {
  return [...new Set(
    locations
      .filter((l) => l && !NON_COUNTRIES.test(l))
      .map((l) => l.split(",").pop()!.trim().toLowerCase())
      .filter(Boolean),
  )];
}

export function buildPdlQuery(brief: SearchBrief) {
  const titles = brief.titles.slice(0, 8);
  const countries = countriesFrom(brief.locations);
  const exclude = ["york press", ...brief.excludeCompanies.map((c) => c.toLowerCase())];
  return {
    bool: {
      must: [{ bool: { should: titles.map((t) => ({ match_phrase: { job_title: t.toLowerCase() } })), minimum_should_match: 1 } }],
      should: brief.skills.slice(0, 10).map((s) => ({ match: { skills: s.toLowerCase() } })),
      filter: countries.length ? [{ terms: { location_country: countries } }] : [],
      must_not: exclude.map((c) => ({ match_phrase: { job_company_name: c } })),
    },
  };
}

type PdlRecord = Record<string, any>;

const ym = (d?: string | null) => (d ? d.slice(0, 7) : null);

export function mapPdl(p: PdlRecord): NormalizedProfile {
  const experience = (p.experience ?? []).map((e: PdlRecord) => ({
    title: titleCase(e.title?.name) ?? "",
    company: titleCase(e.company?.name) ?? "",
    start: ym(e.start_date),
    end: e.is_primary && !e.end_date ? null : ym(e.end_date),
    summary: e.summary ?? null,
  })).filter((e: { title: string; company: string }) => e.title || e.company);
  return {
    source: "PDL",
    sourceId: p.id,
    fullName: titleCase(p.full_name) ?? "Unknown",
    headline: p.headline ?? (p.job_title ? `${titleCase(p.job_title)} at ${titleCase(p.job_company_name)}` : null),
    currentTitle: titleCase(p.job_title),
    currentCompany: titleCase(p.job_company_name),
    location: titleCase(p.location_name),
    linkedinUrl: normalizeLinkedin(p.linkedin_url ? `https://${p.linkedin_url.replace(/^https?:\/\//, "")}` : null),
    otherUrls: [p.github_url].filter(Boolean).map((u: string) => `https://${u.replace(/^https?:\/\//, "")}`),
    email: p.work_email ?? null,
    phone: p.mobile_phone ?? null,
    experience,
    education: (p.education ?? []).map((e: PdlRecord) => ({
      school: titleCase(e.school?.name) ?? "",
      degree: titleCase(e.degrees?.[0]) ?? null,
      field: titleCase(e.majors?.[0]) ?? null,
      start: ym(e.start_date),
      end: ym(e.end_date),
    })),
    skills: (p.skills ?? []).slice(0, 40).map((s: string) => titleCase(s) ?? s),
    certifications: (p.certifications ?? []).map((c: PdlRecord) => c.name).filter(Boolean),
    languages: (p.languages ?? []).map((l: PdlRecord) => titleCase(l.name)).filter(Boolean),
    totalYears: p.inferred_years_experience ?? totalYearsFromExperience(experience),
    profileUpdatedAt: p.job_last_verified ?? p.job_last_changed ?? null,
  };
}

export const pdlProvider: CandidateSearchProvider = {
  name: "PDL",
  async search(brief, { size, seed }) {
    if (mock.pdl) {
      return { profiles: mockProfiles("PDL", brief, size, seed), total: size, billedRecords: 0, searches: 1, mock: true };
    }
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": env.pdlKey },
      body: JSON.stringify({ query: buildPdlQuery(brief), size: Math.min(size, 100), titlecase: false }),
    });
    const body = (await res.json().catch(() => ({}))) as PdlRecord;
    if (res.status === 404) return { profiles: [], total: 0, billedRecords: 0, searches: 1, mock: false };
    if (!res.ok) throw new Error(`People Data Labs error ${res.status}: ${body?.error?.message ?? res.statusText}`);
    const data: PdlRecord[] = body.data ?? [];
    return { profiles: data.map(mapPdl), total: body.total ?? data.length, billedRecords: data.length, searches: 1, mock: false };
  },
};
