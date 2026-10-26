/**
 * The Confirm-page merge: scanner rows stay, and the agent's purpose is added
 * when it names the same path. Confidence is the same rule as
 * `finding-confidence.ts` in fw-server.
 */
export type Level = 'high' | 'medium' | 'low';

export interface ScannerRow {
  readonly path: string;
  readonly surface: string | null;
  readonly kind: string;
  readonly verdict: string;
  readonly entrypoint?: string;
}

export interface AgentQuote {
  readonly file: string;
  readonly line: number;
  readonly snippet: string;
  readonly verified: boolean;
}

export interface AgentApp {
  readonly path: string;
  readonly kind: string;
  readonly purpose: string;
  readonly reasoning: string;
  readonly selfRated: Level;
  readonly evidence: readonly AgentQuote[];
}

export interface ConfirmRow {
  readonly path: string;
  readonly stack: string;
  readonly confidence: Level;
  readonly purpose: string | null;
  readonly reasoning: string | null;
  readonly source: 'scanner' | 'agent' | 'both';
}

export function findingConfidence(i: {
  readonly scanner: boolean;
  readonly quotes: readonly { readonly verified: boolean }[] | null;
  readonly selfRated: Level | null;
}): Level | null {
  const scannerOnly: Level | null = i.scanner ? 'medium' : null;
  const quotes = i.quotes;
  if (!quotes || quotes.length === 0) return scannerOnly;
  const ok = quotes.filter((q) => q.verified).length;
  if (ok === 0) return scannerOnly;
  const level: Level = ok < quotes.length ? 'low' : i.scanner ? 'high' : 'medium';
  return i.selfRated === 'low' ? 'low' : level;
}

const normalise = (p: string) => p.replace(/^\.\//, '').replace(/\/+$/, '') || '.';

export function mergeRows(
  scanner: readonly ScannerRow[],
  agent: readonly AgentApp[] | null
): ConfirmRow[] {
  const byPath = new Map((agent ?? []).map((a) => [normalise(a.path), a]));
  const seen = new Set<string>();
  const rows: ConfirmRow[] = [];

  for (const s of scanner) {
    const path = normalise(s.path);
    seen.add(path);
    const ai = byPath.get(path) ?? null;
    const confidence = findingConfidence({
      scanner: true,
      quotes: ai?.evidence ?? null,
      selfRated: ai?.selfRated ?? null,
    });
    if (!confidence) continue;
    const backed = ai?.evidence.some((q) => q.verified) ?? false;
    rows.push({
      path,
      stack: s.surface ?? s.kind,
      confidence,
      purpose: backed ? ai!.purpose : null,
      reasoning: backed ? ai!.reasoning : null,
      source: ai && backed ? 'both' : 'scanner',
    });
  }

  for (const ai of agent ?? []) {
    const path = normalise(ai.path);
    if (seen.has(path)) continue;
    const confidence = findingConfidence({
      scanner: false,
      quotes: ai.evidence,
      selfRated: ai.selfRated,
    });
    if (!confidence) continue;
    rows.push({
      path,
      stack: ai.kind,
      confidence,
      purpose: ai.purpose,
      reasoning: ai.reasoning,
      source: 'agent',
    });
  }
  return rows;
}
