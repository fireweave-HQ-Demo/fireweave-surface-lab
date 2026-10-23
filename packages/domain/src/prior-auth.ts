export function missingAuthFields(draft: { cpt: string; diagnosis: string; serviceDate: string }): string[] {
  const missing: string[] = [];
  if (!draft.cpt.trim()) missing.push("CPT");
  if (!draft.diagnosis.trim()) missing.push("diagnosis");
  if (!draft.serviceDate.trim()) missing.push("service date");
  return missing;
}

export function necessityNote(input: { patientName: string; reason: string; diagnosis: string; cpt: string }): string {
  const procedure = input.cpt.trim() || "the requested service";
  const diagnosis = input.diagnosis.trim() || "a diagnosis that is not set yet";
  return `${input.patientName} requires ${procedure} for ${input.reason}. Diagnosis ${diagnosis}. Staff approve this draft before it is submitted to the payer.`;
}
