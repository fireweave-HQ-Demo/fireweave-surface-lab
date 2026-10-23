import type { ClinicRules, Disposition, Packet } from "@clinic/contracts";

function includesAny(haystack: string, needles: string[]): boolean {
  const text = haystack.toLowerCase();
  return needles.some((needle) => text.includes(needle.toLowerCase()));
}

function daysSince(iso: string, now: Date): number | null {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  return (now.getTime() - then) / 86_400_000;
}

export function planVisit(packet: Packet, rules: ClinicRules): { provider: string; timeOfDay: "morning" | "end_of_day" } | null {
  const route = rules.payerRouting.find((item) => item.payer.toLowerCase() === packet.payer.toLowerCase());
  if (!route) return null;
  return { provider: route.provider, timeOfDay: route.timeOfDay ?? "morning" };
}

export function evaluate(packet: Packet, rules: ClinicRules, now = new Date()): Disposition {
  const have = new Set(packet.sections.map((section) => section.kind));
  const missing: string[] = [];
  for (const requirement of rules.requiredDocuments) {
    const applies = requirement.when === "always" || packet.reason.toLowerCase().includes(requirement.when.toLowerCase());
    if (!applies) continue;
    for (const need of requirement.need) {
      if (!have.has(need)) missing.push(need);
    }
  }
  const base = { missing, confidence: packet.confidence, category: null as Disposition["category"] };
  if (missing.length > 0) {
    return { ...base, kind: "fax_back", detail: `missing ${missing.join(", ")}` };
  }

  if (rules.exclusions.outsideServiceArea && packet.serviceArea === "out") {
    return { ...base, kind: "ineligible", detail: "outside service area" };
  }

  const window = rules.exclusions.colonoscopyWithinDays;
  if (window && packet.lastColonoscopy && packet.lastColonoscopy !== "none") {
    const age = daysSince(packet.lastColonoscopy, now);
    if (age === null) return { ...base, kind: "needs_human", detail: "colonoscopy date is unclear" };
    if (age >= 0 && age < window) return { ...base, kind: "ineligible", detail: "colonoscopy within the exclusion window" };
  }

  let category: Disposition["category"] = null;
  if (includesAny(packet.reason, rules.triage.stat)) category = "STAT";
  else if (includesAny(packet.reason, rules.triage.symptomatic)) category = "symptomatic";
  else if (includesAny(packet.reason, rules.triage.screening)) category = "screening";

  if (!category) return { ...base, kind: "needs_human", detail: "reason is not in the clinic rules" };
  if (!planVisit(packet, rules)) return { ...base, kind: "needs_human", category, detail: "no payer route" };
  return { ...base, kind: "ready", category, detail: "" };
}
