export function TriagePill({ triage }: { triage: string | null }) {
  if (!triage) return <span className="muted">—</span>;
  const tone = triage === "STAT" ? "stat" : triage === "screening" ? "wait" : "back";
  return <span className={`pill ${tone}`}>{triage}</span>;
}
