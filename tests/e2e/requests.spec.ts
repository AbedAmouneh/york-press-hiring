import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

test("the request form marks what's required and counts only that", async ({ page }) => {
  await signInAs(page, "Manager");
  await page.goto("/requests/new");
  // Required fields carry an asterisk; optional ones don't.
  const marked = (text: string) => page.locator("label", { hasText: new RegExp(`^${text}$`) }).locator("xpath=following-sibling::span[1]");
  for (const name of ["Job title", "Location", "Currency", "Business justification for Khalil"]) await expect(marked(name)).toHaveText("*");
  for (const name of ["Must-haves", "Target start date", "Salary from"]) await expect(marked(name)).toHaveCount(0);
  await expect(page.getByLabel("Location", { exact: true })).toHaveAttribute("aria-required", "true");

  await expect(page.getByText("0/4")).toBeVisible();
  await page.getByLabel("Job title").fill("Commissioning Editor");
  await page.getByLabel("Must-haves").fill("Commissioning");
  await expect(page.getByText("1/4")).toBeVisible();
  await expect(page.getByRole("list", { name: "Recommended" })).toContainText("Must-haves");
});

test("the timeline reads oldest first and ends with the step it is waiting on", async ({ page }) => {
  await signInAs(page, "Manager");
  await page.goto("/requests/new");
  await page.getByLabel("Job title").fill("Audit Editor");
  await page.keyboard.press("Escape");
  await page.getByLabel("Location", { exact: true }).selectOption({ label: "London, United Kingdom" });
  await page.getByLabel("Currency").selectOption("GBP");
  await page.getByLabel("Salary from").fill("30000");
  await page.getByLabel("Business justification for Khalil").fill("The ELT list is growing.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);
  // The request page, not the form still on screen while it loads.
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();

  await page.getByRole("button", { name: "Submit to Khalil" }).click();
  const steps = page.getByRole("listitem").filter({ hasText: /Created draft|Submitted|Waiting for Khalil/ });
  await expect(steps).toHaveText([/Created draft/, /Submitted/, /Waiting for Khalil/]);
});

test("editing a draft shows the saved location", async ({ page }) => {
  await signInAs(page, "Manager");
  await page.goto("/requests/new");
  await page.getByLabel("Job title").fill("Audit Translator");
  await page.keyboard.press("Escape");
  await page.getByLabel("Location", { exact: true }).selectOption({ label: "Athens, Greece" });
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);
  await page.getByRole("link", { name: "Edit" }).click();
  await expect(page.getByLabel("Location", { exact: true }).locator("option:checked")).toHaveText("Athens, Greece");
});

test("salaries are per month unless the manager picks per year", async ({ page }) => {
  await signInAs(page, "Manager");
  await page.goto("/requests/new");
  await expect(page.getByLabel("Per", { exact: true })).toHaveValue("month");
  await page.getByLabel("Job title").fill("Salary Period Check");
  await page.keyboard.press("Escape");
  await page.getByLabel("Currency").selectOption("USD");
  await page.getByLabel("Salary from").fill("2500");
  await page.getByLabel("Salary to").fill("3000");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);
  await expect(page.getByText("/ month")).toBeVisible();
  await expect(page.getByText("Full time", { exact: true })).toBeVisible();
});

test("the employment type sets the pay basis and asks for its own details", async ({ page }) => {
  await signInAs(page, "Manager");
  await page.goto("/requests/new");
  await page.getByLabel("Job title").fill("Freelance Cover Illustrator");
  await page.keyboard.press("Escape");
  const type = page.getByLabel("Employment type");
  const per = page.getByLabel("Per", { exact: true });
  await expect(type).toHaveValue("full_time");
  await expect(page.getByLabel("Contract length")).toHaveCount(0);

  await type.selectOption("part_time");
  await expect(per).toHaveValue("month");
  await expect(page.getByLabel("Hours per week")).toBeVisible();
  await type.selectOption("contractor");
  await expect(per).toHaveValue("day");
  await type.selectOption("freelance");
  await expect(per).toHaveValue("hour");
  // A basis picked by hand stays when the type changes.
  await per.selectOption("project");
  await type.selectOption("contractor");
  await expect(per).toHaveValue("project");
  await type.selectOption("freelance");

  await page.getByLabel("Contract length").fill("3 months");
  await page.getByLabel("Expected workload").fill("About 10 covers");
  await page.getByLabel("Project description").fill("Covers for the spring list, due by March.");
  await page.getByLabel("Currency").selectOption("USD");
  await page.getByLabel("Salary from").fill("12.50");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();
  await expect(page.getByText("Freelance · 3 months")).toBeVisible();
  await expect(page.getByText("USD 12.50 / project")).toBeVisible();
  await expect(page.getByRole("heading", { name: "The work" })).toBeVisible();
  await expect(page.getByText("Covers for the spring list, due by March.")).toBeVisible();

  await page.getByRole("link", { name: "Edit" }).click();
  await expect(page.getByLabel("Employment type")).toHaveValue("freelance");
  await expect(page.getByLabel("Expected workload")).toHaveValue("About 10 covers");
});

test("a submitted request shows its timeline with the next step", async ({ page }) => {
  await signInAs(page, "CEO approver");
  await page.getByRole("link", { name: /^Review R-\d+ / }).first().click();
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();
  await expect(page.getByText("Waiting for Khalil")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve and start sourcing" })).toBeVisible();
});

test("an approved role is edited with one Save, without resubmitting it", async ({ page }) => {
  await signInAs(page, "Recruiter");
  await page.goto("/requests");
  await page.getByRole("link", { name: /Senior Product Designer/ }).first().click();
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();
  await page.getByRole("link", { name: "Edit" }).click();
  await expect(page.getByRole("button", { name: "Save changes" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit to Khalil" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save draft" })).toHaveCount(0);
  await page.getByLabel("Target start date").fill("2027-02-01");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Changes saved.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();
  await expect(page.getByText("1 Feb 2027")).toBeVisible();
  await expect(page.getByText("Waiting for Khalil")).toHaveCount(0);
});
