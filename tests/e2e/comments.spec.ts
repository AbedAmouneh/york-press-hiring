import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./helpers";

const COMMENT = "Please add:\n- the start date\n- the budget owner\n<b>not bold</b> شكراً";

/** The manager submits a fresh request (so other tests' data is untouched) and returns its address. */
async function submitRequest(page: Page, title: string) {
  await signInAs(page, "Manager");
  await page.goto("/requests/new");
  await page.getByLabel("Job title").fill(title);
  await page.keyboard.press("Escape");
  await page.getByLabel("Location", { exact: true }).selectOption({ label: "London, United Kingdom" });
  await page.getByLabel("Currency").selectOption("GBP");
  await page.getByLabel("Salary from").fill("30000");
  await page.getByLabel("Business justification for Khalil").fill("Checking comments.");
  await page.getByRole("button", { name: "Submit to Khalil" }).click();
  await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);
  return page.url();
}

async function switchTo(page: Page, who: "Manager" | "CEO approver") {
  await page.context().clearCookies();
  await signInAs(page, who);
}

test("Khalil's comment reaches the manager with its line breaks, and nothing in it runs as code", async ({ page }) => {
  const url = await submitRequest(page, "Comment Check Editor");

  await switchTo(page, "CEO approver");
  await page.goto(url);
  await page.getByLabel("Comment").fill(COMMENT);
  await page.getByRole("button", { name: "Request changes" }).click();
  await expect(page.getByText("Changes requested", { exact: true })).toBeVisible();

  // The manager sees it on the request page, in the list and on the edit page.
  await switchTo(page, "Manager");
  await page.goto(url);
  const shown = page.locator("p", { hasText: "the budget owner" });
  await expect(shown).toBeVisible();
  expect(await shown.innerText()).toContain("Please add:\n- the start date\n- the budget owner");
  await expect(shown).toContainText("<b>not bold</b>");
  await expect(page.locator("b", { hasText: "not bold" })).toHaveCount(0);

  await page.goto("/requests");
  await expect(page.getByRole("link", { name: /Comment Check Editor/ })).toContainText("Demo CEO:");

  await page.goto(url + "/edit");
  await expect(page.locator("p", { hasText: "the budget owner" })).toBeVisible();
});

test("the reason for a rejection is shown to the manager, and the CEO sees the limit as they type", async ({ page }) => {
  const url = await submitRequest(page, "Comment Check Translator");

  await switchTo(page, "CEO approver");
  await page.goto(url);
  const box = page.getByLabel("Comment");
  await box.fill("x".repeat(1900));
  await expect(page.getByText("1900 / 2000 characters")).toBeVisible();
  await box.fill("No budget for this role this year.");
  await page.getByRole("button", { name: "Reject" }).click();
  await expect(page.getByText("Rejected", { exact: true }).first()).toBeVisible();

  await switchTo(page, "Manager");
  await page.goto(url);
  await expect(page.getByText("No budget for this role this year.")).toBeVisible();
  await page.goto("/requests");
  await expect(page.getByText("No budget for this role this year.")).toBeVisible();
});
