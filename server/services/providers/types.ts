import type { EducationItem, ExperienceItem } from "../../../shared/types.js";
import type { SearchBrief } from "../../db/schema.js";

/** One person as returned by any provider, mapped to our shape. Protected attributes are never mapped. */
export type NormalizedProfile = {
  source: "PDL" | "SignalHire";
  sourceId: string;
  fullName: string;
  headline?: string | null;
  currentTitle?: string | null;
  currentCompany?: string | null;
  location?: string | null;
  linkedinUrl?: string | null;
  otherUrls?: string[];
  email?: string | null;
  phone?: string | null;
  experience: ExperienceItem[];
  education: EducationItem[];
  skills: string[];
  certifications?: string[];
  languages?: string[];
  totalYears?: number | null;
  openToWork?: boolean | null;
  profileUpdatedAt?: string | null;
  isSample?: boolean;
};

export type SearchResult = { profiles: NormalizedProfile[]; total: number; billedRecords: number; searches: number; mock: boolean };

export interface CandidateSearchProvider {
  name: "PDL" | "SignalHire";
  search(brief: SearchBrief, opts: { size: number; requestTitle: string; seed: number }): Promise<SearchResult>;
}

export function normalizeLinkedin(url?: string | null) {
  if (!url) return null;
  const m = url.toLowerCase().match(/linkedin\.com\/in\/([^/?#]+)/);
  return m ? `https://www.linkedin.com/in/${m[1].replace(/\/$/, "")}` : null;
}

export function yearsBetween(start?: string | null, end?: string | null) {
  if (!start) return 0;
  const s = new Date(start.length === 4 ? `${start}-01-01` : start).getTime();
  const e = end ? new Date(end.length === 4 ? `${end}-12-31` : end).getTime() : Date.now();
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 0;
  return (e - s) / (365.25 * 864e5);
}

export function totalYearsFromExperience(exp: ExperienceItem[]) {
  const starts = exp.map((e) => e.start).filter(Boolean) as string[];
  if (!starts.length) return null;
  const earliest = starts.sort()[0];
  return Math.round(yearsBetween(earliest, null) * 10) / 10;
}

export const titleCase = (s?: string | null) =>
  s ? s.replace(/\b([a-z])([a-z']*)/g, (_, a: string, b: string) => a.toUpperCase() + b) : s ?? null;
