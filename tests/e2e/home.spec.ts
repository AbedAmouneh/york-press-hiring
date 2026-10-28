import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

test("a recruiter's Home shows metrics and roles in progress", async ({ page }) => {
  await signInAs(page, "Recruiter");
  await expect(page.getByText("Open roles", { exact: true })).toBeVisible();
  await expect(page.getByText("Emails today")).toBeVisible();
  const role = page.getByRole("link", { name: /Senior Product Designer/ });
  await expect(role).toBeVisible();
  await expect(role.getByRole("img", { name: /^Stage:/ })).toBeVisible();
  await role.click();
  await expect(page).toHaveURL(/\/roles\/[\w-]+$/);
});

test("the CEO's Home lists requests to review", async ({ page }) => {
  await signInAs(page, "CEO approver");
  await expect(page.getByText("Waiting for you")).toBeVisible();
  await page.getByRole("link", { name: /^Review R-\d+ / }).first().click();
  await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);
});
