import { describe, expect, it } from "vitest";
import { cvProblem, DecisionInput, RequestInput, RequestPatch, TemplateInput, WeightsInput } from "../../shared/schemas.js";
import { DEFAULT_WEIGHTS } from "../../shared/types.js";
import { InviteForm, LocationForm, PositionForm, RequestDraftForm, RequestForm, SetupForm, type RequestFormValues } from "../../src/lib/forms.js";

const messages = (r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  Object.fromEntries((r.error?.issues ?? []).map((i) => [i.path.join("."), i.message]));

describe("request rules", () => {
  it("fills defaults for a minimal request", () => {
    const r = RequestInput.parse({ title: "Editor", department: "Editorial", seniority: "Senior" });
    expect(r).toMatchObject({ headcount: 1, kind: "new", mustHaves: [], locationPolicy: "Remote, global", salaryPeriod: "month" });
  });

  it("rejects a salary band and years range that run backwards", () => {
    const r = RequestInput.safeParse({ title: "Editor", department: "Editorial", seniority: "Senior", salaryMin: 5000, salaryMax: 4000, minYears: 8, idealYears: 5 });
    expect(messages(r)).toEqual({
      salaryMax: "The top of the band must be at least the bottom.",
      idealYears: "Ideal years must be at least the minimum.",
    });
  });

  it("patches only the fields that were sent", () => {
    expect(RequestPatch.parse({ title: "Managing Editor" })).toEqual({ title: "Managing Editor" });
  });
});

describe("other API rules", () => {
  it("needs a comment to reject or request changes, but not to approve", () => {
    expect(DecisionInput.safeParse({ action: "approve" }).success).toBe(true);
    expect(messages(DecisionInput.safeParse({ action: "reject" }))).toEqual({ comment: "Add a comment so the manager knows why." });
  });

  it("needs weights that add up to 100", () => {
    expect(WeightsInput.safeParse(DEFAULT_WEIGHTS).success).toBe(true);
    expect(WeightsInput.safeParse({ ...DEFAULT_WEIGHTS, must: 34 }).success).toBe(false);
  });

  it("limits LinkedIn notes to 300 characters but not emails", () => {
    const body = "x".repeat(301);
    expect(TemplateInput.safeParse({ name: "Note", channel: "linkedin", body }).success).toBe(false);
    expect(TemplateInput.safeParse({ name: "Email", channel: "email", body }).success).toBe(true);
  });

  it("checks CV size and type", () => {
    expect(cvProblem(null)).toBe("Please attach your CV.");
    expect(cvProblem({ size: 5 * 1024 * 1024, type: "application/pdf" })).toBe("The CV must be smaller than 4 MB.");
    expect(cvProblem({ size: 1000, type: "image/png" })).toBe("Please upload a PDF, Word or text file.");
    expect(cvProblem({ size: 1000, type: "application/pdf" })).toBeNull();
  });
});

const emptyRequest: RequestFormValues = {
  title: "", department: "Editorial", seniority: "Senior", headcount: "1", startDate: "", kind: "new", jdText: "",
  mustHaves: "", niceToHaves: "", dealBreakers: "", minYears: "", idealYears: "", languages: "", locationPolicy: "Remote, global",
  searchLocations: "", timeZone: "", salaryMin: "", salaryMax: "", currency: "", salaryPeriod: "year", justification: "",
  targetCompanies: "", avoidCompanies: "", hiringManagerId: "", locationId: "", workingHours: "",
};
const LOCATION_ID = "5b1f0e8a-4c1e-4b8e-9a51-2f6d2d1c9a10";

describe("browser forms reuse the API rules", () => {
  it("shows the form-only rules and the API rules together", () => {
    const r = RequestForm.safeParse(emptyRequest);
    expect(messages(r)).toEqual({
      title: "Add a job title.",
      locationId: "Choose where this person will work.",
      currency: "Choose a currency.",
      justification: "Explain why this role is needed.",
    });
  });

  it("lets a draft be saved without location, budget or reason, but not without a title", () => {
    expect(messages(RequestDraftForm.safeParse(emptyRequest))).toEqual({ title: "Add a job title." });
    expect(RequestDraftForm.safeParse({ ...emptyRequest, title: "Senior Editor" }).success).toBe(true);
  });

  it("turns text fields into the API shape", () => {
    const r = RequestForm.parse({
      ...emptyRequest, title: "Senior Editor", currency: "USD", justification: "Growth.", locationId: LOCATION_ID, workingHours: " Mon–Fri 8–17 ",
      mustHaves: "Copy editing\n\n InDesign ", languages: "English, Arabic,", salaryMin: "40,000", salaryMax: "55000",
    });
    expect(r).toMatchObject({ mustHaves: ["Copy editing", "InDesign"], languages: ["English", "Arabic"], salaryMin: 40000, salaryMax: 55000, startDate: null, hiringManagerId: null, locationId: LOCATION_ID, workingHours: "Mon–Fri 8–17" });
  });

  it("reads one manager per line on the setup form", () => {
    const base = { adminName: "Abed", adminEmail: "abed@york-press.test", adminPassword: "a-long-password", ceoName: "Khalil", ceoEmail: "khalil@york-press.test" };
    expect(SetupForm.parse({ ...base, managers: "Rana, rana@york-press.test, Editorial\n" }).managers).toEqual([
      { name: "Rana", email: "rana@york-press.test", department: "Editorial" },
    ]);
    expect(messages(SetupForm.safeParse({ ...base, managers: "Rana, not-an-email" }))).toHaveProperty("managers");
  });

  it("checks a saved position the same way as the API", () => {
    const base = { title: "Accountant", department: "Finance", seniority: "Entry", mustHaves: "Accounting\n Excel ", niceToHaves: "", languages: "English", minYears: "3", idealYears: "1", jdText: "", active: true };
    expect(messages(PositionForm.safeParse(base))).toEqual({ idealYears: "Ideal years should be at least the minimum." });
    expect(PositionForm.parse({ ...base, idealYears: "5" })).toMatchObject({ mustHaves: ["Accounting", "Excel"], languages: ["English"], minYears: 3, idealYears: 5 });
  });

  it("checks a hiring location and treats an empty city as none", () => {
    const base = { name: "Dubai, UAE", country: "", city: " ", workArrangement: "On-site", workingHours: "", active: true };
    expect(messages(LocationForm.safeParse(base))).toEqual({ country: "Add the country." });
    expect(LocationForm.parse({ ...base, country: "United Arab Emirates" })).toMatchObject({ city: null, country: "United Arab Emirates" });
  });

  it("checks that the two passwords match", () => {
    expect(messages(InviteForm.safeParse({ password: "a-long-password", confirm: "another-password" }))).toEqual({ confirm: "The passwords don't match." });
  });
});
