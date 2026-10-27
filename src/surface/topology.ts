import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { ecosystemForManifest, ecosystemsForFiles } from "./extractors";
import { SKIP_DIRS } from "./files";
import type { Unit } from "./types";

const MANIFESTS = new Set([
  "package.json",
  "pyproject.toml",
  "go.mod",
  "Cargo.toml",
  "Dockerfile",
  "Procfile",
  "index.html",
]);

const SOURCE = /\.(py|ts|tsx|js|mjs|cjs|go|rs|html)$/;

export type Exclusion = { path: string; reason: string; review: boolean };

export type Topology = {
  units: Unit[];
  excluded: Exclusion[];
};

/**
 * Level 1, first step. Units are manifest directories, plus a manifestless
 * directory of source whose only manifest ancestor is the repo root.
 * Excluded directories are recorded. A manifest inside one is a review item.
 */
export async function inferTopology(repoRoot: string): Promise<Topology> {
  const manifests = new Map<string, string[]>();
  const excluded: Exclusion[] = [];
  await scan(repoRoot, "", manifests, excluded);
  const manifestDirs = new Set(manifests.keys());
  const units: Unit[] = [];
  for (const [path, names] of [...manifests.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const languages = [
      ...new Set(names.flatMap((name) => ecosystemForManifest(name) ?? [])),
    ].sort();
    units.push({ path, manifests: [...names].sort(), languages });
  }
  await manifestless(repoRoot, "", manifestDirs, units);
  for (const unit of units) {
    const { files } = await listShallow(repoRoot, unit.path);
    for (const language of ecosystemsForFiles(files)) {
      if (!unit.languages.includes(language)) unit.languages.push(language);
    }
    unit.languages.sort();
  }
  units.sort((a, b) => a.path.localeCompare(b.path));
  return { units, excluded };
}

async function scan(
  dir: string,
  rel: string,
  manifests: Map<string, string[]>,
  excluded: Exclusion[]
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  const names = entries.filter((entry) => entry.isFile() && MANIFESTS.has(entry.name)).map((entry) => entry.name);
  if (names.length > 0) manifests.set(rel || ".", names.sort());
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    if (SKIP_DIRS.has(entry.name)) {
      const review = await containsManifest(join(dir, entry.name), 0);
      excluded.push({
        path: relPath,
        reason: review ? "excluded directory contains a manifest" : "excluded",
        review,
      });
      continue;
    }
    await scan(join(dir, entry.name), relPath, manifests, excluded);
  }
}

async function containsManifest(dir: string, depth: number): Promise<boolean> {
  if (depth > 3) return false;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (entry.isFile() && MANIFESTS.has(entry.name)) return true;
    if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
      if (await containsManifest(join(dir, entry.name), depth + 1)) return true;
    }
  }
  return false;
}

async function manifestless(
  dir: string,
  rel: string,
  manifestDirs: Set<string>,
  units: Unit[]
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  const path = rel || ".";
  const hasSource = entries.some((entry) => entry.isFile() && SOURCE.test(entry.name) && !entry.name.endsWith(".d.ts"));
  if (hasSource && !manifestDirs.has(path) && !ownedByManifest(path, manifestDirs)) {
    const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
    units.push({
      path,
      manifests: [],
      languages: ecosystemsForFiles(files),
    });
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue;
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    if (manifestDirs.has(relPath)) continue;
    await manifestless(join(dir, entry.name), relPath, manifestDirs, units);
  }
}

/** Source directly inside a manifest unit belongs to that unit. */
function ownedByManifest(path: string, manifestDirs: Set<string>): boolean {
  if (path === ".") return false;
  const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ".";
  if (manifestDirs.has(parent)) return true;
  return insideManifest(path, manifestDirs);
}

/** True when a non-root ancestor is itself a manifest unit. */
function insideManifest(path: string, manifestDirs: Set<string>): boolean {
  if (path === ".") return false;
  const parts = path.split("/");
  for (let i = 1; i < parts.length; i++) {
    const ancestor = parts.slice(0, i).join("/");
    if (ancestor !== "." && manifestDirs.has(ancestor)) return true;
  }
  return false;
}

async function listShallow(repoRoot: string, unitPath: string): Promise<{ files: string[] }> {
  const abs = unitPath === "." ? repoRoot : join(repoRoot, unitPath);
  let entries;
  try {
    entries = await readdir(abs, { withFileTypes: true });
  } catch {
    return { files: [] };
  }
  return { files: entries.filter((entry) => entry.isFile()).map((entry) => entry.name) };
}
