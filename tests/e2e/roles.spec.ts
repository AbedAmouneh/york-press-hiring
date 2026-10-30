import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

test("roles can be filtered by status", async ({ page }) => {
  await signInAs(page, "Recruiter");
  await page.goto("/roles");
  const filters = page.getByRole("group", { name: "Filter roles" });
  await expect(filters.getByRole("button", { name: /^All/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("link", { name: /Senior Product Designer/ })).toBeVisible();
  await filters.getByRole("button", { name: /^Closed/ }).click();
  await expect(page.getByRole("link", { name: /Senior Product Designer/ })).toHaveCount(0);
  await expect(page.getByText("Nothing here")).toBeVisible();
});

test("an approved request shows how many candidates were found and links to them", async ({ page }) => {
  await signInAs(page, "CEO approver");
  await page.goto("/roles");
  await page.getByRole("link", { name: /Senior Product Designer/ }).click();
  const roleUrl = new URL(page.url()).pathname;
  await page.goto(roleUrl.replace("/roles/", "/requests/"));
  await expect(page.getByText(/^\d+ candidates? found$/)).toBeVisible();
  await expect(page.getByText(/^Top \d+ ready to review$/)).toBeVisible();
  await page.getByRole("link", { name: "View candidates" }).click();
  await expect(page).toHaveURL(new RegExp(`${roleUrl}$`));
});

test("the candidate panel splits details into tabs", async ({ page }) => {
  await signInAs(page, "Recruiter");
  await page.goto("/roles");
  await page.getByRole("link", { name: /Senior Product Designer/ }).click();
  await page.getByRole("tabpanel").getByRole("row").nth(1).click();
  const panel = page.getByRole("dialog");
  await expect(panel.getByText("Score breakdown")).toBeVisible();
  await panel.getByRole("tab", { name: "Experience" }).click();
  await expect(panel.getByText(/years total/)).toBeVisible();
  await panel.getByRole("tab", { name: "Contact & outreach" }).click();
  await expect(panel.getByText("Contact", { exact: true })).toBeVisible();
});
