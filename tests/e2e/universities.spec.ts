import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

// Universities are optional: picking a location opens its country's list; a location can carry a starting list.

test("a manager picks universities for a request from the location's country", async ({ page }) => {
  await signInAs(page, "Manager");
  await page.goto("/requests/new");
  await page.getByLabel("Job title").fill("Graduate Accountant");
  await page.keyboard.press("Escape");
  await page.getByLabel("Location", { exact: true }).selectOption({ label: "Zouk Mosbeh, Lebanon" });

  await expect(page.getByLabel("University country")).toHaveValue("Lebanon");
  const list = page.getByRole("group", { name: "Universities in Lebanon" });
  await page.getByLabel("Search universities").fill("American University of Beirut");
  await list.getByLabel(/^American University of Beirut/).check();
  // Another country can be added too.
  await page.getByLabel("University country").selectOption("Jordan");
  await page.getByLabel("Search universities").fill("University of Jordan");
  await page.getByRole("group", { name: "Universities in Jordan" }).getByLabel(/^The University of Jordan|^University of Jordan/).first().check();
  const chosen = page.getByLabel("Chosen universities");
  await expect(chosen).toContainText("American University of Beirut");
  await expect(chosen.getByRole("button", { name: /^Remove / })).toHaveCount(2);

  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Only graduates and students of")).toBeVisible();
  await expect(page.getByText("American University of Beirut")).toBeVisible();
});

test("a missing university can be added and is ticked straight away", async ({ page }) => {
  await signInAs(page, "Manager");
  await page.goto("/requests/new");
  await page.getByLabel("Location", { exact: true }).selectOption({ label: "Athens, Greece" });
  await expect(page.getByLabel("University country")).toHaveValue("Greece");
  const name = `Browser Test College ${Date.now()}`;
  await page.getByLabel("Search universities").fill(name);
  await page.getByRole("button", { name: `Add "${name}" to Greece` }).click();
  await expect(page.getByLabel("Chosen universities")).toContainText(name);
});

test("a location's universities are where its new requests start", async ({ page }) => {
  await signInAs(page, "Recruiter");
  await page.goto("/settings?tab=locations");
  const row = page.getByRole("row").filter({ hasText: "Alexandria, Egypt" });
  await row.getByRole("button", { name: "Edit" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Search universities").fill("Alexandria University");
  await dialog.getByRole("group", { name: "Universities in Egypt" }).getByLabel(/^Alexandria University/).first().check();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(row.getByText("1 chosen")).toBeVisible();

  await page.goto("/requests/new");
  await page.getByLabel("Location", { exact: true }).selectOption({ label: "Alexandria, Egypt" });
  await expect(page.getByLabel("Chosen universities")).toContainText("Alexandria University");

  // Put the location back as it was for other tests.
  await page.goto("/settings?tab=locations");
  await page.getByRole("row").filter({ hasText: "Alexandria, Egypt" }).getByRole("button", { name: "Edit" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Clear all" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("row").filter({ hasText: "Alexandria, Egypt" }).getByText("Everyone")).toBeVisible();
});
