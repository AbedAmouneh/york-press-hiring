import { expect, test } from "@playwright/test";
import { designerLink, signInAs } from "./helpers";

test("a refresh updates the role's numbers without reloading the page", async ({ page }) => {
  await signInAs(page, "Recruiter");
  await page.goto("/roles");
  await designerLink(page).click();
  const allTab = page.getByRole("tab", { name: /^All screened/ });
  const before = Number((await allTab.innerText()).match(/\d+/)?.[0]);
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect.poll(async () => Number((await allTab.innerText()).match(/\d+/)?.[0]), { timeout: 20_000 }).toBeGreaterThan(before);
});

test("Score again re-scores the role without contacting anyone", async ({ page }) => {
  await signInAs(page, "Recruiter");
  await page.goto("/roles");
  await designerLink(page).click();
  await page.getByRole("button", { name: "Score again" }).click();
  await expect(page.getByText("Nobody is contacted.")).toBeVisible();
  await page.getByRole("tab", { name: /^Runs/ }).click();
  await expect(page.getByText(/^Score again ·/).first()).toBeVisible();
  await expect(page.getByText(/Scoring \d+ people again with the current rules/).first()).toBeVisible({ timeout: 20_000 });
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the role page has no sideways scroll and every action is reachable", async ({ page }) => {
    await signInAs(page, "Recruiter");
    await page.goto("/roles");
    await designerLink(page).click();
    await expect(page.getByRole("button", { name: "Score again" })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test("the menu opens and takes you to a page", async ({ page }) => {
    await signInAs(page, "Recruiter");
    await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Roles" }).click();
    await expect(page).toHaveURL(/\/roles$/);
    await expect(page.getByRole("heading", { name: "Roles" })).toBeVisible();
  });
});
