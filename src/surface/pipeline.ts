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
};

/**
 * Level 1, then Level 2, then the verifier, then the diff.
 * Scanner rows are applied only in the diff. They are not passed to investigateUnit.
 */
export async function runSurfacePipeline(
  repoRoot: string,
  scannerRows: readonly ScannerView[]
): Promise<PipelineResult> {
  const topology = await inferTopology(repoRoot);
  const conventions = await inferConventions(repoRoot, topology.units);
  const verified = [];
  for (const unit of topology.units) {
    const claim = await investigateUnit(repoRoot, unit, {
      ...(conventions.flags.has(unit.path) ? { flag: conventions.flags.get(unit.path) } : {}),
      nested: topology.units.some(
        (other) => other.path !== unit.path && (unit.path === "." || other.path.startsWith(`${unit.path}/`))
      ),
      imported: conventions.importedUnits.has(unit.path),
      stayOut: topology.units.map((other) => other.path).filter((path) => path !== unit.path),
    });
    verified.push(await verify(repoRoot, claim));
  }
  const diffs = diffAgainstScanner(scannerRows, verified);
  const mode = process.env.MODE === "promote" ? "promote" : "shadow";
  return {
    diffs,
    conventions: conventions.conventions,
    excluded: topology.excluded,
    mode,
    promotion: mode === "promote" ? promoteSelection(diffs) : null,
  };
}
