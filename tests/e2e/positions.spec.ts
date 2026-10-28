import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

test.describe("saved positions", () => {
  test("picking a position suggests its details, and the manager can change them", async ({ page }) => {
    await signInAs(page, "Manager");
    await page.goto("/requests/new");

    const title = page.getByRole("combobox", { name: "Job title" });
    await title.click();
    await expect(page.getByRole("listbox", { name: "Saved positions" })).toBeVisible();
    await title.fill("junior");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    await expect(title).toHaveValue("Junior Editor");
    await expect(page.getByRole("listbox")).toBeHidden();
    await expect(page.getByLabel("Department")).toHaveValue("Editorial");
    await expect(page.getByLabel("Seniority")).toHaveValue("Junior");
    await expect(page.getByLabel("Must-haves")).toHaveValue("Editing\nProofreading\nStrong written English");
    await expect(page.getByRole("status")).toContainText("Suggested from the saved “Junior Editor” position");

    // Suggestions stay editable, and a later pick never overwrites what the manager typed.
    await page.getByLabel("Must-haves").fill("Editing\nArabic proofreading");
    await title.fill("");
    await page.getByRole("option", { name: /^Senior Editor/ }).click();
    await expect(title).toHaveValue("Senior Editor");
    await expect(page.getByLabel("Seniority")).toHaveValue("Senior");
    await expect(page.getByLabel("Must-haves")).toHaveValue("Editing\nArabic proofreading");
  });

  test("a manager can still type a title that isn't in the list", async ({ page }) => {
    await signInAs(page, "Manager");
    await page.goto("/requests/new");
    const title = page.getByRole("combobox", { name: "Job title" });
    await title.fill("Podcast Host");
    await expect(page.getByText("“Podcast Host” will be used as a new title.")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(title).toHaveValue("Podcast Host");
    await expect(page.getByLabel("Must-haves")).toHaveValue("");
  });

  test("a recruiter adds a position in Settings and it appears on the request form", async ({ page }) => {
    await signInAs(page, "Recruiter");
    await page.goto("/settings");
    await page.getByRole("tab", { name: "Positions" }).click();
    await expect(page.getByRole("cell", { name: "Junior Editor", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Add position" }).click();
    await page.getByLabel("Job title").fill("Audio Producer");
    await page.getByLabel("Must-haves").fill("Audio editing\nPodcast production");
    await page.getByLabel("Minimum years").fill("5");
    await page.getByLabel("Ideal years").fill("2");
    await page.getByRole("button", { name: "Add position" }).last().click();
    await expect(page.getByText("Ideal years should be at least the minimum.")).toBeVisible();
    await page.getByLabel("Ideal years").fill("7");
    await page.getByRole("button", { name: "Add position" }).last().click();
    await expect(page.getByRole("cell", { name: "Audio Producer", exact: true })).toBeVisible();

    await page.goto("/requests/new");
    await page.getByRole("combobox", { name: "Job title" }).fill("audio");
    await page.getByRole("option", { name: /^Audio Producer/ }).click();
    await expect(page.getByLabel("Must-haves")).toHaveValue("Audio editing\nPodcast production");
    await expect(page.getByLabel("Minimum years")).toHaveValue("5");
  });
});
