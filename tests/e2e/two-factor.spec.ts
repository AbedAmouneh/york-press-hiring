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

// The tests share the admin's recovery codes, so they run in order.
test.describe.configure({ mode: "serial" });
let recovery: string[] = [];

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
  recovery = (await page.locator("ol li").allInnerTexts()).map((c) => c.trim());
  expect(recovery).toHaveLength(8);
  await page.getByRole("button", { name: "I've saved them, continue" }).click();
  await expect(page).toHaveURL(/:\d+\/$/);

  // Next sign-in: password, then a code. A recovery code works once.
  await page.context().clearCookies();
  await signInWithPassword(page);
  await expect(page.getByRole("heading", { name: "Two-step login" })).toBeVisible();
  await page.getByLabel("Code").fill("123456");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByText("That code didn't work.")).toBeVisible();
  await page.getByLabel("Code").fill(recovery[0]);
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/:\d+\/$/);
  await expect(page.getByRole("heading", { name: /^Good (morning|afternoon|evening)/ })).toBeVisible();
});

test("an admin cancels an invite, adds a user with a starting password, and the user picks their own", async ({ page }) => {
  await signInWithPassword(page);
  await page.getByLabel("Code").fill(recovery[1]);
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/:\d+\/$/);

  // Khalil's seeded invite was never accepted, so it can be cancelled.
  await page.goto("/admin/users");
  const khalil = page.getByRole("row").filter({ hasText: "khalil.sayegh@york-press.com" });
  page.once("dialog", (d) => d.accept());
  await khalil.getByRole("button", { name: "Cancel invite" }).click();
  await expect(page.getByText("Invite for Khalil Sayegh cancelled.")).toBeVisible();
  await expect(khalil).toHaveCount(0);

  await page.getByRole("button", { name: "Add user" }).click();
  await page.getByRole("radio", { name: "Set a password" }).click();
  await page.getByLabel("Name").fill("Rana Haddad");
  await page.getByLabel("Email").fill("rana.haddad@york-press.test");
  await page.getByLabel("Starting password").fill("rana-starts-here");
  await page.getByRole("button", { name: "Create user" }).click();
  await expect(page.getByText("Account created for rana.haddad@york-press.test.")).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "rana.haddad@york-press.test" }).getByText("new password due")).toBeVisible();

  // The new user signs in with the starting password and must choose their own before using the app.
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill("rana.haddad@york-press.test");
  await page.getByLabel("Password").fill("rana-starts-here");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Choose your own password to continue.")).toBeVisible();
  await page.getByLabel("New password").fill("ranas-own-password");
  await page.getByLabel("Repeat password").fill("ranas-own-password");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByRole("heading", { name: /^Good (morning|afternoon|evening)/ })).toBeVisible();
});
