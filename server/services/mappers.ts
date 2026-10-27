import type { schema } from "../db/client.js";
import type { CandidateForAI } from "./claude.js";

type Request = typeof schema.roleRequests.$inferSelect;
type Candidate = typeof schema.candidates.$inferSelect;
type RoleCandidate = typeof schema.roleCandidates.$inferSelect;

export function toReq(r: Request) {
  return {
    title: r.title,
    department: r.department,
    seniority: r.seniority,
    jdText: r.jdText,
    mustHaves: r.mustHaves,
    niceToHaves: r.niceToHaves,
    dealBreakers: r.dealBreakers,
    minYears: r.minYears,
    idealYears: r.idealYears,
    languages: r.languages,
    locationPolicy: r.locationPolicy,
    searchLocations: r.searchLocations,
    timeZone: r.timeZone,
    targetCompanies: r.targetCompanies,
    avoidCompanies: r.avoidCompanies,
  };
}

/** Candidate as sent to Claude: no name, no education years (avoids age inference). */
export function toAI(c: Candidate, rc?: RoleCandidate | null): CandidateForAI {
  return {
    key: rc?.id ?? c.id,
    headline: c.headline,
    currentTitle: c.currentTitle,
    currentCompany: c.currentCompany,
    location: c.location,
    experience: c.experience.slice(0, 12).map((e) => ({ title: e.title, company: e.company, start: e.start, end: e.end, summary: e.summary?.slice(0, 400) })),
    education: c.education.slice(0, 4).map((e) => ({ school: e.school, degree: e.degree, field: e.field })),
    skills: c.skills.slice(0, 30),
    certifications: c.certifications.slice(0, 10),
    languages: c.languages,
    totalYears: c.totalYears,
    openToWork: c.openToWork,
    webFindings: rc?.webFindings ?? null,
  };
}
