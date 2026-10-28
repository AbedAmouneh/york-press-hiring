import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

test.describe("page access by role", () => {
  test("a manager typing a staff page address is sent back to Home", async ({ page }) => {
    await signInAs(page, "Manager");
    for (const path of ["/admin/users", "/settings", "/outreach", "/linkedin", "/outbox", "/approvals"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/:\d+\/$/);
    }
  });

  test("a hiring manager can't open the new request form", async ({ page }) => {
    await signInAs(page, "Hiring manager");
    await page.goto("/requests/new");
    await expect(page).toHaveURL(/:\d+\/$/);
  });

  test("the CEO can't open recruiter pages or Users", async ({ page }) => {
    await signInAs(page, "CEO approver");
    for (const path of ["/outreach", "/settings", "/admin/users"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/:\d+\/$/);
    }
  });

  test("a recruiter can't open Users or Approvals", async ({ page }) => {
    await signInAs(page, "Recruiter");
    for (const path of ["/admin/users", "/approvals"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/:\d+\/$/);
    }
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/settings$/);
  });
});
