import { readFile } from "node:fs/promises";

export type Idiom = { grep: RegExp; construct: string };

/** Higher wins when a file matches more than one construct. Language-agnostic labels. */
const RANK: Record<string, number> = {
  listener: 70,
  route_handler: 60,
  container: 50,
  event_loop: 40,
  site_config: 30,
  document: 20,
  cli: 15,
  main_guard: 10,
};

export async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

export type Hit = { line: number; snippet: string; construct: string };

/** Earliest line of the strongest construct. Line numbers are 1-based. */
export function cite(text: string, idioms: readonly Idiom[]): Hit | null {
  const lines = text.split(/\r?\n/);
  let best: Hit | null = null;
  let bestRank = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    for (const idiom of idioms) {
      idiom.grep.lastIndex = 0;
      if (!idiom.grep.test(line)) continue;
      const rank = RANK[idiom.construct] ?? 0;
      if (rank > bestRank) {
        bestRank = rank;
        best = { line: i + 1, snippet: line.trim().slice(0, 180), construct: idiom.construct };
      }
    }
  }
  return best;
}

export function matchesNear(text: string, line: number, idioms: readonly Idiom[]): boolean {
  const lines = text.split(/\r?\n/);
  const from = Math.max(0, line - 1 - 2);
  const to = Math.min(lines.length, line - 1 + 2);
  for (let i = from; i <= to; i++) {
    const source = lines[i] ?? "";
    for (const idiom of idioms) {
      idiom.grep.lastIndex = 0;
      if (idiom.grep.test(source)) return true;
    }
  }
  return false;
}
