// Pure helpers for the search step: merge duplicates across providers and rank before scoring.
import { normalizeLinkedin, type NormalizedProfile } from "./providers/types.js";

export type MergedProfile = NormalizedProfile & { sources: string[]; pdlId?: string; signalhireUid?: string };

/** "jane doe|acme" — the fallback identity when there is no LinkedIn URL. */
export const nameKey = (p: { fullName: string; currentCompany?: string | null }) =>
  `${p.fullName.toLowerCase().replace(/\s+/g, " ").trim()}|${(p.currentCompany ?? "").toLowerCase().trim()}`;

/**
 * Merge duplicates across sources by LinkedIn URL, then name + current company.
 * Drops anyone currently at an excluded company. Keeps the richest data from each source.
 */
export function mergeProfiles(profiles: NormalizedProfile[], excludeCompanies: string[]): MergedProfile[] {
  const excluded = excludeCompanies.map((c) => c.toLowerCase()).filter(Boolean);
  const merged = new Map<string, MergedProfile>();
  for (const p of profiles) {
    if (p.currentCompany && excluded.some((x) => p.currentCompany!.toLowerCase().includes(x))) continue;
    const li = normalizeLinkedin(p.linkedinUrl);
    const altKey = nameKey(p);
    const key = li ?? altKey;
    const idField = p.source === "PDL" ? "pdlId" : "signalhireUid";
    const existing = merged.get(key) ?? merged.get(altKey);
    if (existing) {
      if (!existing.sources.includes(p.source)) existing.sources.push(p.source);
      existing.email ??= p.email;
      existing.phone ??= p.phone;
      existing.linkedinUrl ??= li;
      if (p.experience.some((e) => e.start) && !existing.experience.some((e) => e.start)) existing.experience = p.experience;
      if (!existing.education.length) existing.education = p.education;
      existing.skills = [...new Set([...existing.skills, ...p.skills])];
      existing[idField] = p.sourceId;
    } else {
      const rec: MergedProfile = { ...p, linkedinUrl: li, sources: [p.source], [idField]: p.sourceId };
      merged.set(key, rec);
      if (altKey !== key) merged.set(altKey, rec);
    }
  }
  return [...new Set(merged.values())];
}

/** Cheap 0–100 ranking used to pick which profiles go to Claude: title 50, skills 30, years 20. */
export function prescore(p: NormalizedProfile, titles: string[], skills: string[], minYears: number | null) {
  const t = `${p.currentTitle ?? ""} ${p.headline ?? ""}`.toLowerCase();
  const titleHit = titles.some((x) => t.includes(x.toLowerCase())) ? 1 : titles.some((x) => x.toLowerCase().split(/\s+/).some((w) => w.length > 3 && t.includes(w))) ? 0.5 : 0;
  const sk = new Set(p.skills.map((s) => s.toLowerCase()));
  const skillHit = skills.length ? skills.filter((s) => sk.has(s.toLowerCase()) || [...sk].some((x) => x.includes(s.toLowerCase()))).length / skills.length : 0.5;
  const yrs = p.totalYears ?? 0;
  const yearsHit = minYears ? Math.min(1, yrs / minYears) : 0.7;
  return Math.round((titleHit * 50 + skillHit * 30 + yearsHit * 20) * 10) / 10;
}
