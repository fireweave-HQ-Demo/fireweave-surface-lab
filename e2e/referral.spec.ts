import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

const email = "staff@demo.clinic";
const password = "password-demo-1";

function pdf(name: string, marker: string) {
  const bytes = readFileSync(path.resolve("fixtures/referrals", name));
  return { name, mimeType: "application/pdf", buffer: Buffer.concat([bytes, Buffer.from(marker)]) };
}

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Referral inbox" })).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test("a STAT packet is approved and written to the sandbox chart", async ({ page }) => {
  await signIn(page);
  await page.setInputFiles("#file", path.resolve("fixtures/referrals/gi-stat.pdf"));
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByRole("link", { name: "Review Avery Quinn" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("STAT").first()).toBeVisible();
  await expect(page.getByText("Ready for you").first()).toBeVisible();
  await page.getByRole("link", { name: "Review Avery Quinn" }).click();
  await page.getByRole("button", { name: "Looks good" }).click();
  await expect(page.locator("p", { hasText: "Status" }).locator("strong")).toHaveText("completed", { timeout: 90_000 });
  const chart = await page.request.get("http://127.0.0.1:4010/chart");
  const body = await chart.text();
  expect(body).toContain("Avery Quinn");
  expect(body).toContain("1984-03-12");
  await expect(page.getByText("booked Dr. Patel at 08:00")).toBeVisible();
  await expect(page.getByText("This call is automated and recorded.")).toBeVisible();
  const schedule = await page.request.get("http://127.0.0.1:4010/schedule");
  const appointments = (await schedule.json()) as { patientName: string; provider: string; slot: string }[];
  expect(appointments).toEqual(
    expect.arrayContaining([expect.objectContaining({ patientName: "Avery Quinn", provider: "Dr. Patel", slot: "08:00" })]),
  );
  await page.getByRole("button", { name: "Take control" }).click();
  await expect(page.locator("p", { hasText: "Status" }).locator("strong")).toHaveText("completed");
});

test("an incomplete packet is faxed back and is not offered for review", async ({ page }) => {
  await signIn(page);
  await page.setInputFiles("#file", path.resolve("fixtures/referrals/gi-incomplete.pdf"));
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByText("Blair Quinn")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Send it back — missing labs, insurance").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Review Blair Quinn" })).toHaveCount(0);
  const audit = await page.request.get("/api/audit");
  expect(audit.ok()).toBeTruthy();
  const rows = (await audit.json()) as { action: string }[];
  expect(rows.some((row) => row.action === "fax_back")).toBeTruthy();
  await page.goto("/hub");
  await expect(page.getByRole("heading", { name: "Patient hub" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Blair Quinn/ })).toHaveCount(0);
});

