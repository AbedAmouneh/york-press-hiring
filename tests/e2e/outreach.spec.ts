import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

test("the LinkedIn queue keeps the two sections Cowork reads, and approving moves a note", async ({ page }) => {
  await signInAs(page, "Recruiter");
  await page.goto("/linkedin");
  const ready = page.getByRole("heading", { name: /^Approved — ready to send/ });
  const waiting = page.getByRole("heading", { name: /^Needs your approval/ });
  await expect(ready).toBeVisible();
  await expect(waiting).toBeVisible();
  // The demo data may or may not have notes waiting, depending on which tests ran first.
  const approve = page.getByRole("button", { name: "Approve" });
  if (await approve.count()) {
    const before = Number((await ready.innerText()).match(/\d+$/)?.[0] ?? 0);
    await approve.first().click();
    await expect(ready).toContainText(String(before + 1));
    await expect(page.getByRole("button", { name: "Mark as sent" }).first()).toBeVisible();
  }
});

test("email outreach opens on everything when nothing is queued", async ({ page }) => {
  await signInAs(page, "Recruiter");
  await page.goto("/outreach");
  await expect(page.getByText(/sent today/)).toBeVisible();
  const filters = page.getByRole("group", { name: "Filter emails" });
  await expect(filters.getByRole("button", { name: /^All/ })).toHaveAttribute("aria-pressed", "true");
});

test("settings sections can be linked to directly", async ({ page }) => {
  await signInAs(page, "Recruiter");
  await page.goto("/settings?tab=locations");
  await expect(page.getByRole("tab", { name: "Locations" })).toHaveAttribute("aria-selected", "true");
});

test("notifications can show only unread ones", async ({ page }) => {
  await signInAs(page, "Recruiter");
  await page.goto("/notifications");
  await page.getByRole("group", { name: "Filter notifications" }).getByRole("button", { name: /^Unread/ }).click();
  await expect(page.getByRole("button", { name: /^Unread/ })).toHaveAttribute("aria-pressed", "true");
});
