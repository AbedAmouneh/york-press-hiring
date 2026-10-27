import { TIMEZONE } from "../env.js";

/** YYYY-MM-DD in Beirut time. */
export function localDate(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** 0 = Sunday … 6 = Saturday, in Beirut time. */
export function localWeekday(d = new Date()) {
  const w = new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, weekday: "short" }).format(d);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(w);
}

/** Start of today in Beirut as a Date (UTC instant). */
export function startOfLocalDay(d = new Date()) {
  const ymd = localDate(d);
  // Find the UTC instant whose Beirut date flips to ymd: try offsets from -14h to +14h.
  const base = Date.parse(`${ymd}T00:00:00Z`);
  for (let h = -14; h <= 14; h++) {
    const t = new Date(base - h * 3600e3);
    if (localDate(t) === ymd && localDate(new Date(t.getTime() - 1)) !== ymd) return t;
  }
  return new Date(base);
}

export function addBusinessDays(ymd: string, n: number) {
  const d = new Date(`${ymd}T12:00:00Z`);
  let added = 0;
  while (added < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d.toISOString().slice(0, 10);
}
