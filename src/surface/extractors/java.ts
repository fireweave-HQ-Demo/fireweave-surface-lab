import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Unit } from "../types";
import { repoRelative, unitDir, type Extractor, type ManifestFacts, type Resolution } from "./contract";
import { cite, readText, type Idiom } from "./scan";

const IDIOMS: Idiom[] = [
  { grep: /\bSpringApplication\.run\s*\(/, construct: "listener" },
  { grep: /\bport\s*\(\s*\d+/, construct: "listener" },
  { grep: /\bstatic\s+void\s+main\s*\(/, construct: "main_guard", evidence_kind: "main_guard" },
];

const SKIP = new Set(["target", "build", ".git", ".gradle"]);

function fileToken(decl: string): string | null {
  const command = decl.includes(": ") ? decl.split(": ").slice(1).join(": ") : decl;
  const token = command.split(/\s+/).find((part) => part.endsWith(".java"));
  return token?.replace(/^\.\//, "") ?? null;
}

async function javaFiles(dir: string, rel: string, depth: number, out: string[]): Promise<void> {
  if (depth > 12) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (SKIP.has(entry.name) || entry.name === "test") continue;
      await javaFiles(join(dir, entry.name), path, depth + 1, out);
      continue;
    }
    if (!entry.name.endsWith(".java") || entry.name.endsWith("Test.java")) continue;
    if (path.includes("/src/test/")) continue;
    out.push(path);
  }
}

export function javaExtractor(repoRoot: string): Extractor {
  return {
    ecosystem: "java",
    exclusions: () => [/(?:^|\/)target(?:\/|$)/, /(?:^|\/)src\/test(?:\/|$)/],
    executionIdioms: () => IDIOMS,
    async readManifest(unit: Unit): Promise<ManifestFacts> {
      const root = unitDir(repoRoot, unit);
      const files: string[] = [];
      await javaFiles(root, "", 0, files);
      const scripts: string[] = [];
      for (const file of files) {
        const text = await readText(join(root, file));
        if (!text) continue;
        if (!IDIOMS.some((idiom) => idiom.grep.test(text))) continue;
        scripts.push(`main: ${file}`);
      }
      return { scripts, bins: [], deps: {} };
    },
    async resolveDeclaration(unit: Unit, decl: string): Promise<Resolution> {
      const relative = fileToken(decl);
      if (!relative) return { unresolved: "declaration names no java file" };
      const abs = join(unitDir(repoRoot, unit), relative);
      const text = await readText(abs);
      if (text === null) return { unresolved: `missing ${relative}` };
      const hit = cite(text, IDIOMS, repoRelative(repoRoot, abs));
      if (!hit) return { unresolved: `${relative} has no execution construct` };
      return { file: repoRelative(repoRoot, abs), line: hit.line };
    },
  };
}
