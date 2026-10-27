import { join } from "node:path";
import type { Unit } from "../types";
import { repoRelative, unitDir, type Extractor, type ManifestFacts, type Resolution } from "./contract";
import { cite, readText, type Idiom } from "./scan";

const IDIOMS: Idiom[] = [
  { grep: /\bhttp\.ListenAndServe\s*\(/, construct: "listener" },
  { grep: /\bnet\.Listen\s*\(/, construct: "listener" },
  { grep: /\.Run\s*\(/, construct: "listener" },
  { grep: /\.Start\s*\(/, construct: "listener" },
  { grep: /\.Listen\s*\(/, construct: "listener" },
  { grep: /\bfunc\s+main\s*\(/, construct: "main_guard", evidence_kind: "main_guard" },
];

function fileToken(decl: string): string | null {
  const command = decl.includes(": ") ? decl.split(": ").slice(1).join(": ") : decl;
  const token = command.split(/\s+/).find((part) => part.endsWith(".go"));
  return token?.replace(/^\.\//, "") ?? null;
}

export function goExtractor(repoRoot: string): Extractor {
  return {
    ecosystem: "go",
    exclusions: () => [/(?:^|\/)vendor(?:\/|$)/],
    executionIdioms: () => IDIOMS,
    async readManifest(unit: Unit): Promise<ManifestFacts> {
      const text = await readText(join(unitDir(repoRoot, unit), "go.mod"));
      if (!text) return { scripts: [], bins: [], deps: {} };
      const deps: Record<string, string> = {};
      for (const match of text.matchAll(/^\s*([A-Za-z0-9_./-]+)\s+v[0-9][^\s]*/gm)) {
        const name = match[1];
        if (name && name !== "module" && name !== "go") deps[name] = match[0].trim();
      }
      return { scripts: [], bins: [], deps };
    },
    async resolveDeclaration(unit: Unit, decl: string): Promise<Resolution> {
      const relative = fileToken(decl);
      if (!relative) return { unresolved: "declaration names no go file" };
      const abs = join(unitDir(repoRoot, unit), relative);
      const text = await readText(abs);
      if (text === null) return { unresolved: `missing ${relative}` };
      const hit = cite(text, IDIOMS, repoRelative(repoRoot, abs));
      if (!hit) return { unresolved: `${relative} has no execution construct` };
      return { file: repoRelative(repoRoot, abs), line: hit.line };
    },
  };
}
