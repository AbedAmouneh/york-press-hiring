// Fictional sample profiles used when a provider key is missing. Names and companies are invented.
import type { NormalizedProfile } from "./types.js";
import type { SearchBrief } from "../../db/schema.js";

export function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ["Lina","Omar","Sara","Daniel","Mira","Yusuf","Elena","Karim","Nadia","Tomás","Priya","Jonas","Hana","Marco","Leila","Felix","Aisha","Rami","Ines","Victor","Noor","Adam","Julia","Samir","Chloe","Tariq","Maya","Lukas","Zeina","Ethan","Rania","Pablo","Dana","Hugo","Salma","Igor","Farah","Nikolai","Amira","Theo","Joelle","Fadi","Carla","Ziad","Tala","Georges"];
const LAST = ["Haddad","Novak","Rahman","Costa","Khoury","Becker","Saleh","Moreau","Petrov","Aziz","Lindqvist","Mansour","Ferreira","Okafor","Nasser","Kowalski","Barakat","Silva","Hartmann","Yilmaz","Duarte","Farouk","Ivanova","Sabbagh","Meyer","Qasem","Rossi","Hamdan","Nilsen","Zaher","Abi Nader","Karam","Frem","Gemayel"];
const COMPANIES = ["Quillstone Media","Larkhaven Books","Brightleaf Learning","Northpine Digital","Atlas & Reed","Copperline Studios","Meridian Press Group","Tidewater Apps","Saltmarsh Publishing","Kestrel Health","Fernway Fintech","Inkwell Labs","Harbor Lane Software","Bluegate Education","Cedar Ridge Schools","Levant Learning Co."];
const LOCATIONS = ["Beirut, Lebanon","Jounieh, Lebanon","Amman, Jordan","Dubai, United Arab Emirates","London, United Kingdom","Berlin, Germany","Lisbon, Portugal","Cairo, Egypt","Toronto, Canada","Warsaw, Poland","Riyadh, Saudi Arabia","Barcelona, Spain"];
const SCHOOLS = ["American University of Beirut","Lebanese American University","Université Saint-Joseph","University of Jordan","University of Leeds","TU Berlin","University of Toronto","Cairo University"];
const DEGREES = ["BA","BSc","MA","MSc","MBA"];
const GENERIC_SKILLS = ["Stakeholder management","Project management","Communication","Data analysis","Team leadership","Excel","Agile","Presentation"];

function pick<T>(r: () => number, a: readonly T[]): T {
  return a[Math.floor(r() * a.length)];
}

export function mockProfiles(source: "PDL" | "SignalHire", brief: SearchBrief, size: number, seed: number): NormalizedProfile[] {
  const r = rng(seed);
  const titles = brief.titles.length ? brief.titles : ["Specialist"];
  const skillPool = [...brief.skills, ...brief.keywords, ...GENERIC_SKILLS];
  const locs = brief.locations.length ? [...brief.locations.map((l) => (l.includes(",") ? l : `Beirut, ${l}`)), ...LOCATIONS] : LOCATIONS;
  const out: NormalizedProfile[] = [];
  const used = new Set<string>();
  for (let i = 0; i < size; i++) {
    let first: string, last: string;
    do { first = pick(r, FIRST); last = pick(r, LAST); } while (used.has(first + last));
    used.add(first + last);
    const title = pick(r, titles);
    const company = pick(r, COMPANIES);
    const now = 2026;
    const curStart = now - Math.ceil(r() * 4);
    const prevStart = curStart - Math.ceil(1 + r() * 4);
    const firstStart = Math.max(2004, prevStart - Math.ceil(1 + r() * 5));
    const skills = [...new Set(Array.from({ length: 6 }, () => pick(r, skillPool)))];
    const slug = `${first}-${last}`.toLowerCase().replace(/[^a-z-]/g, "").replace(/\s+/g, "-");
    const hasEmail = r() > 0.3;
    out.push({
      source,
      sourceId: `${source.toLowerCase()}-sample-${seed}-${i}`,
      fullName: `${first} ${last}`,
      headline: `${title} at ${company}`,
      currentTitle: title,
      currentCompany: company,
      location: pick(r, locs),
      linkedinUrl: `https://www.linkedin.com/in/sample-${slug}`,
      email: source === "PDL" && hasEmail && r() > 0.6 ? `${slug.replace("-", ".")}@example.com` : null,
      experience: [
        { title, company, start: String(curStart), end: null, summary: `${title} responsible for ${skills.slice(0, 2).join(" and ").toLowerCase()}.` },
        { title: titles.length > 1 ? pick(r, titles) : `Associate ${title}`, company: pick(r, COMPANIES), start: String(prevStart), end: String(curStart) },
        { title: `Junior ${title.replace(/^(Senior|Lead|Head of)\s+/i, "")}`, company: pick(r, COMPANIES), start: String(firstStart), end: String(prevStart) },
      ],
      education: [{ school: pick(r, SCHOOLS), degree: pick(r, DEGREES), field: pick(r, ["Business", "English Literature", "Computer Science", "Education", "Finance", "Design"]), start: String(firstStart - 4), end: String(firstStart) }],
      skills,
      languages: r() > 0.4 ? ["English", "Arabic"] : ["English", "French"],
      totalYears: now - firstStart,
      openToWork: r() > 0.75,
      profileUpdatedAt: `2026-${String(1 + Math.floor(r() * 9)).padStart(2, "0")}-15`,
      isSample: true,
    });
  }
  return out;
}

/** Mock SignalHire contact reveal: about 70% of people get an email. */
export function mockContact(item: string) {
  let h = 0;
  for (const ch of item) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const r = rng(h);
  if (r() < 0.3) return null;
  const slug = item.split("/").filter(Boolean).pop()?.replace(/^sample-/, "") ?? "candidate";
  return { email: `${slug.replace("-", ".")}@example.com`, phone: r() > 0.5 ? `+961 3 ${String(100000 + Math.floor(r() * 899999))}` : null };
}
