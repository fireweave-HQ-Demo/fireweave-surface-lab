import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { extractorsFor } from "./extractors";
import type { Convention, Unit } from "./types";

const RUN_KEYS = new Set(["start", "serve", "dev", "worker"]);
const TOOLING = /^(?:vitest|jest|eslint|prettier|tsc|biome|playwright|next\s+build|next\s+lint)\b/;
const PROGRAM = /\.(py|go|rs)$/;

export type ConventionPass = {
  conventions: Convention[];
  flags: Map<string, string>;
  /** Unit paths whose package name another unit depends on. */
  importedUnits: Set<string>;
};

/**
 * Level 1. The rule is the repo's own split, with the paths that disagree
 * flagged for a full investigation rather than dropped.
 */
export async function inferConventions(repoRoot: string, units: readonly Unit[]): Promise<ConventionPass> {
  const imported = new Set<string>();
  const names = new Map<string, string>();
  const deployable = new Map<string, boolean>();
  const why = new Map<string, string>();

  for (const unit of units) {
    const tools = extractorsFor(unit, repoRoot);
    let runs = false;
    let reason = "no start script and no program file";
    for (const tool of tools) {
      if (tool.packageName) {
        const name = await tool.packageName(unit);
        if (name) names.set(name, unit.path);
      }
      const facts = await tool.readManifest(unit);
      for (const dep of Object.keys(facts.deps)) imported.add(dep);
      for (const script of facts.scripts) {
        const key = script.split(": ")[0] ?? "";
        const command = script.split(": ").slice(1).join(": ").trim();
        if (RUN_KEYS.has(key) && !TOOLING.test(command)) {
          runs = true;
          reason = `${script}`;
        }
      }
    }
    if (!runs && (await hasProgram(repoRoot, unit.path))) {
      runs = true;
      reason = "program file beside the manifest";
    }
    deployable.set(unit.path, runs);
    why.set(unit.path, reason);
  }

  const apps = units.filter((unit) => unit.path.startsWith("apps/"));
  const packages = units.filter((unit) => unit.path.startsWith("packages/"));
  const conventions: Convention[] = [];
  const flags = new Map<string, string>();
  if (apps.length > 0 && packages.length > 0) {
    const appsRun = apps.filter((unit) => deployable.get(unit.path)).length;
    const packagesRun = packages.filter((unit) => deployable.get(unit.path)).length;
    if (appsRun * 2 >= apps.length && packagesRun === 0) {
      const rule = "apps/* are deployable and packages/* are libraries";
      const exceptions = apps.filter((unit) => !deployable.get(unit.path)).map((unit) => unit.path);
      conventions.push({
        rule,
        evidence: [
          ...apps.map((unit) => `${unit.path}: ${why.get(unit.path)}`),
          ...packages.map((unit) => `${unit.path}: ${why.get(unit.path)}`),
        ].sort(),
        exceptions,
      });
      for (const path of exceptions) flags.set(path, rule);
      for (const unit of packages) {
        if (deployable.get(unit.path)) flags.set(unit.path, rule);
      }
    }
  }
  const importedUnits = new Set<string>();
  for (const [name, path] of names) {
    if (imported.has(name)) importedUnits.add(path);
  }
  return { conventions, flags, importedUnits };
}

async function hasProgram(repoRoot: string, unitPath: string): Promise<boolean> {
  const dir = unitPath === "." ? repoRoot : join(repoRoot, unitPath);
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.some(
      (entry) => entry.isFile() && PROGRAM.test(entry.name) && !entry.name.startsWith("test_")
    );
  } catch {
    return false;
  }
}
