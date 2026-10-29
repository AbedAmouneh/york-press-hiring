/** Up to two initials from a name: "Abed El-Fattah Amouneh" → "AA". */
export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

/**
 * A LinkedIn people search for someone we have no profile link for yet. It opens in the recruiter's own
 * browser, so LinkedIn shows them the matching profiles; nothing is fetched or scraped by the app.
 */
export function linkedinSearchUrl(name: string, company?: string | null) {
  const words = [name, company && !/^(freelance|freelancer|self[- ]employed)$/i.test(company.trim()) ? company : null].filter(Boolean).join(" ");
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(words)}`;
}

/** "2019-03 – Present", "2015 – 2018", or "" when the source gave no dates. */
export function dateRange(start?: string | null, end?: string | null) {
  if (!start && !end) return "";
  return `${start ?? "?"} – ${end ?? "Present"}`;
}

/** A stable index into a palette of `size` colors, so a person keeps the same color everywhere. */
export function colorIndex(name: string, size: number) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % size;
}
