import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { ScannerRow } from './merge';

/** A scanner zone, with the fields the filter actually reads. */
export interface SurfaceCandidate {
  readonly path: string;
  readonly surface: string | null;
  readonly kind: string;
  readonly verdict: string;
  readonly entrypoint?: string;
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

function fileFromScript(script: string): string | null {
  for (const token of script.split(/\s+/)) {
    const clean = token.replace(/^['"]|['"]$/g, '').replace(/^\.\//, '');
    if (/\.(ts|tsx|js|mjs|cjs)$/.test(clean)) return clean;
  }
  return null;
}

/** A start/serve/dev script that names a file which exists. A bare `dev` does not count. */
async function scriptPointsAtFile(zone: string): Promise<boolean> {
  const text = await readText(join(zone, 'package.json'));
  if (!text) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return false;
  }
  if (!parsed || typeof parsed !== 'object') return false;
  const scripts = (parsed as { scripts?: unknown }).scripts;
  if (!scripts || typeof scripts !== 'object') return false;
  for (const key of ['start', 'serve', 'dev']) {
    const script = (scripts as Record<string, unknown>)[key];
    if (typeof script !== 'string') continue;
    const file = fileFromScript(script);
    if (file && (await isFile(join(zone, file)))) return true;
  }
  return false;
}

async function pythonEntry(zone: string): Promise<boolean> {
  for (const name of PY_ENTRY_FILES) {
    const text = await readText(join(zone, name));
    if (text && /if\s+__name__\s*==/.test(text)) return true;
  }
  return false;
}

async function tsEntry(zone: string): Promise<boolean> {
  if (await scriptPointsAtFile(zone)) return true;
  return isFile(join(zone, 'src', 'server.ts'));
}

/**
 * An entry the process actually starts from. This does not feed the scanner:
 * a `dev` script or `worker.py` here must not change kind or verdict.
 */
export async function hasRealEntrypoint(
  root: string,
  row: SurfaceCandidate
): Promise<boolean> {
  const zone = zoneAbs(root, row.path);
  if (row.entrypoint && (await isFile(join(root, row.entrypoint)))) return true;
  if (row.surface === 'python') return pythonEntry(zone);
  if (row.surface === 'ts-server') return tsEntry(zone);
  return false;
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

/** Why a zone was held back, or null when it is a surface. */
export async function holdReason(
  root: string,
  row: SurfaceCandidate,
  workspaceRoot: boolean
): Promise<string | null> {
  if ((row.path === '.' || row.path === './') && workspaceRoot) return 'workspace root';
  if (row.kind === 'library') return 'library';
  if (row.verdict !== 'probable' && row.verdict !== 'confirmed') return row.verdict;
  if (row.kind === 'unknown') {
    if (await hasRealEntrypoint(root, row)) return null;
    if (row.surface === 'python') return 'no entrypoint (worker.py/server.py)';
    if (row.surface === 'ts-server') return 'no entrypoint (dev script or src/server.ts)';
    return 'no entrypoint';
  }
  if (row.kind !== 'app') return `kind ${row.kind}`;
  return null;
}

export async function isSurface(
  root: string,
  row: SurfaceCandidate,
  workspaceRoot: boolean
): Promise<boolean> {
  return (await holdReason(root, row, workspaceRoot)) === null;
}

export async function partitionSurfaces<T extends SurfaceCandidate>(
  root: string,
  rows: readonly T[]
): Promise<{ surfaces: T[]; held: (T & { readonly reason: string })[] }> {
  const workspaceRoot = await isWorkspaceRoot(root);
  const surfaces: T[] = [];
  const held: (T & { readonly reason: string })[] = [];
  for (const row of rows) {
    const reason = await holdReason(root, row, workspaceRoot);
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
  };
}
