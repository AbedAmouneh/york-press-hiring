import { expect, test } from "@playwright/test";

test("anyone can ask for a reset link from the sign-in page", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  await page.getByLabel("Email").fill("someone@york-press.test");
  await page.getByRole("button", { name: "Send reset link" }).click();
  // The same answer whether or not the address has an account.
  await expect(page.getByRole("status")).toHaveText(/If someone@york-press\.test has an account, we've emailed it a link/);
  await page.getByRole("link", { name: "Back to sign in" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("an old or made-up reset link explains itself and offers a new one", async ({ page }) => {
  await page.goto("/reset/not-a-real-token");
  await expect(page.getByText("This reset link is invalid or has expired. Ask for a new one.")).toBeVisible();
  await page.getByRole("link", { name: "Send a new link" }).click();
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
});
