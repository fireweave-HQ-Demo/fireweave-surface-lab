import { join } from "node:path";
import type { Unit } from "../types";
import { repoRelative, unitDir, type Extractor, type ManifestFacts, type Resolution } from "./contract";
import { cite, readText, type Idiom } from "./scan";

const IDIOMS: Idiom[] = [
  { grep: /\bconst\s+nextConfig\b/, construct: "site_config" },
  { grep: /\bexport\s+default\s+nextConfig\b/, construct: "site_config" },
  { grep: /<html(?:\s|>)/i, construct: "document" },
  { grep: /<main(?:\s|>)/i, construct: "document" },
  { grep: /\bexport\s+default\s+function\s+Page\b/, construct: "document" },
];

function fileToken(script: string): string | null {
  for (const token of script.split(/\s+/)) {
    const clean = token.replace(/^['"]|['"]$/g, "").replace(/^\.\//, "");
    if (/\.(html|css)$/.test(clean) || /next\.config\.(ts|js|mjs|cjs)$/.test(clean)) return clean;
  }
  return null;
}

export function staticExtractor(repoRoot: string): Extractor {
  return {
    ecosystem: "static",
    exclusions: () => [/(?:^|\/)dist(?:\/|$)/, /\.min\.js$/],
    executionIdioms: () => IDIOMS,
    async readManifest(_unit: Unit): Promise<ManifestFacts> {
      return { scripts: [], bins: [], deps: {} };
    },
    async resolveDeclaration(unit: Unit, decl: string): Promise<Resolution> {
      const command = decl.includes(": ") ? decl.split(": ").slice(1).join(": ") : decl;
      const token = fileToken(command) ?? (command.trim() === "index.html" ? "index.html" : null);
      if (!token) return { unresolved: "declaration names no document" };
      const abs = join(unitDir(repoRoot, unit), token);
      const text = await readText(abs);
      if (text === null) return { unresolved: `missing ${token}` };
      const hit = cite(text, IDIOMS);
      if (!hit) return { unresolved: `${token} is not a document tree` };
      return { file: repoRelative(repoRoot, abs), line: hit.line };
    },
  };
}
