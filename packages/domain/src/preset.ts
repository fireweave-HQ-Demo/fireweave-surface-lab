import type { ClinicRules } from "@clinic/contracts";

export const giPreset: ClinicRules = {
  version: 1,
  triage: {
    stat: ["rectal bleeding", "hematochezia", "gi bleed", "anemia", "iron deficiency"],
    symptomatic: ["chronic diarrhea", "ibs", "abdominal pain"],
    screening: ["routine colonoscopy", "screening colonoscopy", "average risk"],
  },
  requiredDocuments: [{ when: "always", need: ["labs", "insurance"] }],
  exclusions: { colonoscopyWithinDays: 365, outsideServiceArea: true },
  payerRouting: [{ payer: "Cigna PPO", provider: "Dr. Patel", timeOfDay: "morning" }],
  outreach: {
    maxAttempts: 2,
    hoursBetween: 24,
    screener: ["cardiac history", "driver"],
  },
};
