import type { Unit } from "../types";
import { dockerExtractor } from "./docker";
import { goExtractor } from "./go";
import { nodeExtractor } from "./node";
import { pythonExtractor } from "./python";
import { rustExtractor } from "./rust";
import { staticExtractor } from "./static";

export type { Extractor, ManifestFacts, Resolution } from "./contract";
export { repoRelative, unitDir } from "./contract";
import type { Extractor } from "./contract";

export type ExtractorFactory = (repoRoot: string) => Extractor;

const FACTORIES: Record<string, ExtractorFactory> = {
  node: nodeExtractor,
  python: pythonExtractor,
  docker: dockerExtractor,
  static: staticExtractor,
  go: goExtractor,
  rust: rustExtractor,
};

const MANIFEST_ECOSYSTEM: Record<string, string> = {
  "package.json": "node",
  "pyproject.toml": "python",
  Dockerfile: "docker",
  Procfile: "docker",
  "go.mod": "go",
  "Cargo.toml": "rust",
  "index.html": "static",
};

const FILE_ECOSYSTEM: [RegExp, string][] = [
  [/\.(ts|tsx|js|mjs|cjs)$/, "node"],
  [/\.py$/, "python"],
  [/\.go$/, "go"],
  [/\.rs$/, "rust"],
  [/\.html$/, "static"],
  [/next\.config\.(?:ts|js|mjs|cjs)$/, "static"],
];

export function ecosystemForManifest(name: string): string | null {
  return MANIFEST_ECOSYSTEM[name] ?? null;
}

export function ecosystemsForFiles(files: readonly string[]): string[] {
  const found = new Set<string>();
  for (const file of files) {
    for (const [pattern, ecosystem] of FILE_ECOSYSTEM) {
      if (pattern.test(file)) found.add(ecosystem);
    }
  }
  return [...found].sort();
}

export function extractor(ecosystem: string, repoRoot: string): Extractor | null {
  const factory = FACTORIES[ecosystem];
  return factory ? factory(repoRoot) : null;
}

export function extractorsFor(unit: Unit, repoRoot: string): Extractor[] {
  const names = new Set(unit.languages);
  for (const manifest of unit.manifests) {
    const ecosystem = ecosystemForManifest(manifest);
    if (ecosystem) names.add(ecosystem);
  }
  return [...names].sort().flatMap((name) => {
    const tool = extractor(name, repoRoot);
    return tool ? [tool] : [];
  });
}

