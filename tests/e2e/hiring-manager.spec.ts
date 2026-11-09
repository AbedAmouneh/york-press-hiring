import { expect, test, type Page } from "@playwright/test";
import { designerLink, signInAs } from "./helpers";

// The seeded "Senior Product Designer" role is managed by the demo hiring manager; "Finance Manager" is not.

async function openDesignerRole(page: Page) {
  await signInAs(page, "Hiring manager");
  await page.goto("/roles");
  await designerLink(page).click();
  await expect(page.getByRole("tab", { name: "Top 10" })).toHaveAttribute("aria-selected", "true");
}

const hmYes = (page: Page) => page.getByText("HM yes", { exact: true }).locator("xpath=following-sibling::div[1]");

test("the hiring manager sees their role, says Yes, and the role's HM yes count goes up", async ({ page }) => {
  await openDesignerRole(page);
  const before = Number(await hmYes(page).textContent());
  const rows = page.getByRole("tabpanel").getByRole("row");
  await expect(rows).toHaveCount(11);
  // Rank 10: other tests open the first rows.
  await rows.nth(10).click();
  const panel = page.getByRole("dialog");
  await expect(panel.getByText("Your decision")).toBeVisible();
  await panel.getByLabel("HM decision").selectOption("yes");
  await panel.getByLabel("HM comment").fill("Strong portfolio, let's talk.");
  await panel.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect.poll(async () => Number(await hmYes(page).textContent())).toBe(before + 1);
});

test("the hiring manager can't change a candidate's status", async ({ page }) => {
  await openDesignerRole(page);
  await page.getByRole("tabpanel").getByRole("row").nth(9).click();
  const panel = page.getByRole("dialog");
  await expect(panel.getByLabel("HM decision")).toBeVisible();
  await expect(panel.getByLabel("Status", { exact: true })).toHaveCount(0);
  await expect(panel.getByLabel("Follow-up date")).toHaveCount(0);
  // The API refuses it too, not only the form.
  const roleId = new URL(page.url()).pathname.split("/").pop();
  const { candidates } = await (await page.request.get(`/api/requests/${roleId}/candidates`)).json();
  const origin = new URL(page.url()).origin;
  const res = await page.request.patch(`/api/role-candidates/${candidates[0].id}`, { data: { status: "rejected" }, headers: { origin } });
  expect(res.status()).toBe(403);
  expect(await res.text()).not.toMatch(/origin/i);
});

test("the hiring manager sees contact details on their own role only", async ({ page }) => {
  await openDesignerRole(page);
  // Sample data varies per run: open someone in the Top 10 who has an email.
  const roleId = new URL(page.url()).pathname.split("/").pop();
  const { candidates } = await (await page.request.get(`/api/requests/${roleId}/candidates`)).json();
  const person = candidates.find((c: { isTop10: boolean; email: string | null }) => c.isTop10 && c.email);
  await page.getByRole("tabpanel").getByRole("row").filter({ hasText: person.fullName }).click();
  const panel = page.getByRole("dialog");
  await panel.getByRole("tab", { name: "Contact & outreach" }).click();
  await expect(panel.getByText(person.email)).toBeVisible();
  await expect(panel.getByText(/^From /)).toBeVisible();

  // A role they don't manage can't be opened at all, so its contacts stay hidden.
  const roles = await (await page.request.get("/api/requests")).json();
  expect(roles.requests.some((r: { title: string }) => r.title === "Finance Manager")).toBe(false);
});
