export const STATUS_META = {
  extracting: { label: "Reading fax", tone: "neutral" },
  awaiting_review: { label: "Ready for you", tone: "ok" },
  ready: { label: "Ready for you", tone: "ok" },
  fax_back: { label: "Sent back", tone: "warn" },
  needs_human: { label: "Needs a person", tone: "neutral" },
  ineligible: { label: "Ineligible", tone: "muted" },
  failed: { label: "Could not read", tone: "error" },
  writing: { label: "Writing chart", tone: "info" },
  complete: { label: "Complete", tone: "ok" },
  completed: { label: "Complete", tone: "ok" },
  flagged: { label: "Flagged", tone: "warn" },
  rejected: { label: "Rejected", tone: "muted" },
  paused: { label: "Paused", tone: "warn" },
  submitted: { label: "Submitted", tone: "info" },
  approved: { label: "Approved", tone: "ok" },
  denied: { label: "Denied", tone: "error" },
  drafted: { label: "Drafted", tone: "neutral" },
  written: { label: "Written", tone: "ok" },
} as const;

export type Status = keyof typeof STATUS_META;
export type StatusTone = (typeof STATUS_META)[Status]["tone"];

export function statusMeta(status: string) {
  if (status in STATUS_META) return STATUS_META[status as Status];
  return { label: status.replaceAll("_", " "), tone: "neutral" as const };
}
