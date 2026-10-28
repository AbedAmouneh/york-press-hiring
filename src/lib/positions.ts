// Small helpers for showing saved positions.
import type { Position } from "./types";

/** "2–5 yrs", "5+ yrs" or "" from a position's year range. */
export function yearsLabel(p: Pick<Position, "minYears" | "idealYears">) {
  if (p.minYears == null && p.idealYears == null) return "";
  if (p.idealYears == null || p.idealYears === p.minYears) return `${p.minYears}+ yrs`;
  return `${p.minYears ?? 0}–${p.idealYears} yrs`;
}

/** First sentence of the JD's "The Role" paragraph, used as a one-line summary. */
export function summaryOf(jdText: string) {
  const role = jdText.split(/\n\s*\n/).find((block) => block.trim().startsWith("The Role"));
  const text = (role ?? "").replace(/^The Role\s*/, "").replace(/\s+/g, " ").trim();
  const sentence = text.match(/^.*?[.!?](\s|$)/)?.[0] ?? text;
  return sentence.trim();
}
