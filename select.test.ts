import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectSurfaces } from './detect/detect-surfaces';
import { selectionEvidence } from './merge';
import { holdReason, isSurface, partitionSurfaces, type SurfaceCandidate } from './select';

const made: string[] = [];
afterEach(() => {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
});

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'fw-select-'));
  made.push(root);
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, body);
  }
  return root;
}

const pkg = (o: Record<string, unknown>): string => JSON.stringify(o, null, 2);

function row(over: Partial<SurfaceCandidate> & Pick<SurfaceCandidate, 'path'>): SurfaceCandidate {
  return { surface: 'ts-server', kind: 'unknown', verdict: 'probable', ...over };
}

// path is the label. The row carries the scanner fields the filter reads.
const CASES: readonly [string, SurfaceCandidate, boolean, string | null][] = [
  [
    '.',
    row({ path: '.', surface: null, kind: 'unknown', verdict: 'ambiguous', workspaceRoot: true }),
    false,
    'workspace root',
  ],
  [
    'packages/ui',
    row({ path: 'packages/ui', surface: null, kind: 'library', verdict: 'undecidable' }),
    false,
    'library',
  ],
  [
    'apps/voice-worker',
    row({ path: 'apps/voice-worker', surface: 'python' }),
    false,
    'no entrypoint (worker.py/server.py)',
  ],
  [
    'apps/extension',
    row({ path: 'apps/extension', surface: null, verdict: 'undecidable' }),
    false,
    'undecidable',
  ],
  ['apps/api', row({ path: 'apps/api', entrypointSource: 'src/server.ts' }), true, null],
  [
    'apps/agent-worker',
    row({ path: 'apps/agent-worker', surface: 'python', entrypointSource: 'worker.py' }),
    true,
    null,
  ],
  [
    'apps/browser-runner',
    row({ path: 'apps/browser-runner', surface: 'python', entrypointSource: 'server.py' }),
    true,
    null,
  ],
  [
    'apps/console',
    row({ path: 'apps/console', surface: 'web', kind: 'app', verdict: 'confirmed' }),
    true,
    null,
  ],
];

describe('isSurface', () => {
  test.each(CASES)('%s', (_label, candidate, selected, reason) => {
    expect(isSurface(candidate)).toBe(selected);
    expect(holdReason(candidate)).toBe(reason);
  });
});

