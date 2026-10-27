import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

test("a candidate uploads a CV on the public apply page", async ({ page, browser }) => {
  // Find the open role's apply link the way a recruiter would get it: from the API.
  await signInAs(page, "Recruiter");
  const res = await page.request.get("/api/requests?scope=roles");
  const { requests } = (await res.json()) as { requests: { title: string; applyToken: string }[] };
  const role = requests.find((r) => r.title === "Senior Product Designer")!;

  // The candidate is a stranger: a fresh browser context with no session.
  const candidate = await browser.newContext();
  const apply = await candidate.newPage();
  await apply.goto(`/apply/${role.applyToken}`);
  await expect(apply.getByRole("heading", { name: "Senior Product Designer" })).toBeVisible();

  await apply.getByRole("button", { name: "Send my CV" }).click();
  await expect(apply.getByText("Please attach your CV.")).toBeVisible();

  await apply.getByLabel("Full name").fill("Rana Haddad");
  await apply.getByLabel("Email").fill("rana.haddad@example.test");
  await apply.getByLabel("CV", { exact: true }).setInputFiles({ name: "rana-cv.txt", mimeType: "text/plain", buffer: Buffer.from("Senior product designer, 9 years, Figma.") });
  await apply.getByRole("checkbox").check();
  await apply.getByRole("button", { name: "Send my CV" }).click();
  await expect(apply.getByRole("heading", { name: "Thank you, we've received your CV" })).toBeVisible();
  await candidate.close();

  // The recruiter sees it on the role.
  await page.getByRole("link", { name: /Senior Product Designer/ }).click();
  await page.getByRole("tab", { name: "CVs received" }).click();
  await expect(page.getByText("Rana Haddad")).toBeVisible();
});
