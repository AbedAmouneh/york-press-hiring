import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

test("a recruiter sees the Top 10 for an open role and opens a candidate", async ({ page }) => {
  await signInAs(page, "Recruiter");
  await expect(page).toHaveURL(/:\d+\/$/);
  await page.getByRole("link", { name: /Senior Product Designer/ }).click();

  await expect(page.getByRole("tab", { name: "Top 10" })).toHaveAttribute("aria-selected", "true");
  const rows = page.getByRole("tabpanel").getByRole("row");
  await expect(rows).toHaveCount(11); // header + 10 candidates

  const first = rows.nth(1);
  // The name is the first text node; badges such as "Sample" follow it.
  const name = (await first.locator(".font-medium").first().evaluate((el) => el.firstChild?.textContent ?? "")).trim();
  expect(name).not.toBe("");
  await first.click();
  const panel = page.getByRole("dialog");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(name);
});

test("all screened candidates can be filtered by name", async ({ page }) => {
  await signInAs(page, "Recruiter");
  await page.getByRole("link", { name: /Senior Product Designer/ }).click();
  await page.getByRole("tab", { name: /All screened/ }).click();

  const rows = page.getByRole("tabpanel").getByRole("row");
  await expect.poll(() => rows.count()).toBeGreaterThan(11);
  await page.getByLabel("Search").fill("zzzz-nobody");
  await expect(page.getByText("No candidates match")).toBeVisible();
});
