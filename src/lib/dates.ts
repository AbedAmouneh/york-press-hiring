/** Today as YYYY-MM-DD in Beirut time, the calendar the server keeps contact and follow-up dates in. */
export function todayLocal(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** "Today", "Yesterday", or a date like "Mon 26 Oct", for grouping lists by day. */
export function dayGroup(value: string | Date, now = new Date()) {
  const d = new Date(value);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(now) - start(d)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
