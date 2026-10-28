import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

test("a refresh updates the role's numbers without reloading the page", async ({ page }) => {
  await signInAs(page, "Recruiter");
  await page.goto("/roles");
  await page.getByRole("link", { name: /Senior Product Designer/ }).click();
  const allTab = page.getByRole("tab", { name: /^All screened/ });
  const before = Number((await allTab.innerText()).match(/\d+/)?.[0]);
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect.poll(async () => Number((await allTab.innerText()).match(/\d+/)?.[0]), { timeout: 20_000 }).toBeGreaterThan(before);
});

test("a recruiter can open an email to read it", async ({ page }) => {
  await signInAs(page, "Recruiter");
  await page.goto("/outreach");
  await page.getByRole("group", { name: "Filter emails" }).getByRole("button", { name: /^All/ }).click();
  await page.getByRole("row").nth(1).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Email to");
  await expect(dialog).toContainText("York Press");
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the menu opens and takes you to a page", async ({ page }) => {
    await signInAs(page, "Recruiter");
    await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Roles" }).click();
    await expect(page).toHaveURL(/\/roles$/);
    await expect(page.getByRole("heading", { name: "Roles" })).toBeVisible();
  });
});
