import { join } from "node:path";
import type { Unit } from "../types";

export interface ManifestFacts {
  scripts: string[];
  bins: string[];
  deps: Record<string, string>;
  description?: string;
  /** True when the manifest publishes an importable entry and nothing else. */
  exportsOnly?: boolean;
}

export type Resolution = { file: string; line: number } | { unresolved: string };

/**
 * The only language-specific surface. The chain calls these methods and
 * classifies on the construct label; it does not name a language.
 */
export interface Extractor {
  ecosystem: string;
  readManifest(unit: Unit): Promise<ManifestFacts>;
  resolveDeclaration(unit: Unit, decl: string): Promise<Resolution>;
  executionIdioms(): { grep: RegExp; construct: string }[];
  exclusions(): RegExp[];
}

export function unitDir(repoRoot: string, unit: Unit): string {
  return unit.path === "." || unit.path === "" ? repoRoot : join(repoRoot, unit.path);
}

export function repoRelative(repoRoot: string, abs: string): string {
  if (abs === repoRoot) return ".";
  const prefix = repoRoot.endsWith("/") ? repoRoot : `${repoRoot}/`;
  return abs.startsWith(prefix) ? abs.slice(prefix.length) : abs;
}
