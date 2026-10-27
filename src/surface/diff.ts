import type { Diff, ScannerView, VerifiedClaim } from "./types";

const normalise = (path: string) => path.replace(/^\.\//, "").replace(/\/+$/, "") || ".";

function decide(selected: boolean, agent: VerifiedClaim): Pick<Diff, "cell" | "action"> {
  if (!agent.verified || agent.claim === "uncertain" || agent.downgraded_to === "uncertain") {
    return { cell: selected ? "scanner_only" : "agent_only", action: "review" };
  }
  const runs = agent.claim === "runs";
  if (selected && runs) return { cell: "both_surface", action: "selected" };
  if (selected && !runs) return { cell: "scanner_only", action: "dropped" };
  if (!selected && runs) return { cell: "agent_only", action: "review" };
  return { cell: "both_drop", action: "dropped" };
}

/** Shadow comparison. The investigator's claim is already verified and was built without these rows. */
export function diffAgainstScanner(scanner: readonly ScannerView[], verified: readonly VerifiedClaim[]): Diff[] {
  const byPath = new Map(verified.map((claim) => [normalise(claim.unit), claim]));
  const seen = new Set<string>();
  const diffs: Diff[] = [];
  for (const row of scanner) {
    const path = normalise(row.path);
    seen.add(path);
    const agent = byPath.get(path);
    if (!agent) continue;
    diffs.push({
      unit: path,
      scanner: { verdict: row.verdict, kind: row.kind, selected: row.selected },
      agent,
      ...decide(row.selected, agent),
    });
  }
  for (const claim of verified) {
    const path = normalise(claim.unit);
    if (seen.has(path)) continue;
    if (claim.claim !== "runs" && claim.verified) continue;
    diffs.push({
      unit: path,
      scanner: { verdict: "", kind: "", selected: false },
      agent: claim,
      ...decide(false, claim),
    });
  }
  return diffs;
}

/** What `MODE=promote` would keep. An agent-only unit is review, never a silent selection. */
export function promoteSelection(diffs: readonly Diff[]): { selected: string[]; review: string[] } {
  return {
    selected: diffs.filter((diff) => diff.action === "selected").map((diff) => diff.unit),
    review: diffs.filter((diff) => diff.action === "review").map((diff) => diff.unit),
  };
}
