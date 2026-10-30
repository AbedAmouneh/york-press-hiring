/** Helpers for picking several values in one field that the form stores as comma-separated text. */

export const splitList = (text: string) => text.split(",").map((s) => s.trim()).filter(Boolean);
export const joinList = (values: string[]) => values.join(", ");

/**
 * Add typed or picked text to the list. A match in the options (any case) is stored with the option's spelling;
 * anything else is kept as typed. Values already in the list are not added twice.
 */
export function addValue(values: string[], text: string, options: readonly string[] = []) {
  const typed = text.replace(/,/g, " ").replace(/\s+/g, " ").trim();
  if (!typed) return values;
  const value = options.find((o) => o.toLowerCase() === typed.toLowerCase()) ?? typed;
  return values.some((v) => v.toLowerCase() === value.toLowerCase()) ? values : [...values, value];
}

export const removeValue = (values: string[], value: string) => values.filter((v) => v.toLowerCase() !== value.toLowerCase());

export const toggleValue = (values: string[], value: string) =>
  values.some((v) => v.toLowerCase() === value.toLowerCase()) ? removeValue(values, value) : [...values, value];