describe('partitionSurfaces', () => {
  test('keeps real servers and drops the workspace root, libraries, and placeholders', async () => {
    const root = repo({
      'package.json': pkg({
        name: 'clinic-os',
        private: true,
        workspaces: ['apps/*', 'packages/*'],
      }),
      'pyproject.toml':
        '[project]\nname = "clinic-os"\n\n[tool.uv.workspace]\nmembers = ["apps/agent-worker", "apps/browser-runner", "apps/voice-worker"]\n',
      'apps/api/package.json': pkg({
        name: '@x/api',
        private: true,
        scripts: { dev: 'tsx src/server.ts' },
        dependencies: { hono: '4.0.0', '@x/core': 'workspace:*' },
      }),
      'apps/api/src/server.ts': 'export const app = 1;\n',
      'apps/console/package.json': pkg({
        name: '@x/console',
        private: true,
        scripts: { build: 'vite build' },
        dependencies: { svelte: '^5.0.0', '@x/ui': 'workspace:*' },
      }),
      'apps/console/src/App.svelte': '<h1>x</h1>\n',
      'apps/agent-worker/pyproject.toml': '[project]\nname = "agent"\n',
      'apps/agent-worker/worker.py': 'if __name__ == "__main__":\n    pass\n',
      'apps/browser-runner/pyproject.toml': '[project]\nname = "browser"\n',
      'apps/browser-runner/server.py': 'if __name__ == "__main__":\n    pass\n',
      'apps/voice-worker/pyproject.toml':
        '[project]\nname = "voice"\ndescription = "Placeholder. Voice is a later phase."\n',
      'apps/extension/package.json': pkg({
        name: '@x/extension',
        private: true,
        description: 'Chrome side panel placeholder.',
      }),
      'packages/core/package.json': pkg({
        name: '@x/core',
        dependencies: { hono: '4.0.0' },
      }),
      'packages/core/index.ts': 'export const c = 1;\n',
      'packages/ui/package.json': pkg({
        name: '@x/ui',
        private: true,
        scripts: { build: 'echo ui' },
      }),
      'packages/ui/index.css': 'x {}\n',
    });
    const found = await detectSurfaces({ cwd: root });
    const { surfaces, held } = partitionSurfaces(found.surfaces);
    expect(surfaces.map((s) => s.path).sort()).toEqual([
      'apps/agent-worker',
      'apps/api',
      'apps/browser-runner',
      'apps/console',
    ]);
    const reason = (path: string) => held.find((s) => s.path === path);
    const rootRow = reason('.');
    expect(rootRow?.verdict).not.toBe('confirmed');
    expect(rootRow?.reason).toBe('workspace root');
    expect(reason('apps/voice-worker')?.reason).toBe('no entrypoint (worker.py/server.py)');
    expect(reason('apps/extension')?.reason).toBe('undecidable');
    expect(reason('packages/core')?.reason).toBe('library');
    const ui = reason('packages/ui');
    expect(ui?.kind).toBe('library');
    expect(ui?.verdict).toBe('undecidable');
    expect(ui?.reason).toBe('library');
    const api = surfaces.find((s) => s.path === 'apps/api');
    expect(api?.verdict).toBe('probable');
    expect(selectionEvidence(api!)).toBe('probable + entrypoint(src/server.ts)');
    expect(selectionEvidence(surfaces.find((s) => s.path === 'apps/agent-worker')!)).toBe(
      'probable + entrypoint(worker.py)'
    );
    expect(selectionEvidence(surfaces.find((s) => s.path === 'apps/browser-runner')!)).toBe(
      'probable + entrypoint(server.py)'
    );
    expect(selectionEvidence(surfaces.find((s) => s.path === 'apps/console')!)).toBe('confirmed');
  });

  test('a single-package repo keeps the root when the root is the server', async () => {
    const root = repo({
      'package.json': pkg({
        name: 'api',
        private: true,
        scripts: { start: 'bun src/index.ts' },
        dependencies: { elysia: '^1.0.0' },
      }),
      'src/index.ts': 'export const x = 1;\n',
    });
    const found = await detectSurfaces({ cwd: root });
    const { surfaces } = partitionSurfaces(found.surfaces);
    expect(surfaces.map((s) => s.path)).toEqual(['.']);
  });

  test('a FastAPI file the scanner does not name stays probable and is kept', async () => {
    const root = repo({
      'pyproject.toml': '[project]\nname = "api"\n',
      'run.py': 'from fastapi import FastAPI\napp = FastAPI()\n',
    });
    const found = await detectSurfaces({ cwd: root });
    const { surfaces } = partitionSurfaces(found.surfaces);
    expect(surfaces.map((s) => s.path)).toEqual(['.']);
    expect(surfaces[0]?.verdict).toBe('probable');
    expect(surfaces[0]?.entrypointSource).toBe('run.py');
    expect(selectionEvidence(surfaces[0]!)).toBe('probable + entrypoint(run.py)');
  });

  test('a pyproject script table is an entrypoint and does not confirm the zone', async () => {
    const root = repo({
      'pyproject.toml':
        '[project]\nname = "cli"\n\n[project.scripts]\napp = "myapp.main:app"\n',
    });
    const found = await detectSurfaces({ cwd: root });
    const { surfaces } = partitionSurfaces(found.surfaces);
    expect(surfaces.map((s) => s.path)).toEqual(['.']);
    expect(surfaces[0]?.verdict).toBe('probable');
    expect(surfaces[0]?.entrypointSource).toBe('pyproject.toml');
  });

  test('a listen() call outside the filename list stays probable and is kept', async () => {
    const root = repo({
      'package.json': pkg({
        name: 'api',
        private: true,
        dependencies: { express: '^4.0.0' },
      }),
      'src/index.ts': 'app.listen(3000)\n',
    });
    const found = await detectSurfaces({ cwd: root });
    const { surfaces } = partitionSurfaces(found.surfaces);
    expect(surfaces.map((s) => s.path)).toEqual(['.']);
    expect(surfaces[0]?.verdict).toBe('probable');
    expect(surfaces[0]?.entrypointSource).toBe('src/index.ts');
  });
});
