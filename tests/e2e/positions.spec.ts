import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

test.describe("saved positions and locations", () => {
  test("picking a position suggests its details, and the manager can change them", async ({ page }) => {
    await signInAs(page, "Manager");
    await page.goto("/requests/new");

    const title = page.getByRole("combobox", { name: "Job title" });
    await title.click();
    await expect(page.getByRole("listbox", { name: "Saved positions" })).toBeVisible();
    await title.fill("account");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    await expect(title).toHaveValue("Accountant");
    await expect(page.getByRole("listbox")).toBeHidden();
    await expect(page.getByLabel("Department")).toHaveValue("Finance");
    await expect(page.getByRole("combobox", { name: "Seniority" })).toHaveValue("Entry");
    await expect(page.getByLabel("Must-haves")).toHaveValue(/^Bachelor's in Accounting or Finance\n/);
    await expect(page.getByLabel("Job description")).toHaveValue(/full accounting cycle/);
    await expect(page.getByRole("status")).toContainText("Finance · Entry · 0–1 yrs");
    await expect(page.getByRole("status")).toContainText("details suggested below");

    // Suggestions stay editable, and a later pick never overwrites what the manager typed.
    await page.getByLabel("Must-haves").fill("IFRS\nArabic");
    await title.fill("");
    await page.getByRole("option", { name: /^Financial Accountant/ }).click();
    await expect(title).toHaveValue("Financial Accountant");
    await expect(page.getByRole("combobox", { name: "Seniority" })).toHaveValue("Senior");
    await expect(page.getByLabel("Must-haves")).toHaveValue("IFRS\nArabic");

    // Undo puts back what the fields held before the last pick; the title stays.
    await page.getByRole("button", { name: "Undo suggestions" }).click();
    await expect(page.getByRole("combobox", { name: "Seniority" })).toHaveValue("Entry");
    await expect(title).toHaveValue("Financial Accountant");
  });

  test("department filters narrow the list and follow the search", async ({ page }) => {
    await signInAs(page, "Manager");
    await page.goto("/requests/new");
    const title = page.getByRole("combobox", { name: "Job title" });
    await title.click();
    const filters = page.getByRole("group", { name: "Filter by department" });
    await expect(filters.getByRole("button", { name: "All 29" })).toHaveAttribute("aria-pressed", "true");
    await filters.getByRole("button", { name: /^Finance/ }).click();
    const list = page.getByRole("listbox", { name: "Saved positions" });
    await expect(list.getByRole("option")).toHaveCount(3);
    await expect(title).toBeFocused();

    await title.fill("editor");
    await expect(filters.getByRole("button", { name: /^Editorial 7/ })).toBeVisible();
    await filters.getByRole("button", { name: /^Editorial/ }).click();
    // 7 editorial positions, plus "Use “editor” as a new title".
    await expect(list.getByRole("option")).toHaveCount(8);
  });

  test("a manager can type a title or a level that isn't in the list", async ({ page }) => {
    await signInAs(page, "Manager");
    await page.goto("/requests/new");
    const title = page.getByRole("combobox", { name: "Job title" });
    await title.fill("Podcast Host");
    await expect(page.getByRole("option", { name: "Use “Podcast Host” as a new title" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(title).toHaveValue("Podcast Host");
    await expect(page.getByLabel("Must-haves")).toHaveValue("");

    const level = page.getByRole("combobox", { name: "Seniority" });
    await level.fill("Head of Department");
    await page.keyboard.press("Escape");
    await expect(level).toHaveValue("Head of Department");
  });

  test("picking a location fills the arrangement, hours and country to search", async ({ page }) => {
    await signInAs(page, "Manager");
    await page.goto("/requests/new");
    await page.getByLabel("Location", { exact: true }).selectOption({ label: "Zouk Mosbeh, Lebanon" });
    await expect(page.getByLabel("Location policy")).toHaveValue("On-site, Zouk Mosbeh, Lebanon");
    await expect(page.getByLabel("Search in countries")).toHaveValue("Lebanon");
    await expect(page.getByLabel("Working hours")).toHaveValue(/Sat 8:00–13:30/);

    // Hiring for another country: the new location replaces the suggestion, but not what the manager typed.
    await page.getByText("More details").click();
    await page.getByLabel("Search in countries").fill("Lebanon, Jordan");
    await page.getByLabel("Location", { exact: true }).selectOption({ label: "Dubai, United Arab Emirates" });
    await expect(page.getByLabel("Location policy")).toHaveValue("On-site, Dubai, United Arab Emirates");
    await expect(page.getByLabel("Search in countries")).toHaveValue("Lebanon, Jordan");
  });

  test("a recruiter adds a position and a location in Settings and managers can use them", async ({ page }) => {
    await signInAs(page, "Recruiter");
    await page.goto("/settings");
    await page.getByRole("tab", { name: "Positions" }).click();
    await expect(page.getByRole("cell", { name: "Accountant", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Add position" }).click();
    await page.getByLabel("Job title").fill("Audio Producer");
    await page.getByLabel("Must-haves").fill("Audio editing\nPodcast production");
    await page.getByLabel("Minimum years").fill("5");
    await page.getByLabel("Ideal years").fill("2");
    await page.getByRole("button", { name: "Add position" }).last().click();
    await expect(page.getByText("Ideal years should be at least the minimum.")).toBeVisible();
    await page.getByLabel("Ideal years").fill("7");
    await page.getByLabel("Job description").fill("Produce our audio lessons and podcasts.");
    await page.getByRole("button", { name: "Add position" }).last().click();
    await expect(page.getByRole("cell", { name: "Audio Producer", exact: true })).toBeVisible();

    await page.getByRole("tab", { name: "Locations" }).click();
    await page.getByRole("button", { name: "Add location" }).click();
    await page.getByLabel("Name").fill("Riyadh, Saudi Arabia");
    await page.getByRole("button", { name: "Add location" }).last().click();
    await expect(page.getByText("Add the country.")).toBeVisible();
    await page.getByLabel("Country").fill("Saudi Arabia");
    await page.getByLabel("Work arrangement").selectOption("Hybrid");
    await page.getByLabel("Working hours").fill("Sun–Thu 8:00–16:00");
    await page.getByRole("button", { name: "Add location" }).last().click();
    await expect(page.getByRole("cell", { name: "Riyadh, Saudi Arabia", exact: true })).toBeVisible();

    await page.goto("/requests/new");
    await page.getByRole("combobox", { name: "Job title" }).fill("audio");
    await page.getByRole("option", { name: /^Audio Producer/ }).click();
    await expect(page.getByLabel("Job description")).toHaveValue("Produce our audio lessons and podcasts.");
    await page.getByLabel("Location", { exact: true }).selectOption({ label: "Riyadh, Saudi Arabia" });
    await expect(page.getByLabel("Location policy")).toHaveValue("Hybrid, Riyadh, Saudi Arabia");
    await expect(page.getByLabel("Working hours")).toHaveValue("Sun–Thu 8:00–16:00");
  });
});
