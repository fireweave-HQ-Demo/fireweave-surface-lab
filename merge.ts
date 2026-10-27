/**
 * Purpose is attached only for rows the filter already selected.
 * Confidence comes from the scanner verdict, not from a copied quote.
 */
export type Level = 'high' | 'medium' | 'low';

export interface ScannerRow {
  readonly path: string;
  readonly surface: string | null;
  readonly kind: string;
  readonly verdict: string;
  readonly entrypoint?: string;
  /** Start file the filter used. Absent when the verdict alone selected the row. */
  readonly entrypointSource?: string;
}

export interface AgentApp {
  readonly path: string;
  readonly kind: string;
  readonly purpose: string;
  readonly reasoning: string;
}

export interface ConfirmRow {
  readonly path: string;
  readonly stack: string;
  readonly confidence: Level;
  /** The rule that selected this row. A copied line never raises this. */
  readonly evidence: string;
  readonly purpose: string | null;
  readonly reasoning: string | null;
  readonly source: 'scanner' | 'both';
}

/** Why a selected row has the confidence it has. Filter evidence does not promote a verdict. */
export function selectionEvidence(row: {
  readonly verdict: string;
  readonly entrypointSource?: string;
}): string {
  if (row.verdict === 'confirmed') return 'confirmed';
  if (row.entrypointSource) return `${row.verdict} + entrypoint(${row.entrypointSource})`;
  return row.verdict;
}

const normalise = (p: string) => p.replace(/^\.\//, '').replace(/\/+$/, '') || '.';

export function mergeRows(
  scanner: readonly ScannerRow[],
  agent: readonly AgentApp[] | null,
  selected: ReadonlySet<string>
): ConfirmRow[] {
  const byPath = new Map((agent ?? []).map((a) => [normalise(a.path), a]));
  const rows: ConfirmRow[] = [];
  for (const s of scanner) {
    const path = normalise(s.path);
    if (!selected.has(path)) continue;
    const ai = byPath.get(path) ?? null;
    const purpose = ai?.purpose ?? null;
    rows.push({
      path,
      stack: s.surface ?? s.kind,
      confidence: s.verdict === 'confirmed' ? 'high' : 'medium',
      evidence: selectionEvidence(s),
      purpose,
      reasoning: purpose ? ai!.reasoning : null,
      // `both` means this scanner row also got an agent purpose. No purpose
      // (agent skipped, failed, or omitted the path) stays `scanner`.
      source: purpose ? 'both' : 'scanner',
    });
  }
  return rows;
}

/** Purposes the agent wrote for paths the filter did not keep. */
export function strayAgentPurposes(
  agent: readonly AgentApp[] | null,
  selected: ReadonlySet<string>
): { path: string; purpose: string }[] {
  const out: { path: string; purpose: string }[] = [];
  for (const app of agent ?? []) {
    const path = normalise(app.path);
    if (!selected.has(path)) out.push({ path, purpose: app.purpose });
  }
  return out;
}
