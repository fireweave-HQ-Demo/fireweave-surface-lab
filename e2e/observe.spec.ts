import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { plantSpan, waitForTrace } from "./observe";

const email = "staff@demo.clinic";
const password = "password-demo-1";

test("a referral write is visible in OpenObserve and a planted SSN is not", async ({ page }) => {
  const stamp = `e2e-${Date.now().toString(36)}`;
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Referral inbox" })).toBeVisible();

  const uploaded = page.waitForResponse(
    (response) => response.url().includes("/api/referrals") && response.request().method() === "POST",
  );
  await page.setInputFiles("#file", {
    name: "gi-stat.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.concat([readFileSync(path.resolve("fixtures/referrals/gi-stat.pdf")), Buffer.from(stamp)]),
  });
  await page.getByRole("button", { name: "Upload" }).click();
  const body = (await (await uploaded).json()) as { referralId?: string };
  expect(body.referralId).toBeTruthy();

  const hits = await waitForTrace(
    (hit) => JSON.stringify(hit).includes(body.referralId ?? "missing"),
    `SELECT * FROM clinic WHERE referral_id = '${body.referralId}'`,
  );
  expect(JSON.stringify(hits)).toContain("clinic-api");

  await plantSpan("clinic.redaction", {
    clinic_id: stamp,
    ssn: "123-45-6789",
    patient_name: "Avery Quinn",
  });
  const redacted = await waitForTrace(
    (hit) => JSON.stringify(hit).includes(stamp) || JSON.stringify(hit).includes("clinic.redaction"),
    `SELECT * FROM clinic WHERE clinic_id = '${stamp}'`,
  );
  const dumped = JSON.stringify(redacted);
  expect(dumped).not.toContain("123-45-6789");
  expect(dumped).not.toContain("Avery Quinn");
});
