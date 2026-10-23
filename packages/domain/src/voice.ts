import type { ClinicRules } from "@clinic/contracts";

export const DISCLOSURE = "This call is automated and recorded.";

export function voiceScript(rules: ClinicRules): { disclosure: string; questions: string[] } {
  return { disclosure: DISCLOSURE, questions: rules.outreach.screener };
}
