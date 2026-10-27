import { readFile } from "node:fs/promises";

export type Idiom = {
  grep: RegExp;
  construct: string;
  evidence_kind?: "framework_ctor" | "main_guard" | "container_cmd" | "implicit_construct";
};

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

export type Hit = {
  line: number;
  snippet: string;
  construct: string;
  evidence_kind: NonNullable<Idiom["evidence_kind"]>;
};

function isComment(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*") || trimmed.startsWith("#");
}

/** Every matching line, strongest construct first, then earliest line. Comments are not matches. */
export function citeAll(text: string, idioms: readonly Idiom[]): Hit[] {
  const lines = text.split(/\r?\n/);
  const hits: Hit[] = [];
  let block = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (block) {
      if (line.includes("*/")) block = false;
      continue;
    }
    if (line.includes("/*") && !line.includes("*/")) {
      block = true;
      continue;
    }
    if (isComment(line)) continue;
    for (const idiom of idioms) {
      idiom.grep.lastIndex = 0;
      if (!idiom.grep.test(line)) continue;
      hits.push({
        line: i + 1,
        snippet: line.trim().slice(0, 180),
        construct: idiom.construct,
        evidence_kind: idiom.evidence_kind ?? "implicit_construct",
      });
    }
  }
  return hits.sort(
    (a, b) => (RANK[b.construct] ?? 0) - (RANK[a.construct] ?? 0) || a.line - b.line
  );
}

/** Earliest line of the strongest construct. Line numbers are 1-based. */
export function cite(text: string, idioms: readonly Idiom[]): Hit | null {
  return citeAll(text, idioms)[0] ?? null;
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
