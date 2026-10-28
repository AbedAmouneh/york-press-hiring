import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

test("the request form counts what is still missing", async ({ page }) => {
  await signInAs(page, "Manager");
  await page.goto("/requests/new");
  await expect(page.getByText("0/5")).toBeVisible();
  await page.getByLabel("Job title").fill("Commissioning Editor");
  await page.getByLabel("Must-haves").fill("Commissioning");
  await expect(page.getByText("2/5")).toBeVisible();
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
  await expect(page.getByLabel("Per")).toHaveValue("month");
  await page.getByLabel("Job title").fill("Salary Period Check");
  await page.keyboard.press("Escape");
  await page.getByLabel("Currency").selectOption("USD");
  await page.getByLabel("Salary from").fill("2500");
  await page.getByLabel("Salary to").fill("3000");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);
  await expect(page.getByText("/ month")).toBeVisible();
});

test("a submitted request shows its timeline with the next step", async ({ page }) => {
  await signInAs(page, "CEO approver");
  await page.getByRole("link", { name: /^Review R-\d+ / }).first().click();
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();
  await expect(page.getByText("Waiting for Khalil")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve and start sourcing" })).toBeVisible();
});
