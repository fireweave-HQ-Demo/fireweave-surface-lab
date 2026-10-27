import { rememberClaim } from "./cache";
import { inferConventions } from "./conventions";
import { diffAgainstScanner, promoteSelection } from "./diff";
import { investigateUnit } from "./investigate";
import { inferTopology, type Exclusion } from "./topology";
import type { Convention, Diff, ScannerView } from "./types";
import { verify } from "./verify";

export type PipelineResult = {
  diffs: Diff[];
  conventions: Convention[];
  excluded: Exclusion[];
  /** Shadow does not change the selected set. Promote is computed and ignored unless MODE=promote. */
  mode: "shadow" | "promote";
  promotion: { selected: string[]; review: string[] } | null;
  flips: string[];
  /** Every unit the investigator opened, including ones the diff table omits. */
  investigated: number;
  summary: string;
};

/** Counts include units the table hides once both sides agree they are not surfaces. */
export function investigationSummary(investigated: number, diffs: readonly Diff[]): string {
  let bothSurface = 0;
  let scannerOnly = 0;
  let agentOnly = 0;
  for (const diff of diffs) {
    if (diff.cell === "both_surface") bothSurface += 1;
    else if (diff.cell === "scanner_only") scannerOnly += 1;
    else if (diff.cell === "agent_only") agentOnly += 1;
  }
  const verifiedNonSurface = investigated - bothSurface - scannerOnly - agentOnly;
  return `${investigated} units investigated · ${bothSurface} both_surface · ${scannerOnly} scanner_only · ${agentOnly} agent_only · ${verifiedNonSurface} verified non-surfaces`;
}

/**
 * Level 1, then Level 2, then the verifier, then the diff.
 * Scanner rows are applied only in the diff. They are not passed to investigateUnit.
 */
export async function runSurfacePipeline(
  repoRoot: string,
  scannerRows: readonly ScannerView[],
  opts: { mode?: "shadow" | "promote" } = {}
): Promise<PipelineResult> {
  const topology = await inferTopology(repoRoot);
  const conventions = await inferConventions(repoRoot, topology.units);
  const verified = [];
  const flips: string[] = [];
  for (const unit of topology.units) {
    const claim = await investigateUnit(repoRoot, unit, {
      ...(conventions.flags.has(unit.path) ? { flag: conventions.flags.get(unit.path) } : {}),
      nested: topology.units.some(
        (other) => other.path !== unit.path && (unit.path === "." || other.path.startsWith(`${unit.path}/`))
      ),
      imported: conventions.importedUnits.has(unit.path),
      stayOut: topology.units.map((other) => other.path).filter((path) => path !== unit.path),
    });
    const checked = await verify(repoRoot, claim);
    verified.push(checked);
    if ((await rememberClaim(repoRoot, checked)) === "flip") flips.push(checked.unit);
  }
  const diffs = diffAgainstScanner(scannerRows, verified);
  const mode = opts.mode ?? (process.env.MODE === "promote" ? "promote" : "shadow");
  return {
    diffs,
    conventions: conventions.conventions,
    excluded: topology.excluded,
    mode,
    promotion: mode === "promote" ? promoteSelection(diffs) : null,
    flips,
    investigated: verified.length,
    summary: investigationSummary(verified.length, diffs),
  };
}
