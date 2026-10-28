/** Up to two initials from a name: "Abed El-Fattah Amouneh" → "AA". */
export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

/** A stable index into a palette of `size` colors, so a person keeps the same color everywhere. */
export function colorIndex(name: string, size: number) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % size;
}
