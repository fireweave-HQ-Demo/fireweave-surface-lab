import { join } from "node:path";
import type { Unit } from "../types";
import { repoRelative, unitDir, type Extractor, type ManifestFacts, type Resolution } from "./contract";
import { readText, type Idiom } from "./scan";

const IDIOMS: Idiom[] = [
  { grep: /^CMD\b/, construct: "container", evidence_kind: "container_cmd" },
  { grep: /^ENTRYPOINT\b/, construct: "container", evidence_kind: "container_cmd" },
  { grep: /^EXPOSE\b/, construct: "container", evidence_kind: "container_cmd" },
];

function sourceToken(command: string): string | null {
  const json = /\[([^\]]*)\]/.exec(command);
  const tokens = json
    ? [...json[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]!)
    : command.split(/\s+/);
  return tokens.find((token) => /\.(py|ts|tsx|js|mjs|cjs|go|rs)$/.test(token))?.replace(/^\.\//, "") ?? null;
}

export function dockerExtractor(repoRoot: string): Extractor {
  return {
    ecosystem: "docker",
    exclusions: () => [],
    executionIdioms: () => IDIOMS,
    async readManifest(unit: Unit): Promise<ManifestFacts> {
      const text = await readText(join(unitDir(repoRoot, unit), "Dockerfile"));
      if (!text) return { scripts: [], bins: [], deps: {} };
      const scripts = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => /^CMD\b/.test(line) || /^ENTRYPOINT\b/.test(line))
        .map((line) => `${line.split(/\s+/)[0]}: ${line}`);
      return { scripts, bins: [], deps: {} };
    },
    async resolveDeclaration(unit: Unit, decl: string): Promise<Resolution> {
      const command = decl.includes(": ") ? decl.split(": ").slice(1).join(": ") : decl;
      const relative = sourceToken(command);
      if (!relative) return { unresolved: "container command names no source file" };
      const abs = join(unitDir(repoRoot, unit), relative);
      if ((await readText(abs)) === null) return { unresolved: `missing ${relative}` };
      return { file: repoRelative(repoRoot, abs) };
    },
  };
}
