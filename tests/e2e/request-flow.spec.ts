import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

test("a manager is told about every problem at once, then submits a request", async ({ page }) => {
  await signInAs(page, "Manager");
  await page.goto("/requests/new");
  await page.getByRole("button", { name: "Submit to Khalil" }).click();

  await expect(page.getByText("Add a job title.")).toBeVisible();
  await expect(page.getByText("Choose where this person will work.")).toBeVisible();
  await expect(page.getByText("Choose a currency.")).toBeVisible();
  await expect(page.getByText("Explain why this role is needed.")).toBeVisible();
  await expect(page).toHaveURL(/\/requests\/new$/);

  await page.getByLabel("Job title").fill("Commissioning Editor");
  await page.getByLabel("Location", { exact: true }).selectOption({ label: "London, United Kingdom" });
  await page.getByLabel("Must-haves").fill("Commissioning\nCopy editing");
  await page.getByLabel("Salary from").fill("40000");
  await page.getByLabel("Salary to").fill("30000");
  await page.getByLabel("Currency").selectOption("USD");
  await page.getByLabel("Business justification for Khalil").fill("The list is growing and we need another editor.");
  await page.getByRole("button", { name: "Submit to Khalil" }).click();
  // The shared server rule runs in the browser too.
  await expect(page.getByText("The top of the band must be at least the bottom.")).toBeVisible();

  await page.getByLabel("Salary to").fill("55000");
  await page.getByRole("button", { name: "Submit to Khalil" }).click();
  await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Commissioning Editor" })).toBeVisible();
});

test("the CEO needs a comment to send a request back", async ({ page }) => {
  await signInAs(page, "CEO approver");
  await expect(page).toHaveURL(/\/approvals$/);
  await page.getByRole("link", { name: /Finance Manager/ }).click();

  await page.getByRole("button", { name: "Request changes" }).click();
  await expect(page.getByText("Add a comment so the manager knows why.")).toBeVisible();

  await page.getByLabel("Comment").fill("Please add the budget owner.");
  await page.getByRole("button", { name: "Request changes" }).click();
  await expect(page.getByText("Sent back with your comment.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Request changes" })).toBeHidden();
});
