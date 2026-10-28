import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

test("a recruiter sets and clears the SignalHire monthly credit limit", async ({ page }) => {
  await signInAs(page, "Recruiter");
  await page.goto("/settings");
  const limit = page.getByLabel("SignalHire monthly credit limit");
  await expect(limit).toHaveValue("");
  await expect(page.getByText(/Used this month: \d+/)).toBeVisible();

  const save = limit.locator("xpath=following-sibling::button");
  await limit.fill("8");
  await save.click();
  await expect(page.getByText("Credit limit saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("SignalHire monthly credit limit")).toHaveValue("8");

  await page.getByLabel("SignalHire monthly credit limit").fill("");
  await page.getByLabel("SignalHire monthly credit limit").locator("xpath=following-sibling::button").click();
  await page.reload();
  await expect(page.getByLabel("SignalHire monthly credit limit")).toHaveValue("");
});
