import { readdir } from "node:fs/promises";
import { join } from "node:path";

export const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  ".venv",
  "venv",
  "vendor",
  ".next",
  "coverage",
  "__pycache__",
]);

export type Skipped = { path: string; reason: string };

/** Files inside one unit, at most `maxDepth` directories down. Excluded dirs are recorded and not entered. */
export async function listFiles(
  abs: string,
  relRoot: string,
  maxDepth: number,
  extraSkip: readonly RegExp[] = [],
  boundaries: readonly string[] = []
): Promise<{ files: string[]; skipped: Skipped[] }> {
  const files: string[] = [];
  const skipped: Skipped[] = [];
  await walk(abs, relRoot === "." ? "" : relRoot, 0, maxDepth, extraSkip, boundaries, files, skipped);
  files.sort();
  return { files, skipped };
}

function isBoundary(relPath: string, boundaries: readonly string[]): boolean {
  return boundaries.some((unit) => unit === relPath || unit.startsWith(`${relPath}/`));
}

async function walk(
  dir: string,
  rel: string,
  depth: number,
  maxDepth: number,
  extraSkip: readonly RegExp[],
  boundaries: readonly string[],
  files: string[],
  skipped: Skipped[]
): Promise<void> {
  if (depth > maxDepth) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (entry.name === ".surface-cache") continue;
      if (isBoundary(relPath, boundaries)) continue;
      if (SKIP_DIRS.has(entry.name) || extraSkip.some((pattern) => pattern.test(relPath))) {
        skipped.push({ path: relPath, reason: "excluded" });
        continue;
      }
      await walk(join(dir, entry.name), relPath, depth + 1, maxDepth, extraSkip, boundaries, files, skipped);
      continue;
    }
    if (!entry.isFile()) continue;
    if (extraSkip.some((pattern) => pattern.test(relPath))) {
      skipped.push({ path: relPath, reason: "excluded" });
      continue;
    }
    files.push(relPath);
  }
}
