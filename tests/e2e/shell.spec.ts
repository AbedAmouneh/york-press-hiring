import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

test("the top bar search finds a role and opens it", async ({ page }) => {
  await signInAs(page, "Recruiter");
  await page.getByRole("button", { name: /Search roles and requests/ }).click();
  await page.getByRole("textbox", { name: "Search roles and requests" }).fill("product designer");
  await expect(page.getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/roles\/[\w-]+$/);
  await expect(page.getByRole("heading", { name: /Senior Product Designer/ })).toBeVisible();
});

test("the sidebar shows the signed-in person and only their screens", async ({ page }) => {
  await signInAs(page, "Manager");
  const logo = page.getByRole("complementary").getByRole("img", { name: "York Press" });
  await expect(logo).toBeVisible();
  expect(await logo.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: "Requests" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Settings" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /New request/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Notifications/ })).toBeVisible();
});
