import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export function fmtDate(d?: string | Date | null) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d.length === 10 ? `${d}T12:00:00Z` : d) : d;
  if (Number.isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Beirut" });
}

export function fmtDateTime(d?: string | Date | null) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Beirut" });
}


export function money(min?: number | null, max?: number | null, currency?: string | null, period?: string) {
  if (!min && !max) return "—";
  const f = (n: number) => n.toLocaleString("en-US");
  const range = min && max ? `${f(min)}–${f(max)}` : f((min ?? max)!);
  return `${currency ?? ""} ${range}${period ? ` / ${period}` : ""}`.trim();
}
