import { expect, test, type Page } from "@playwright/test";
import { designerLink, signInAs, type DemoUser } from "./helpers";

// Nothing is sent automatically: a recruiter or the role's hiring manager presses Contact, edits the message and sends.

async function openDesignerTop10(page: Page, who: DemoUser) {
  await signInAs(page, who);
  await page.goto("/roles");
  await designerLink(page).click();
  await expect(page.getByRole("tab", { name: "Top 10" })).toHaveAttribute("aria-selected", "true");
  return page.getByRole("tabpanel").getByRole("row");
}

/** A Top-10 person on the open role with an email and no message yet, picked from the API (sample data varies). */
async function emailablePerson(page: Page) {
  const roleId = new URL(page.url()).pathname.split("/").pop();
  const { candidates } = await (await page.request.get(`/api/requests/${roleId}/candidates`)).json();
  const person = candidates.find((c: { isTop10: boolean; email: string | null; outreach: unknown }) => c.isTop10 && c.email && !c.outreach);
  expect(person, "a Top-10 person with an email who hasn't been contacted").toBeTruthy();
  return person.fullName as string;
}

test("a recruiter edits the drafted email and sends it from the Top 10", async ({ page }) => {
  const rows = await openDesignerTop10(page, "Recruiter");
  const name = await emailablePerson(page);
  const row = rows.filter({ hasText: name });
  await row.getByRole("button", { name: "Contact" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: `Contact ${name}` })).toBeVisible();
  await expect(dialog.getByRole("radio", { name: /Email/ })).toHaveAttribute("aria-checked", "true");
  await expect(dialog.getByText("CC: abdulrahman.mansour@york-press.com")).toBeVisible();
  const message = dialog.getByLabel("Message");
  await expect(message).toHaveValue(/^Hi /);
  await message.fill(`${await message.inputValue()}\n\nLooking forward to hearing from you.`);
  await dialog.getByRole("button", { name: "Send email" }).click();

  await expect(page.getByText(`Email sent to ${name}.`)).toBeVisible();
  await expect(rows.filter({ hasText: name }).getByText("Email sent")).toBeVisible();

  // It's on the Outreach page, and opening it shows the email as sent.
  await page.goto("/outreach");
  await page.getByRole("row").filter({ hasText: name }).first().click();
  const sent = page.getByRole("dialog");
  await expect(sent).toContainText(`Email to ${name}`);
  await expect(sent).toContainText("Looking forward to hearing from you.");
});

test("LinkedIn notes count their 300 characters and WhatsApp needs a phone number", async ({ page }) => {
  const rows = await openDesignerTop10(page, "Recruiter");
  await rows.filter({ has: page.getByRole("button", { name: "Contact" }) }).first().getByRole("button", { name: "Contact" }).click();
  const dialog = page.getByRole("dialog");
  const linkedin = dialog.getByRole("radio", { name: /LinkedIn/ });
  if (await linkedin.isEnabled()) {
    await linkedin.click();
    await expect(dialog.getByText(/\/ 300 characters/)).toBeVisible();
    await dialog.getByLabel("Message").fill("x".repeat(301));
    await expect(dialog.getByRole("button", { name: "Approve for LinkedIn" })).toBeDisabled();
  }
  const whatsapp = dialog.getByRole("radio", { name: /WhatsApp/ });
  if (await whatsapp.isDisabled()) await expect(whatsapp).toHaveAttribute("title", "No phone number");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
});

test("the role's hiring manager can contact people; the CEO can't", async ({ page, browser }) => {
  const rows = await openDesignerTop10(page, "Hiring manager");
  await expect(rows.getByRole("button", { name: "Contact" }).first()).toBeVisible();

  const ceo = await (await browser.newContext()).newPage();
  const ceoRows = await openDesignerTop10(ceo, "CEO approver");
  await expect(ceoRows.nth(1)).toBeVisible();
  await expect(ceoRows.getByRole("button", { name: "Contact" })).toHaveCount(0);
});