test("reject closes the workflow without writing the chart", async ({ page }) => {
  await signIn(page);
  await page.setInputFiles("#file", pdf("gi-stat.pdf", "reject"));
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByRole("link", { name: "Review Avery Quinn" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("link", { name: "Review Avery Quinn" }).click();
  await page.getByRole("button", { name: "Reject" }).click();
  await page.getByRole("dialog", { name: "Reject referral" }).getByRole("button", { name: "Reject" }).click();
  await expect(page.getByRole("heading", { name: "Referral inbox" })).toBeVisible();
  await expect(page.getByLabel("Status: Rejected").first()).toBeVisible();
});

test("flag closes the workflow for a person to handle", async ({ page }) => {
  await signIn(page);
  await page.setInputFiles("#file", pdf("gi-stat.pdf", "flag"));
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByRole("link", { name: "Review Avery Quinn" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("link", { name: "Review Avery Quinn" }).click();
  await page.getByRole("button", { name: "Flag" }).click();
  await page.getByRole("dialog", { name: "Flag referral" }).getByRole("button", { name: "Flag" }).click();
  await expect(page.getByRole("heading", { name: "Referral inbox" })).toBeVisible();
  await expect(page.getByLabel("Status: Flagged").first()).toBeVisible();
});

test("a blank official hospital form fails instead of inventing a patient", async ({ page }) => {
  await signIn(page);
  await page.setInputFiles("#file", path.resolve("fixtures/referrals/source/stanford.pdf"));
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByRole("heading", { name: "stanford.pdf" })).toBeVisible();
  await expect(page.getByText("Could not read this fax").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("MI First Name")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Review stanford.pdf" })).toHaveCount(0);
});

test("an official hospital fax is read", async ({ page }) => {
  await signIn(page);
  await page.setInputFiles("#file", path.resolve("fixtures/referrals/source/wakemed.pdf"));
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByRole("link", { name: "Review Eden Quinn" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Ready for you").first()).toBeVisible();
});

test("an unknown packet fails instead of staying on extracting", async ({ page }) => {
  await signIn(page);
  await page.setInputFiles("#file", {
    name: "random.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n% unknown\n"),
  });
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByRole("heading", { name: "random.pdf" })).toBeVisible();
  await expect(page.getByText("Could not read this fax").first()).toBeVisible({ timeout: 60_000 });
});

test("a new clinic can sign up and open an empty inbox", async ({ page }) => {
  const stamp = Date.now().toString(36);
  await page.goto("/signup");
  await page.getByLabel("Clinic name").fill(`North Clinic ${stamp}`);
  await page.getByLabel("Your name").fill("Riley North");
  await page.getByLabel("Email").fill(`riley.${stamp}@demo.clinic`);
  await page.getByLabel("Password").fill("password-demo-1");
  await page.getByRole("button", { name: "Create clinic" }).click();
  await expect(page.getByRole("heading", { name: "Referral inbox" })).toBeVisible();
  await expect(page.getByText("No faxes yet.")).toBeVisible();
});

test("a no-answer call is tried twice and then answered", async ({ page }) => {
  await signIn(page);
  await page.setInputFiles("#file", path.resolve("fixtures/referrals/gi-noanswer.pdf"));
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByRole("link", { name: "Review Casey Quinn" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("link", { name: "Review Casey Quinn" }).click();
  await page.getByRole("button", { name: "Looks good" }).click();
  await expect(page.locator("p", { hasText: "Status" }).locator("strong")).toHaveText("completed", { timeout: 90_000 });
  await expect(page.getByText("call attempt 1 no answer")).toBeVisible();
  await expect(page.getByText("call attempt 2 answered")).toBeVisible();
});

test("a packet outside the service area is ineligible", async ({ page }) => {
  await signIn(page);
  await page.setInputFiles("#file", path.resolve("fixtures/referrals/gi-outside.pdf"));
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByText("Drew Quinn")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("outside service area").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Review Drew Quinn" })).toHaveCount(0);
});

test("a completed referral can be submitted for prior auth", async ({ page }) => {
  await signIn(page);
  await page.goto("/auth");
  await expect(page.getByRole("heading", { name: "Prior auth" })).toBeVisible();
  await page.getByRole("button", { name: "Draft Avery Quinn" }).click();
  await expect(page.getByLabel("CPT")).toHaveValue("45378");
  await page.getByLabel("CPT").fill("");
  await expect(page.getByText("Missing: CPT")).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit authorization" })).toBeDisabled();
  await page.getByLabel("CPT").fill("45378");
  await page.getByRole("button", { name: "Submit authorization" }).click();
  await expect(page.getByText(/AUTH-/)).toBeVisible({ timeout: 60_000 });
  const payer = await page.request.get("http://127.0.0.1:4011/auths");
  expect(await payer.text()).toContain("45378");
});

test("a visit transcript is drafted and written to the chart", async ({ page }) => {
  await signIn(page);
  await page.goto("/scribe");
  await page.getByLabel("Patient").fill("Avery Quinn");
  await page.getByLabel("Transcript").fill("Bleeding for three days.\nLikely hemorrhoidal source.\nSchedule colonoscopy.");
  await page.getByRole("button", { name: "Draft note" }).click();
  await expect(page.getByText("History and physical for Avery Quinn.")).toBeVisible();
  await page.getByRole("button", { name: "Looks good" }).click();
  await expect(page.getByText("completed")).toBeVisible({ timeout: 60_000 });
  const chart = await page.request.get("http://127.0.0.1:4010/chart");
  expect(await chart.text()).toContain("History and physical for Avery Quinn.");
});

test("the dashboard counts finished work", async ({ page }) => {
  await signIn(page);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.locator(".card", { hasText: "Completed" }).locator("h2")).not.toHaveText("0");
  await expect(page.locator(".card", { hasText: "Authorizations" }).locator("h2")).not.toHaveText("0");
  await expect(page.locator(".card", { hasText: "Calls" }).locator("h2")).not.toHaveText("0");
});

test("editing required documents changes fax-back", async ({ page }) => {
  await signIn(page);
  await page.goto("/rules");
  await expect(page.getByLabel("Required documents")).toHaveValue(/labs/);
  try {
    await page.getByLabel("Required documents").fill("labs, insurance, pathology");
    await page.getByRole("button", { name: "Save rules" }).click();
    await expect(page.getByText("Rules saved", { exact: true })).toBeVisible();
    await page.goto("/inbox");
    await page.setInputFiles("#file", pdf("gi-stat.pdf", "rules"));
    await page.getByRole("button", { name: "Upload" }).click();
    await expect(page.getByText("pathology").first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Send it back").first()).toBeVisible();
  } finally {
    await page.goto("/rules");
    await expect(page.getByLabel("Required documents")).toHaveValue(/labs/);
    await page.getByLabel("Required documents").fill("labs, insurance");
    await page.getByRole("button", { name: "Save rules" }).click();
    await expect(page.getByText("Rules saved", { exact: true })).toBeVisible();
  }
});
