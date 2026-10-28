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

test("a submitted request shows its timeline with the next step", async ({ page }) => {
  await signInAs(page, "CEO approver");
  await page.getByRole("link", { name: /^Review R-\d+ / }).first().click();
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();
  await expect(page.getByText("Waiting for Khalil")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve and start sourcing" })).toBeVisible();
});
