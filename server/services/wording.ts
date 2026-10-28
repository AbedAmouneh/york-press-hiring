/**
 * Fit a phrase into the middle of a sentence: only its first letter is lowered, so place names keep their capitals.
 * "On-site, Zouk Mosbeh, Lebanon" → "on-site, Zouk Mosbeh, Lebanon". A leading acronym ("UK office") is left alone.
 */
export function midSentence(s: string) {
  const t = s.trim();
  if (!t) return t;
  if (/^[A-Z]{2,}\b/.test(t)) return t;
  return t[0].toLowerCase() + t.slice(1);
}
