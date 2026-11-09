import { describe, expect, it } from "vitest";
import { isBasicMustHave, splitMustHaves } from "../../shared/must-haves.js";

describe("isBasicMustHave", () => {
  it.each([
    "Microsoft Office, Word and PowerPoint (2+ years)",
    "MS Office (Word, Excel, PowerPoint)",
    "Proficiency in Microsoft Office Suite",
    "Microsoft Office and Excel",
    "Google Workspace",
    "Bachelor's degree in Computer Science or related",
    "BSc in Engineering",
    "Excellent communication skills",
    "Strong attention to detail",
    "Team player",
    "Ability to work under pressure",
    "Self-motivated and organized",
    "Fluent English and Arabic",
    "Excellent written and spoken English",
    "Native or near-native English",
    "Native Arabic with excellent English",
    "Bachelor's degree in Computer Science, Data Science or related",
    "Bachelor's in Accounting or Finance",
    "Degree in Biology, Chemistry, Physics or related",
    "Microsoft Excel and Office",
    "Willingness to travel",
    "Driving licence",
    "Working to briefs and deadlines",
    "Ability to meet tight deadlines",
  ])("treats %s as basic", (m) => expect(isBasicMustHave(m)).toBe(true));

  it.each([
    "Django",
    "Python (3+ years)",
    "3+ years of Django REST Framework",
    "Advanced Excel (pivot tables, VLOOKUP)",
    "Excel",
    "Copy editing",
    "Adobe InDesign",
    "Communication strategy",
    "Arabic copywriting",
    "Bachelor's degree and PostgreSQL",
    "Team leadership",
    "Microsoft 365 administration and IT support",
    "Office administration",
    "Arabic / right-to-left interfaces",
    "CPA, ACCA or ACA",
    "5+ years software engineering",
    "3+ years",
    "Writing legal briefs",
    "Consistent characters and style across a series",
  ])("keeps %s as core", (m) => expect(isBasicMustHave(m)).toBe(false));
});

describe("splitMustHaves", () => {
  it("separates core skills from basic requirements, keeping the order", () => {
    expect(splitMustHaves(["Django", "Microsoft Office, Word and PowerPoint", "PostgreSQL", "Bachelor's degree in Computer Science"])).toEqual({
      core: ["Django", "PostgreSQL"],
      basic: ["Microsoft Office, Word and PowerPoint", "Bachelor's degree in Computer Science"],
    });
  });

  it("scores everything as core when a role only lists basic requirements", () => {
    const musts = ["MS Office", "Fluent English", "Good communication skills"];
    expect(splitMustHaves(musts)).toEqual({ core: musts, basic: [] });
  });
});
