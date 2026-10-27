import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { ScannerRow } from './merge';

/**
 * A scanner zone, with the fields the filter reads.
 *
 * `entrypointSource` is a start file found after the verdict. It does not
 * change `kind` or `verdict`. `workspaceRoot` is set only on `.`.
 */
export interface SurfaceCandidate {
  readonly path: string;
  readonly surface: string | null;
  readonly kind: string;
  readonly verdict: string;
  readonly entrypoint?: string;
  readonly entrypointSource?: string;
  readonly workspaceRoot?: boolean;
}

const PY_ENTRY_FILES = [
  'main.py',
  '__main__.py',
  'app.py',
  'wsgi.py',
  'asgi.py',
  'worker.py',
  'server.py',
];

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'coverage', '__pycache__']);

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

function zoneAbs(root: string, path: string): string {
  return path === '.' ? root : join(root, path);
}

function relPosix(from: string, abs: string): string {
  return relative(from, abs).split('\\').join('/');
}

function fileFromScript(script: string): string | null {
  for (const token of script.split(/\s+/)) {
    const clean = token.replace(/^['"]|['"]$/g, '').replace(/^\.\//, '');
    if (/\.(ts|tsx|js|mjs|cjs)$/.test(clean)) return clean;
  }
  return null;
}

function pyStarts(text: string): boolean {
  return (
    /if\s+__name__\s*==/.test(text) ||
    /FastAPI\s*\(/.test(text) ||
    /Flask\s*\(/.test(text) ||
    /uvicorn\.run\s*\(/.test(text)
  );
}

function pyprojectScripts(text: string): boolean {
  let inSection = false;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[')) {
      inSection = trimmed === '[project.scripts]' || trimmed === '[tool.poetry.scripts]';
      continue;
    }
    if (!inSection || trimmed === '' || trimmed.startsWith('#')) continue;
    if (/^[A-Za-z0-9_.-]+\s*=/.test(trimmed)) return true;
  }
  return false;
}

function tsStarts(text: string): boolean {
  return /\.listen\s*\(/.test(text) || /createServer\s*\(/.test(text) || /\bserve\s*\(/.test(text);
}

/** A start/serve/dev script that names a file which exists. A bare `dev` does not count. */
async function scriptTarget(zone: string): Promise<string | null> {
  const text = await readText(join(zone, 'package.json'));
  if (!text) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const scripts = (parsed as { scripts?: unknown }).scripts;
  if (!scripts || typeof scripts !== 'object') return null;
  for (const key of ['start', 'serve', 'dev']) {
    const script = (scripts as Record<string, unknown>)[key];
    if (typeof script !== 'string') continue;
    const file = fileFromScript(script);
    if (file && (await isFile(join(zone, file)))) return file;
  }
  return null;
}

async function pythonSource(zone: string): Promise<string | null> {
  for (const name of PY_ENTRY_FILES) {
    const text = await readText(join(zone, name));
    if (text && pyStarts(text)) return name;
  }
  const pyproject = await readText(join(zone, 'pyproject.toml'));
  if (pyproject && pyprojectScripts(pyproject)) return 'pyproject.toml';
  let entries;
  try {
    entries = await readdir(zone, { withFileTypes: true });
  } catch {
    return null;
  }
  const named = new Set(PY_ENTRY_FILES);
  const files = entries.filter((entry) => entry.isFile()).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of files) {
    if (!entry.isFile() || !entry.name.endsWith('.py') || named.has(entry.name)) continue;
    if (entry.name.startsWith('test_') || entry.name.endsWith('_test.py')) continue;
    const text = await readText(join(zone, entry.name));
    if (text && pyStarts(text)) return entry.name;
  }
  return null;
}

/** Shallow walk. Stops after a few dozen files so a big tree cannot dominate a scan. */
async function tsMarker(
  root: string,
  dir: string,
  depth: number,
  budget: { left: number }
): Promise<string | null> {
  if (depth > 4 || budget.left <= 0) return null;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (budget.left <= 0) return null;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name === '__tests__') continue;
      const hit = await tsMarker(root, join(dir, entry.name), depth + 1, budget);
      if (hit) return hit;
      continue;
    }
    if (!entry.isFile() || !/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) continue;
    if (/\.(test|spec)\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) continue;
    budget.left -= 1;
    const abs = join(dir, entry.name);
    const text = await readText(abs);
    if (text && tsStarts(text)) return relPosix(root, abs);
  }
  return null;
}

async function tsSource(zone: string): Promise<string | null> {
  const fromScript = await scriptTarget(zone);
  if (fromScript) return fromScript;
  if (await isFile(join(zone, 'src', 'server.ts'))) return 'src/server.ts';
  return tsMarker(zone, zone, 0, { left: 40 });
}

/**
 * Where this zone starts, if it starts anywhere.
 * Called after the verdict. The result is stored on the row and is not
 * language evidence, so it cannot promote a verdict to `confirmed`.
 */
export async function detectEntrypointSource(
  root: string,
  row: SurfaceCandidate
): Promise<string | null> {
  const zone = zoneAbs(root, row.path);
  if (row.entrypoint && (await isFile(join(root, row.entrypoint)))) {
    return row.entrypoint.replace(/^\.\//, '');
  }
  if (row.surface === 'python') return pythonSource(zone);
  if (row.surface === 'ts-server') return tsSource(zone);
  return null;
}

/** True when `.` is a workspace aggregator, not the app itself. */
export async function isWorkspaceRoot(root: string): Promise<boolean> {
  const pkgText = await readText(join(root, 'package.json'));
  if (pkgText) {
    try {
      const pkg = JSON.parse(pkgText) as { workspaces?: unknown };
      const ws = pkg.workspaces;
      if (Array.isArray(ws) && ws.length > 0) return true;
      if (
        ws &&
        typeof ws === 'object' &&
        Array.isArray((ws as { packages?: unknown }).packages) &&
        (ws as { packages: unknown[] }).packages.length > 0
      ) {
        return true;
      }
    } catch {
      // A broken root manifest is not a workspace signal.
    }
  }
  if (await isFile(join(root, 'pnpm-workspace.yaml'))) return true;
  const py = await readText(join(root, 'pyproject.toml'));
  return py !== null && /\[tool\.uv\.workspace\]/.test(py);
}

/**
 * Why a zone was held back, or null when it is a surface.
 * First match wins. `select.test.ts` locks the string for each row, so a
 * reorder that relabels a drop fails the test.
 */
export function holdReason(row: SurfaceCandidate): string | null {
  if ((row.path === '.' || row.path === './') && row.workspaceRoot) return 'workspace root';
  if (row.kind === 'library') return 'library';
  if (row.verdict !== 'probable' && row.verdict !== 'confirmed') return row.verdict;
  if (row.kind === 'unknown') {
    if (row.entrypointSource) return null;
    if (row.surface === 'python') return 'no entrypoint (worker.py/server.py)';
    if (row.surface === 'ts-server') return 'no entrypoint (dev script or src/server.ts)';
    return 'no entrypoint';
  }
  if (row.kind !== 'app') return `kind ${row.kind}`;
  return null;
}

export function isSurface(row: SurfaceCandidate): boolean {
  return holdReason(row) === null;
}

export function partitionSurfaces<T extends SurfaceCandidate>(
  rows: readonly T[]
): { surfaces: T[]; held: (T & { readonly reason: string })[] } {
  const surfaces: T[] = [];
  const held: (T & { readonly reason: string })[] = [];
  for (const row of rows) {
    const reason = holdReason(row);
    if (reason === null) surfaces.push(row);
    else held.push({ ...row, reason });
  }
  return { surfaces, held };
}

export function toScannerRow(row: SurfaceCandidate): ScannerRow {
  return {
    path: row.path,
    surface: row.surface,
    kind: row.kind,
    verdict: row.verdict,
    ...(row.entrypoint !== undefined ? { entrypoint: row.entrypoint } : {}),
    ...(row.entrypointSource !== undefined ? { entrypointSource: row.entrypointSource } : {}),
  };
}
