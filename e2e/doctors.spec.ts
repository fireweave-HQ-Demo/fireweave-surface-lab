import { expect, test } from "@playwright/test";

test("a clinic can add doctors and route unmatched payers to the first one", async ({ page }) => {
  const stamp = Date.now().toString(36);
  const ownerEmail = `owner.${stamp}@demo.clinic`;
  const doctorName = `Dr. Lee ${stamp}`;
  const doctorEmail = `lee.${stamp}@demo.clinic`;
  const secondName = `Dr. Ng ${stamp}`;
  const secondEmail = `ng.${stamp}@demo.clinic`;
  const staffEmail = `staff.${stamp}@demo.clinic`;
  const password = "password-demo-1";

  await page.goto("/signup");
  await page.getByLabel("Clinic name").fill(`East Clinic ${stamp}`);
  await page.getByLabel("Your name").fill("Riley East");
  await page.getByLabel("Email").fill(ownerEmail);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create clinic" }).click();
  await expect(page.getByRole("heading", { name: "Referral inbox" })).toBeVisible();

  const before = (await (await page.request.get("/api/rules")).json()) as {
    payerRouting?: Array<{ payer: string; provider: string }>;
  };
  expect(before.payerRouting).toEqual([expect.objectContaining({ payer: "Cigna PPO", provider: "Dr. Patel" })]);

  await page.goto("/settings");
  await page.getByRole("button", { name: "Users" }).click();
  await addPerson(page, { name: doctorName, email: doctorEmail, password, role: "Doctor" });
  await expect(page.getByText("Doctor added. They can sign in with that email.")).toBeVisible();
  await expect(page.getByRole("cell", { name: doctorName })).toBeVisible();
  await expect(page.getByRole("cell", { name: doctorEmail })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Doctor" })).toBeVisible();

  const afterFirst = (await (await page.request.get("/api/rules")).json()) as {
    payerRouting?: Array<{ payer: string; provider: string }>;
  };
  expect(afterFirst.payerRouting).toEqual([
    expect.objectContaining({ payer: "Cigna PPO", provider: "Dr. Patel" }),
    expect.objectContaining({ payer: "default", provider: doctorName }),
  ]);

  await addPerson(page, { name: secondName, email: secondEmail, password, role: "Doctor" });
  await expect(page.getByRole("cell", { name: secondName })).toBeVisible();
  const afterSecond = (await (await page.request.get("/api/rules")).json()) as {
    payerRouting?: Array<{ payer: string; provider: string }>;
  };
  expect(afterSecond.payerRouting).toEqual(afterFirst.payerRouting);

  await addPerson(page, { name: `Alex ${stamp}`, email: staffEmail, password, role: "Staff" });
  await expect(page.getByRole("cell", { name: staffEmail })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Staff" }).first()).toBeVisible();

  await page.getByRole("button", { name: "Add doctor" }).click();
  const drawer = page.getByRole("dialog", { name: "Add doctor" });
  await drawer.getByLabel("Name").fill(doctorName);
  await drawer.getByLabel("Email").fill(doctorEmail);
  await drawer.getByLabel("Password").fill(password);
  await drawer.getByRole("button", { name: "Add doctor" }).click();
  await expect(page.getByText("That email is already in use.")).toBeVisible();
  await expect(page.getByText("E-450")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/rules");
  await page.getByRole("button", { name: "Payer routing" }).click();
  await expect(page.getByLabel("Payer 1")).toHaveValue("Cigna PPO");
  await expect(page.getByLabel("Provider 1")).toHaveValue("Dr. Patel");
  await expect(page.getByLabel("Payer 2")).toHaveValue("default");
  await expect(page.getByLabel("Provider 2")).toHaveValue(doctorName);
  await page.getByLabel("Payer", { exact: true }).fill("Aetna");
  await page.getByLabel("Provider", { exact: true }).fill(secondName);
  await page.getByRole("button", { name: "Add route" }).click();
  await page.getByRole("button", { name: "Save rules" }).click();
  await expect(page.getByText("Rules saved", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Payer routing" }).click();
  await expect(page.getByLabel("Payer 3")).toHaveValue("Aetna");
  await expect(page.getByLabel("Provider 3")).toHaveValue(secondName);

  await page.goto("/schedule");
  await expect(page.locator('select[aria-label="Provider"] option[value="' + doctorName + '"]')).toBeAttached();
  await expect(page.locator('select[aria-label="Provider"] option[value="' + secondName + '"]')).toBeAttached();

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByLabel("Email").fill(doctorEmail);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Referral inbox" })).toBeVisible();
  const me = (await (await page.request.get("/api/me")).json()) as { role?: string };
  expect(me.role).toBe("doctor");
});

async function addPerson(
  page: import("@playwright/test").Page,
  input: { name: string; email: string; password: string; role: "Doctor" | "Staff" },
) {
  await page.getByRole("button", { name: "Add doctor" }).click();
  const drawer = page.getByRole("dialog", { name: "Add doctor" });
  await drawer.getByLabel("Name").fill(input.name);
  await drawer.getByLabel("Email").fill(input.email);
  await drawer.getByLabel("Password").fill(input.password);
  await drawer.getByLabel("Role").selectOption(input.role === "Staff" ? "staff" : "doctor");
  await drawer.getByRole("button", { name: "Add doctor" }).click();
  await expect(drawer).toHaveCount(0);
}
