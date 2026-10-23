export function draftVisitNote(input: { patientName: string; transcript: string }): string {
  const lines = input.transcript
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  return [
    `History and physical for ${input.patientName}.`,
    `HPI: ${lines[0] ?? "No history recorded."}`,
    `Assessment: ${lines[1] ?? lines[0] ?? "Not recorded."}`,
    `Plan: ${lines[2] ?? "Review with the attending before the chart is updated."}`,
  ].join("\n");
}
