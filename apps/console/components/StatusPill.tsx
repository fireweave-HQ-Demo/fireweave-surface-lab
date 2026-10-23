import { statusMeta } from "../lib/status";

export function StatusPill({ status }: { status: string }) {
  const meta = statusMeta(status);
  return (
    <span className={`status-pill ${meta.tone}`} aria-label={`Status: ${meta.label}`}>
      <i aria-hidden="true" />
      {meta.label}
    </span>
  );
}
