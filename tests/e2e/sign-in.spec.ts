import { expect, test } from "@playwright/test";

test.describe("sign in", () => {
  test("shows both field errors before calling the server", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText("Enter your email.")).toBeVisible();
    await expect(page.getByText("Enter your password.")).toBeVisible();
  });

  test("shows the server's message for a wrong password", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("demo.manager@york-press.test");
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText("Email or password is incorrect.");
    await expect(page).toHaveURL(/\/login/);
  });

  test("sends a manager to their requests", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("demo.manager@york-press.test");
    await page.getByLabel("Password").fill("demo-york-2026");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/requests$/);
    await expect(page.getByRole("heading", { name: "My requests" })).toBeVisible();
  });

  test("keeps signed-out visitors away from app pages", async ({ page }) => {
    await page.goto("/roles");
    await expect(page).toHaveURL(/\/login\?next=%2Froles/);
  });
});
