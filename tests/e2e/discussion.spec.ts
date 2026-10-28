import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./helpers";

async function submitRequest(page: Page, title: string) {
  await signInAs(page, "Manager");
  await page.goto("/requests/new");
  await page.getByLabel("Job title").fill(title);
  await page.keyboard.press("Escape");
  await page.getByLabel("Location", { exact: true }).selectOption({ label: "London, United Kingdom" });
  await page.getByLabel("Currency").selectOption("GBP");
  await page.getByLabel("Salary from").fill("30000");
  await page.getByLabel("Business justification for Khalil").fill("Checking the discussion.");
  await page.getByRole("button", { name: "Submit to Khalil" }).click();
  await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);
  return page.url();
}

async function post(page: Page, text: string) {
  await page.getByLabel("Write a message").fill(text);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("list", { name: "Messages" })).toContainText(text.split("\n")[0]);
}

test("the manager and Khalil talk on a request", async ({ page }) => {
  const url = await submitRequest(page, "Discussion Check Editor");
  await post(page, "Khalil, is GBP 30k enough for this one?");

  // Khalil follows the notification straight to the discussion and replies.
  await page.context().clearCookies();
  await signInAs(page, "CEO approver");
  await page.goto("/notifications");
  await page.getByRole("link", { name: /Demo Manager wrote on Discussion Check Editor/ }).click();
  await expect(page).toHaveURL(/#discussion$/);
  await expect(page.getByRole("list", { name: "Messages" })).toContainText("is GBP 30k enough");
  await post(page, "Make it 35k.\nThen I'll approve.");

  // The manager sees the reply, line breaks kept, and can delete their own fresh message but not Khalil's.
  await page.context().clearCookies();
  await signInAs(page, "Manager");
  await page.goto(url);
  const messages = page.getByRole("list", { name: "Messages" }).getByRole("listitem");
  await expect(messages).toHaveCount(2);
  expect(await messages.nth(1).locator("p").innerText()).toBe("Make it 35k.\nThen I'll approve.");
  await expect(messages.nth(1).getByRole("button", { name: "Delete message" })).toHaveCount(0);
  await messages.nth(0).hover();
  await messages.nth(0).getByRole("button", { name: "Delete message" }).click();
  await expect(messages).toHaveCount(1);
});
