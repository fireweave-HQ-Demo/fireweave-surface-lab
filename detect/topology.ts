/**
 * Workspace topology — which directories are candidate zones.
 *
 * A "zone" is a directory that could independently be a surface: a workspace
 * member, a Cargo/Go/Maven/Gradle module, or the repo root itself. Detection
 * runs per zone, because a monorepo's answer is per-package and a single-package
 * repo is just the degenerate case with one zone.
 *
 * ## Unreadable zones are REPORTED, never skipped
 *
 * Every read here is fallible — a permission error, a symlink loop, a manifest
 * that is not valid JSON. The tempting thing is to `catch { continue }`, and it
 * is exactly wrong: a zone that cannot be read contributes no surfaces, which is
 * indistinguishable from a zone that has none. That is the same silent-zero
 * failure `surface-scan-vocabulary.ts` exists to prevent, one level up. So an
 * unreadable zone becomes an `UnreadableZone` the caller MUST surface.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

/** A directory that could independently be a surface. */
export interface Zone {
  /** Repo-relative path (`.` for the root). */
  readonly path: string;
  /** How this zone was discovered. */
  readonly via: 'root' | 'workspace-member' | 'module';
  /** Parsed package.json, when the zone has a readable one. */
  readonly manifest?: Record<string, unknown>;
  /** Manifest filenames present in the zone (package.json, go.mod, …). */
  readonly manifestFiles: readonly string[];
}

/** A zone the detector could not read — surfaced, never dropped. */
export interface UnreadableZone {
  readonly path: string;
  readonly reason: string;
}

export interface TopologyResult {
  readonly zones: readonly Zone[];
  readonly unreadable: readonly UnreadableZone[];
}

/** Directory names never worth walking into. */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'target',
  'vendor',
  '.next',
  '.svelte-kit',
  '.turbo',
  'coverage',
  '__pycache__',
  '.venv',
  'venv',
  '.gradle',
  'Pods',
  '.output',
]);

const MANIFEST_NAMES = [
  'package.json',
  'go.mod',
  'Cargo.toml',
  'pyproject.toml',
  'setup.py',
  'requirements.txt',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'Package.swift',
  'pubspec.yaml',
] as const;

async function readJson(
  path: string
): Promise<
  { ok: true; value: Record<string, unknown> } | { ok: false; reason: string }
> {
  try {
    const text = await readFile(path, 'utf8');
    const parsed: unknown = JSON.parse(text);
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      return { ok: false, reason: `${path} is not a JSON object` };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch (err) {
    return { ok: false, reason: `${path}: ${(err as Error).message}` };
  }
}

async function manifestsIn(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const name of MANIFEST_NAMES) {
    try {
      const s = await stat(join(dir, name));
      if (s.isFile()) found.push(name);
    } catch {
      // Absent is the common case and carries no information — only a
      // present-but-unreadable manifest is a finding, and that surfaces when
      // we actually parse it below.
    }
  }
  return found;
}

/** Expand one workspace glob (`packages/*`, `apps/**`) to existing directories. */
async function expandGlob(root: string, pattern: string): Promise<string[]> {
  // Deliberately not a full glob engine: workspace globs in the wild are
  // `dir/*`, `dir/**` or a literal path. Anything fancier falls through to the
  // literal branch and simply does not expand — which under-reports zones
  // rather than inventing them, and the root zone still covers the repo.
  const clean = pattern.replace(/\/+$/, '');
  const starIdx = clean.indexOf('*');
  if (starIdx === -1) return [clean];
  const base = clean.slice(0, starIdx).replace(/\/+$/, '');
  const baseAbs = base ? join(root, base) : root;
  let entries: string[];
  try {
    entries = (await readdir(baseAbs, { withFileTypes: true }))
      .filter(
        (e) =>
          e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.')
      )
      .map((e) => e.name);
  } catch {
    return [];
  }
  return entries.map((name) => (base ? `${base}/${name}` : name));
}

function workspaceGlobs(manifest: Record<string, unknown>): string[] {
  const ws = manifest.workspaces;
  if (Array.isArray(ws))
    return ws.filter((x): x is string => typeof x === 'string');
  if (
    ws &&
    typeof ws === 'object' &&
    Array.isArray((ws as { packages?: unknown }).packages)
  ) {
    return (ws as { packages: unknown[] }).packages.filter(
      (x): x is string => typeof x === 'string'
    );
  }
  return [];
}

/** Recursively find module dirs (bounded depth) for non-JS ecosystems. */
async function findModuleDirs(
  root: string,
  maxDepth: number
): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // caller records unreadable zones for dirs it already knows about
    }
    for (const e of entries) {
      if (!e.isDirectory() || SKIP_DIRS.has(e.name) || e.name.startsWith('.'))
        continue;
      const abs = join(dir, e.name);
      const rel = relative(root, abs).split(sep).join('/');
      const found = await manifestsIn(abs);
      if (found.length > 0) out.push(rel);
      await walk(abs, depth + 1);
    }
  }
  await walk(root, 1);
  return out;
}

/**
 * Discover every candidate zone under `root`.
 *
 * The root is ALWAYS a zone, even in a workspace repo: a monorepo frequently
 * deploys its root (a Dockerfile at the top, a root `start` script), and
 * treating "has workspaces" as "the root is not a surface" is how the most
 * commonly-deployed directory in the repo goes undetected.
 */
export async function discoverZones(root: string): Promise<TopologyResult> {
  const unreadable: UnreadableZone[] = [];
  const byPath = new Map<string, Zone>();

  const addZone = async (rel: string, via: Zone['via']): Promise<void> => {
    if (byPath.has(rel)) return;
    const abs = rel === '.' ? root : join(root, rel);
    const manifestFiles = await manifestsIn(abs);
    if (manifestFiles.length === 0 && via !== 'root') return;
    let manifest: Record<string, unknown> | undefined;
    if (manifestFiles.includes('package.json')) {
      const r = await readJson(join(abs, 'package.json'));
      if (r.ok) manifest = r.value;
      else unreadable.push({ path: rel, reason: r.reason });
    }
    byPath.set(rel, {
      path: rel,
      via,
      ...(manifest !== undefined ? { manifest } : {}),
      manifestFiles,
    });
  };

  await addZone('.', 'root');

  const rootZone = byPath.get('.');
  if (rootZone?.manifest) {
    for (const pattern of workspaceGlobs(rootZone.manifest)) {
      for (const dir of await expandGlob(root, pattern)) {
        await addZone(dir, 'workspace-member');
      }
    }
  }

  // pnpm keeps its globs outside package.json.
  try {
    const yml = await readFile(join(root, 'pnpm-workspace.yaml'), 'utf8');
    for (const line of yml.split('\n')) {
      const m = /^\s*-\s*['"]?([^'"\n#]+?)['"]?\s*$/.exec(line);
      if (!m) continue;
      for (const dir of await expandGlob(root, m[1]!)) {
        await addZone(dir, 'workspace-member');
      }
    }
  } catch {
    // No pnpm workspace file — normal.
  }

  for (const dir of await findModuleDirs(root, 3)) {
    await addZone(dir, 'module');
  }

  return {
    zones: [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path)),
    unreadable,
  };
}
