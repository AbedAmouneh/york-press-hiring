import { expect, type Page } from "@playwright/test";

export type DemoUser = "Manager" | "CEO approver" | "Recruiter" | "Hiring manager";

/** Sign in with one of the demo accounts from the login page (mock mode only). */
export async function signInAs(page: Page, who: DemoUser) {
  await page.goto("/login");
  await page.getByRole("button", { name: who, exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** The seeded designer role's link, not the "Contact the Top 10 for …" task on Home that mentions it too. */
export const designerLink = (page: Page) => page.getByRole("link", { name: /Senior Product Designer/ }).filter({ hasNotText: /Contact the Top 10|Follow up with/ });
