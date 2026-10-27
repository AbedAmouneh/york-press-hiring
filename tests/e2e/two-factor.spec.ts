import { expect, test, type Page } from "@playwright/test";
import { currentCode } from "../../server/services/two-factor";

// The seeded admin (created by first-run setup) is a real account, so two-step login applies.
const ADMIN = { email: "demo.admin@york-press.test", password: "demo-york-2026" };

async function signInWithPassword(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("an admin must set up two-step login, then needs a code to sign in", async ({ page }) => {
  // First sign-in: the app is locked until two-step login is on.
  await signInWithPassword(page);
  await expect(page.getByRole("heading", { name: "Set up two-step login" })).toBeVisible();
  await page.getByRole("button", { name: "Show my QR code" }).click();
  await expect(page.getByRole("img", { name: /QR code/ })).toBeVisible();
  const secret = (await page.locator(".select-all").innerText()).trim();

  await page.getByLabel("Code from the app").fill("000000");
  await page.getByRole("button", { name: "Turn on two-step login" }).click();
  await expect(page.getByText("That code didn't match.")).toBeVisible();

  await page.getByLabel("Code from the app").fill(currentCode(secret));
  await page.getByRole("button", { name: "Turn on two-step login" }).click();
  await expect(page.getByRole("heading", { name: "Two-step login is on" })).toBeVisible();
  const recovery = (await page.locator("ol li").allInnerTexts()).map((c) => c.trim());
  expect(recovery).toHaveLength(8);
  await page.getByRole("button", { name: "I've saved them, continue" }).click();
  await expect(page).toHaveURL(/\/roles$/);

  // Next sign-in: password, then a code. A recovery code works once.
  await page.context().clearCookies();
  await signInWithPassword(page);
  await expect(page.getByRole("heading", { name: "Two-step login" })).toBeVisible();
  await page.getByLabel("Code").fill("123456");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByText("That code didn't work.")).toBeVisible();
  await page.getByLabel("Code").fill(recovery[0]);
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/roles$/);
  await expect(page.getByRole("heading", { name: "Open roles" })).toBeVisible();
});
