import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

const REFUSED = /Demo accounts can only change demo accounts and test addresses/;

test("the demo admin sees the admin screens but can only change demo accounts and test addresses", async ({ page }) => {
  await signInAs(page, "Admin");
  await page.goto("/admin/users");
  await expect(page.getByText(/^Demo admin: you can look around/)).toBeVisible();

  // Khalil is a real person: his invite can't be cancelled from a demo account.
  const khalil = page.getByRole("row").filter({ hasText: "khalil.sayegh@york-press.com" });
  await expect(khalil).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await khalil.getByRole("button", { name: "Cancel invite" }).click();
  await expect(page.getByText(REFUSED)).toBeVisible();
  await expect(khalil).toHaveCount(1);

  // A real address can't be invited; a test address can.
  await page.getByRole("button", { name: "Add user" }).click();
  await page.getByLabel("Name").fill("Real Person");
  await page.getByLabel("Email").fill("real.person@york-press.com");
  await page.getByRole("button", { name: "Send invite" }).click();
  await expect(page.getByRole("dialog").getByText(REFUSED)).toBeVisible();
  await page.getByLabel("Email").fill("trial.person@example.com");
  await page.getByRole("button", { name: "Send invite" }).click();
  await expect(page.getByText("Invite sent to trial.person@example.com.")).toBeVisible();

  // Settings opens too.
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
});
