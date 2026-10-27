import { readFile } from "node:fs/promises";
import { codeLines } from "../lex";

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

function inCode(code: string, start: number, length: number): boolean {
  const slice = code.slice(start, start + length);
  return [...slice].some((char) => char !== " " && char !== "\t");
}

/** Every matching line, strongest construct first, then earliest line. Comments and strings are not matches. */
export function citeAll(text: string, idioms: readonly Idiom[], file = ""): Hit[] {
  const lines = text.split(/\r?\n/);
  const codes = codeLines(text, file);
  const hits: Hit[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const code = codes[i] ?? "";
    for (const idiom of idioms) {
      const flags = idiom.grep.flags.includes("g") ? idiom.grep.flags : `${idiom.grep.flags}g`;
      const pattern = new RegExp(idiom.grep.source, flags);
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(line))) {
        if (!inCode(code, match.index, match[0].length)) continue;
        hits.push({
          line: i + 1,
          snippet: line.trim().slice(0, 180),
          construct: idiom.construct,
          evidence_kind: idiom.evidence_kind ?? "implicit_construct",
        });
        break;
      }
    }
  }
  return hits.sort(
    (a, b) => (RANK[b.construct] ?? 0) - (RANK[a.construct] ?? 0) || a.line - b.line
  );
}

/** Earliest line of the strongest construct. Line numbers are 1-based. */
export function cite(text: string, idioms: readonly Idiom[], file = ""): Hit | null {
  return citeAll(text, idioms, file)[0] ?? null;
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
