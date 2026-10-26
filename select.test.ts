import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectSurfaces } from './detect/detect-surfaces';
import { partitionSurfaces } from './select';

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
        dependencies: { svelte: '^5.0.0' },
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
    });
    const found = await detectSurfaces({ cwd: root });
    const { surfaces, held } = await partitionSurfaces(root, found.surfaces);
    expect(surfaces.map((s) => s.path).sort()).toEqual([
      'apps/agent-worker',
      'apps/api',
      'apps/browser-runner',
      'apps/console',
    ]);
    expect(held.find((s) => s.path === '.')?.reason).toBe('workspace root');
    expect(held.find((s) => s.path === 'apps/voice-worker')?.reason).toBe(
      'no entrypoint (worker.py/server.py)'
    );
    expect(held.find((s) => s.path === 'apps/extension')?.reason).toBe('undecidable');
    expect(held.find((s) => s.path === 'packages/core')?.reason).toBe('library');
    expect(surfaces.find((s) => s.path === 'apps/api')?.verdict).toBe('probable');
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
    const { surfaces } = await partitionSurfaces(root, found.surfaces);
    expect(surfaces.map((s) => s.path)).toEqual(['.']);
  });
});
