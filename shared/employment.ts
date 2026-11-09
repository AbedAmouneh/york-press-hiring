import { EMPLOYMENT_LABELS, type EmploymentType } from "./types.js";

type Employment = { employmentType: EmploymentType; hoursPerWeek?: number | null; contractLength?: string | null };

/** "Full time", "Part time · 20 hours a week", "Freelance · 3 months". */
export function employmentLabel(r: Employment) {
  const extra = r.employmentType === "part_time" ? (r.hoursPerWeek ? `${r.hoursPerWeek} hours a week` : "")
    : r.employmentType === "full_time" ? "" : r.contractLength?.trim() ?? "";
  return [EMPLOYMENT_LABELS[r.employmentType], extra].filter(Boolean).join(" · ");
}
