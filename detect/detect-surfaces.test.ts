import { test, expect, describe, afterEach } from 'bun:test';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectSurfaces } from './detect-surfaces';

const made: string[] = [];
afterEach(() => {
  for (const d of made.splice(0)) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

/** Build a throwaway repo from a { relativePath: contents } map. */
function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'fw-detect-'));
  made.push(root);
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, body);
  }
  return root;
}

const pkg = (o: Record<string, unknown>): string => JSON.stringify(o, null, 2);
const at = (r: Awaited<ReturnType<typeof detectSurfaces>>, path: string) =>
  r.surfaces.find((s) => s.path === path);

describe('detectSurfaces — verdicts are named, and each name means something', () => {
  test('confirmed: positive language evidence + a deployable zone', async () => {
    const root = repo({
      'package.json': pkg({
        name: 'api',
        private: true,
        scripts: { start: 'bun src/index.ts' },
        dependencies: { elysia: '^1.0.0' },
      }),
      'src/index.ts': 'export const x = 1;\n',
    });
    const r = await detectSurfaces({ cwd: root });
    const z = at(r, '.');
    expect(z?.surface).toBe('ts-server');
    expect(z?.verdict).toBe('confirmed');
    expect(z?.kind).toBe('app');
    expect(z?.preselect).toBe(true);
  });

  test('probable: the surface is inferred from ABSENCE, so it is never confirmed', async () => {
    // A zero-dependency TS package. "No browser signal, therefore server" is a
    // sound default and a real failure mode — a browser SDK with no framework
    // dependency looks identical. The verdict has to carry that.
    const root = repo({
      'package.json': pkg({
        name: 'zero-dep',
        private: true,
        scripts: { start: 'node dist/index.js' },
      }),
      'src/index.ts': 'export const x = 1;\n',
    });
    const r = await detectSurfaces({ cwd: root });
    const z = at(r, '.');
    expect(z?.surface).toBe('ts-server');
    expect(z?.verdict).toBe('probable');
    expect(
      z?.evidence.some((e) => e.kind === 'language.typescript-sources')
    ).toBe(true);
  });

  test('a framework-free BROWSER package is not silently called a server', async () => {
    // The regression this rule exists for. `browser` is a positive signal that
    // survives having no dependencies at all.
    const root = repo({
      'package.json': pkg({
        name: 'web-lib',
        private: true,
        browser: './dist/index.js',
        scripts: { start: 'vite preview' },
      }),
      'src/index.ts': 'export const x = 1;\n',
    });
    const r = await detectSurfaces({ cwd: root });
    expect(at(r, '.')?.surface).toBe('web');
  });

  test('ambiguous: two surfaces are genuinely defensible, so the detector refuses to pick', async () => {
    const root = repo({
      'package.json': pkg({
        name: 'fullstack',
        private: true,
        scripts: { start: 'node server.js' },
        dependencies: { svelte: '^5.0.0', express: '^4.0.0' },
      }),
      'src/App.svelte': '<h1>hi</h1>\n',
      'server.js': 'require("express")\n',
    });
    const r = await detectSurfaces({ cwd: root });
    const z = at(r, '.');
    expect(z?.verdict).toBe('ambiguous');
    expect([z?.surface, ...(z?.alternatives ?? [])].sort()).toEqual([
      'ts-server',
      'web',
    ]);
    // The whole point: an ambiguous row must NOT be pre-ticked.
    expect(z?.preselect).toBe(false);
  });

  test('undecidable is REPORTED, not dropped', async () => {
    // A deployable zone in a language FireWeave has no surface for. Silence
    // here would read as "this repo has no such directory", which is the
    // failure mode the whole verdict vocabulary exists to prevent.
    const root = repo({
      'package.json': pkg({ name: 'shell-only', private: true }),
      Dockerfile: 'FROM alpine\n',
      'run.sh': '#!/bin/sh\necho hi\n',
    });
    const r = await detectSurfaces({ cwd: root });
    const z = at(r, '.');
    expect(z).toBeDefined();
    expect(z?.verdict).toBe('undecidable');
    expect(z?.surface).toBeNull();
    expect(z?.preselect).toBe(false);
  });
});

describe('detectSurfaces — app vs library is a GRAPH question', () => {
  const workspace = (): Record<string, string> => ({
    'package.json': pkg({
      name: 'root',
      private: true,
      workspaces: ['packages/*'],
    }),
    'packages/api/package.json': pkg({
      name: '@x/api',
      private: true,
      scripts: { start: 'node index.js' },
      dependencies: { '@x/core': 'workspace:*', elysia: '^1.0.0' },
    }),
    'packages/api/index.ts': 'export const a = 1;\n',
    'packages/core/package.json': pkg({
      name: '@x/core',
      dependencies: { elysia: '^1.0.0' },
    }),
    'packages/core/index.ts': 'export const c = 1;\n',
  });

  test('a depended-upon zone with no entrypoint is a library, and is NOT pre-selected', async () => {
    const r = await detectSurfaces({ cwd: repo(workspace()) });
    const core = at(r, 'packages/core');
    expect(core?.kind).toBe('library');
    // A library may really be deployed — the user knows, the detector does not.
    // So it stays visible and selectable, but never pre-ticked.
    expect(core?.preselect).toBe(false);
    expect(core?.surface).toBe('ts-server');
  });

  test('a graph root with an entrypoint is an app', async () => {
    const r = await detectSurfaces({ cwd: repo(workspace()) });
    const api = at(r, 'packages/api');
    expect(api?.kind).toBe('app');
    expect(api?.preselect).toBe(true);
  });

  test('directory NAME is not the signal — a deployed `packages/*` zone is still an app', async () => {
    // `packages/` vs `apps/` is a convention plenty of repos ignore. Trusting it
    // is how a deployed service gets classed a library and never instrumented.
    const r = await detectSurfaces({ cwd: repo(workspace()) });
    expect(at(r, 'packages/api')?.kind).toBe('app');
    expect(at(r, 'packages/core')?.kind).toBe('library');
  });

  test('a build script promotes only a zone nothing imports', async () => {
    // Recognises a monorepo web app whose Dockerfile lives centrally, without
    // promoting every library that happens to build.
    const files = workspace();
    files['packages/core/package.json'] = pkg({
      name: '@x/core',
      scripts: { build: 'tsc' },
      dependencies: { elysia: '^1.0.0' },
    });
    files['packages/site/package.json'] = pkg({
      name: '@x/site',
      private: true,
      scripts: { build: 'vite build' },
      dependencies: { svelte: '^5.0.0' },
    });
    files['packages/site/src/App.svelte'] = '<h1>x</h1>\n';
    const r = await detectSurfaces({ cwd: repo(files) });
    // imported by @x/api → the build is for its siblings, still a library
    expect(at(r, 'packages/core')?.kind).toBe('library');
    // imported by nobody → the artifact has no in-repo consumer
    expect(at(r, 'packages/site')?.kind).toBe('app');
    expect(at(r, 'packages/site')?.surface).toBe('web');
  });
});

describe('detectSurfaces — unreadable zones are surfaced, never swallowed', () => {
  test('a malformed package.json is reported rather than skipped', async () => {
    // The silent-zero failure: an unreadable zone contributes no surfaces,
    // which is indistinguishable from a zone that has none.
    const root = repo({
      'package.json': pkg({
        name: 'root',
        private: true,
        workspaces: ['packages/*'],
      }),
      'packages/broken/package.json': '{ this is not json',
    });
    const r = await detectSurfaces({ cwd: root });
    expect(r.unreadable.length).toBeGreaterThan(0);
    expect(r.unreadable.some((u) => u.path === 'packages/broken')).toBe(true);
    expect(r.unreadable[0]!.reason).toBeTruthy();
  });

  test('the result always reports how many zones were examined', async () => {
    // Not decoration: "3 surfaces" means something different over 3 zones than
    // over 40, and a caller cannot tell the difference without this.
    const r = await detectSurfaces({ cwd: repo(workspaceFixture()) });
    expect(r.zonesExamined).toBeGreaterThanOrEqual(r.surfaces.length);
  });

  function workspaceFixture(): Record<string, string> {
    return {
      'package.json': pkg({ name: 'root', private: true }),
      'src/index.ts': 'export const x = 1;\n',
    };
  }
});

describe('detectSurfaces — multi-language', () => {
  test('each ecosystem manifest nominates its own surface', async () => {
    const root = repo({
      'services/go/go.mod': 'module x\n',
      'services/go/main.go': 'package main\nfunc main() {}\n',
      'services/py/pyproject.toml': '[project]\nname="x"\n',
      'services/py/main.py': 'if __name__ == "__main__":\n    pass\n',
      'services/rs/Cargo.toml': '[package]\nname="x"\n',
      'services/rs/main.rs': 'fn main() {}\n',
      'services/jv/pom.xml': '<project/>\n',
      'services/jv/App.java': 'class App { static void main(String[] a) {} }\n',
      'services/sw/Package.swift': '// swift-tools-version:5.9\n',
      'services/sw/main.swift': '@main struct A {}\n',
    });
    const r = await detectSurfaces({ cwd: root });
    const got = Object.fromEntries(r.surfaces.map((s) => [s.path, s.surface]));
    expect(got['services/go']).toBe('go');
    expect(got['services/py']).toBe('python');
    expect(got['services/rs']).toBe('rust');
    expect(got['services/jv']).toBe('java');
    expect(got['services/sw']).toBe('swift');
  });
});

describe('diffDeclaredSurfaces — a re-run FLAGS, it does not retire', () => {
  const detected = (path: string, surface: string) =>
    ({
      path,
      surface,
      alternatives: [],
      verdict: 'confirmed',
      kind: 'app',
      evidence: [],
      preselect: true,
    }) as never;

  test('a declared surface detection no longer sees is vanished + needsReview', async () => {
    const { diffDeclaredSurfaces } = await import('./drift');
    const d = diffDeclaredSurfaces(
      [detected('apps/api', 'ts-server')],
      [
        { surface: 'ts-server', path: 'apps/api', surfaceId: 'sfc_1' },
        { surface: 'web', path: 'apps/site', surfaceId: 'sfc_2' },
      ]
    );
    expect(d.vanished.map((v) => v.path)).toEqual(['apps/site']);
    expect(d.unchanged.map((v) => v.path)).toEqual(['apps/api']);
    // The whole point: a human rules on this. Auto-retiring would destroy a
    // server-minted id a committed harness still references, and the damage
    // would surface at ship, not here.
    expect(d.needsReview).toBe(true);
  });

  test('a moved surface reads as vanished + added, never a silent rebind', async () => {
    const { diffDeclaredSurfaces } = await import('./drift');
    const d = diffDeclaredSurfaces(
      [detected('services/api', 'ts-server')],
      [{ surface: 'ts-server', path: 'apps/api', surfaceId: 'sfc_1' }]
    );
    expect(d.vanished.map((v) => v.path)).toEqual(['apps/api']);
    expect(d.added.map((a) => a.path)).toEqual(['services/api']);
    expect(d.needsReview).toBe(true);
  });

  test('a first init has nothing to review — only to select', async () => {
    const { diffDeclaredSurfaces } = await import('./drift');
    const d = diffDeclaredSurfaces([detected('apps/api', 'ts-server')], []);
    expect(d.added).toHaveLength(1);
    expect(d.vanished).toHaveLength(0);
    expect(d.needsReview).toBe(false);
  });

  test('an unchanged re-run is silent', async () => {
    const { diffDeclaredSurfaces } = await import('./drift');
    const d = diffDeclaredSurfaces(
      [detected('apps/api', 'ts-server')],
      [{ surface: 'ts-server', path: 'apps/api', surfaceId: 'sfc_1' }]
    );
    expect(d.needsReview).toBe(false);
    expect(d.added).toHaveLength(0);
    expect(d.vanished).toHaveLength(0);
  });
});

describe('detectAuthSeams — candidates for Step 6b, never a choice', () => {
  test('finds the identity seam and names the token that matched', async () => {
    const { detectAuthSeams } = await import('./auth-seam');
    const root = repo({
      'src/stores/auth.ts': [
        "import { authClient } from './client';",
        'export async function login(email: string) {',
        '  await authClient.signIn({ email });',
        '}',
      ].join('\n'),
      'src/unrelated.ts': 'export const x = 1;\n',
    });
    const r = await detectAuthSeams(root, '.');
    expect(r.candidates.length).toBeGreaterThan(0);
    const inAuth = r.candidates.filter((c) => c.file === 'src/stores/auth.ts');
    expect(inAuth.length).toBeGreaterThan(0);
    expect(inAuth.every((c) => c.line > 0)).toBe(true);
    // Both the declaration and the call are legitimate seams — over-reporting
    // is the design, so assert the SET rather than a single first hit.
    expect(inAuth.map((c) => c.token).sort()).toContain('signIn()');
    expect(inAuth.some((c) => c.excerpt.includes('authClient'))).toBe(true);
    // A file with no identity vocabulary contributes nothing.
    expect(r.candidates.some((c) => c.file === 'src/unrelated.ts')).toBe(false);
  });

  test('a line matching several tokens yields ONE candidate, not three', async () => {
    // Padding the prompt with duplicates of the same seam makes the list
    // harder to read, which is the opposite of the point.
    const { detectAuthSeams } = await import('./auth-seam');
    const root = repo({
      'a.ts': 'export const f = () => signIn() && signOut();\n',
    });
    const r = await detectAuthSeams(root, '.');
    expect(r.candidates.filter((c) => c.file === 'a.ts')).toHaveLength(1);
  });

  test('bare `user` is NOT vocabulary — it would bury the signal', async () => {
    const { detectAuthSeams } = await import('./auth-seam');
    const root = repo({
      'a.ts': 'export interface Row { user: string; userName: string }\n',
    });
    const r = await detectAuthSeams(root, '.');
    expect(r.candidates).toHaveLength(0);
  });

  test('truncation is REPORTED, so "no seam found" cannot mean "stopped looking"', async () => {
    const { detectAuthSeams } = await import('./auth-seam');
    const files: Record<string, string> = {};
    for (let i = 0; i < 12; i += 1)
      files[`src/f${i}.ts`] = 'export const x = 1;\n';
    const root = repo(files);
    const r = await detectAuthSeams(root, '.', 3);
    expect(r.truncated).toBe(true);
  });

  test('server and client tokens are labelled by plane', async () => {
    const { detectAuthSeams } = await import('./auth-seam');
    const root = repo({
      'server.ts': 'export const h = (req: any) => req.user.id;\n',
      'client.ts': 'export const s = () => useSession();\n',
    });
    const r = await detectAuthSeams(root, '.');
    expect(r.candidates.find((c) => c.file === 'server.ts')?.plane).toBe(
      'server'
    );
    expect(r.candidates.find((c) => c.file === 'client.ts')?.plane).toBe(
      'client'
    );
  });
});

describe('detectSurfaces — start profile and client-shipped code (never a server key)', () => {
  test('ts-server is a server; web is client-shipped', async () => {
    const root = repo({
      'package.json': pkg({
        name: 'root',
        private: true,
        workspaces: ['apps/*'],
      }),
      'apps/api/package.json': pkg({
        name: 'api',
        private: true,
        scripts: { start: 'bun src/index.ts' },
        dependencies: { elysia: '^1.0.0' },
      }),
      'apps/api/src/index.ts': 'export const x = 1;\n',
      'apps/site/package.json': pkg({
        name: 'site',
        private: true,
        scripts: { build: 'vite build' },
        dependencies: { svelte: '^5.0.0' },
      }),
      'apps/site/src/App.svelte': '<h1>x</h1>\n',
    });
    const r = await detectSurfaces({ cwd: root });
    expect(at(r, 'apps/api')).toMatchObject({
      startProfile: 'server',
      clientShipped: false,
    });
    expect(at(r, 'apps/site')).toMatchObject({
      startProfile: 'client',
      clientShipped: true,
    });
  });
});

describe('detectSurfaces — Go: every package main, handlers, distributed binaries', () => {
  test('every `package main` counts, not only files named main.go', async () => {
    const root = repo({
      'go.mod': 'module example.com/svc\n\ngo 1.25.13\n',
      'cmd/api/server.go': 'package main\n\nfunc main() {}\n',
      'cmd/worker/run.go': 'package main\n\nfunc main() {}\n',
      'internal/store/store.go': 'package store\n',
    });
    const z = at(await detectSurfaces({ cwd: root }), '.');
    expect(z?.surface).toBe('go');
    expect(z?.entrypoints?.map((e) => e.path).sort()).toEqual([
      'cmd/api/server.go',
      'cmd/worker/run.go',
    ]);
    expect(z?.entrypoint).toBe('cmd/api/server.go');
    expect(z?.kind).toBe('app');
    expect(z).toMatchObject({
      startProfile: 'server',
      clientShipped: false,
      preselect: true,
    });
  });

  test('a functions-framework-go handler is a server entrypoint', async () => {
    const root = repo({
      'go.mod': 'module example.com/fn\n',
      'function.go': [
        'package fn',
        'import "github.com/GoogleCloudPlatform/functions-framework-go/functions"',
        'func init() { functions.HTTP("Hello", hello) }',
      ].join('\n'),
    });
    const z = at(await detectSurfaces({ cwd: root }), '.');
    expect(z?.entrypoints?.[0]).toMatchObject({
      path: 'function.go',
      detail: 'functions-framework-go handler',
      clientShipped: false,
    });
    expect(z?.kind).toBe('app');
  });

  test('a goreleaser-released binary is client-shipped; the server beside it is not', async () => {
    const root = repo({
      'go.mod': 'module example.com/tool\n',
      '.goreleaser.yaml': 'builds:\n  - id: cli\n    main: ./cmd/cli\n',
      'cmd/cli/main.go': 'package main\nfunc main() {}\n',
      'cmd/api/main.go': 'package main\nfunc main() {}\n',
    });
    const z = at(await detectSurfaces({ cwd: root }), '.');
    const byPath = Object.fromEntries(
      (z?.entrypoints ?? []).map((e) => [e.path, e.clientShipped])
    );
    expect(byPath).toEqual({
      'cmd/api/main.go': false,
      'cmd/cli/main.go': true,
    });
    expect(z?.entrypoint).toBe('cmd/api/main.go');
    expect(z?.clientShipped).toBe(false);
  });

  test('a wails desktop app is client-shipped and never pre-selected (Go has no client profile)', async () => {
    const root = repo({
      'go.mod':
        'module example.com/desk\n\nrequire github.com/wailsapp/wails/v2 v2.9.0\n',
      'main.go': 'package main\nfunc main() {}\n',
    });
    const z = at(await detectSurfaces({ cwd: root }), '.');
    expect(z).toMatchObject({
      clientShipped: true,
      startProfile: 'client',
      preselect: false,
    });
    expect(
      z?.evidence.some((e) => e.kind === 'distribution.client-shipped')
    ).toBe(true);
  });

  test('a js/wasm build is client-shipped', async () => {
    const root = repo({
      'go.mod': 'module example.com/wasm\n',
      'main.go': '//go:build js && wasm\n\npackage main\nfunc main() {}\n',
    });
    expect(at(await detectSurfaces({ cwd: root }), '.')?.clientShipped).toBe(
      true
    );
  });
});

describe('detectSurfaces — Java: deep layouts, modules, aggregators, Android', () => {
  const springApp =
    'package com.acme.orders;\n@SpringBootApplication\npublic class OrdersApplication {\n  public static void main(String[] a) {}\n}\n';

  test('finds the entrypoint under src/main/java beyond depth 3', async () => {
    const root = repo({
      'svc/pom.xml': '<project><packaging>jar</packaging></project>\n',
      'svc/src/main/java/com/acme/orders/OrdersApplication.java': springApp,
      'svc/src/main/java/com/acme/orders/tools/Dump.java':
        'class Dump { public static void main(String[] a) {} }\n',
    });
    const z = at(await detectSurfaces({ cwd: root }), 'svc');
    expect(z?.surface).toBe('java');
    expect(z?.entrypoint).toBe(
      'svc/src/main/java/com/acme/orders/OrdersApplication.java'
    );
    expect(z?.kind).toBe('app');
    expect(z).toMatchObject({
      startProfile: 'server',
      clientShipped: false,
      preselect: true,
    });
  });

  test('an aggregator POM is never pre-selected; its deployable module is', async () => {
    const root = repo({
      'pom.xml':
        '<project><packaging>pom</packaging><modules><module>api</module></modules></project>\n',
      'api/pom.xml': '<project><packaging>jar</packaging></project>\n',
      'api/src/main/java/com/acme/api/ApiApplication.java': springApp,
    });
    const r = await detectSurfaces({ cwd: root });
    const agg = at(r, '.');
    expect(agg?.preselect).toBe(false);
    expect(
      agg?.evidence.some((e) => e.kind === 'deployability.aggregator')
    ).toBe(true);
    expect(at(r, 'api')?.preselect).toBe(true);
  });

  test('an Android module is refused: client-shipped, no Java client profile', async () => {
    const root = repo({
      'app/build.gradle.kts': 'plugins { id("com.android.application") }\n',
      'app/src/main/java/com/acme/MainActivity.java':
        'public class MainActivity {}\n',
    });
    const z = at(await detectSurfaces({ cwd: root }), 'app');
    expect(z?.surface).toBe('java');
    expect(z).toMatchObject({
      clientShipped: true,
      startProfile: 'client',
      preselect: false,
    });
    expect(z?.refusal).toContain('Android');
  });
});

describe('detectSurfaces — Rust: every binary, workspaces, Tauri and Leptos', () => {
  test('every binary is an entrypoint; src/main.rs leads', async () => {
    const root = repo({
      'Cargo.toml': '[package]\nname = "svc"\n',
      'src/main.rs': 'fn main() {}\n',
      'src/bin/worker.rs': 'fn main() {}\n',
    });
    const z = at(await detectSurfaces({ cwd: root }), '.');
    expect(z?.entrypoints?.map((e) => e.path)).toEqual([
      'src/main.rs',
      'src/bin/worker.rs',
    ]);
    expect(z?.entrypoint).toBe('src/main.rs');
    expect(z).toMatchObject({ startProfile: 'server', clientShipped: false });
  });

  test('a virtual workspace root is not pre-selected; its members are', async () => {
    const root = repo({
      'Cargo.toml': '[workspace]\nmembers = ["crates/api"]\n',
      'crates/api/Cargo.toml': '[package]\nname = "api"\n',
      'crates/api/src/main.rs': 'fn main() {}\n',
    });
    const r = await detectSurfaces({ cwd: root });
    expect(at(r, '.')?.preselect).toBe(false);
    expect(
      at(r, '.')?.evidence.some(
        (e) => e.kind === 'deployability.cargo-workspace'
      )
    ).toBe(true);
    expect(at(r, 'crates/api')?.preselect).toBe(true);
  });

  test('a Tauri src-tauri crate is client-shipped and never pre-selected', async () => {
    const root = repo({
      'desktop/src-tauri/Cargo.toml':
        '[package]\nname = "app"\n\n[dependencies]\ntauri = "2"\n',
      'desktop/src-tauri/src/main.rs': 'fn main() {}\n',
    });
    const z = at(await detectSurfaces({ cwd: root }), 'desktop/src-tauri');
    expect(z).toMatchObject({
      clientShipped: true,
      startProfile: 'client',
      preselect: false,
    });
  });

  test('Leptos: an ssr server stays a server, its hydrate target is marked client-shipped', async () => {
    const root = repo({
      'Cargo.toml':
        '[package]\nname = "site"\n\n[features]\nhydrate = ["leptos/hydrate"]\nssr = ["leptos/ssr"]\n',
      'src/main.rs': 'fn main() {}\n',
      'src/lib.rs': 'pub fn hydrate() {}\n',
    });
    const z = at(await detectSurfaces({ cwd: root }), '.');
    expect(z?.clientShipped).toBe(false);
    expect(
      z?.entrypoints?.find((e) => e.path === 'src/lib.rs')?.clientShipped
    ).toBe(true);
    expect(
      z?.evidence.some((e) => e.detail.includes('cfg(feature = "ssr")'))
    ).toBe(true);
  });

  test('Leptos hydrate with no server binary is client-shipped', async () => {
    const root = repo({
      'Cargo.toml':
        '[package]\nname = "csr"\n\n[features]\nhydrate = ["leptos/hydrate"]\n',
      'src/lib.rs': 'pub fn hydrate() {}\n',
    });
    expect(at(await detectSurfaces({ cwd: root }), '.')?.clientShipped).toBe(
      true
    );
  });
});

describe('detectSurfaces — Dart and Swift: app vs server picks the start profile', () => {
  test('a Flutter app is the client profile, and its ios/ runner is not a second surface', async () => {
    const root = repo({
      'pubspec.yaml':
        'name: app\ndependencies:\n  flutter:\n    sdk: flutter\n',
      'lib/main.dart': 'void main() {\n  runApp(App());\n}\n',
      'ios/Runner.xcodeproj/project.pbxproj': '// pbx\n',
      'ios/Runner/AppDelegate.swift':
        '@main @objc class AppDelegate: FlutterAppDelegate {}\n',
    });
    const r = await detectSurfaces({ cwd: root });
    const z = at(r, '.');
    expect(z?.surface).toBe('dart');
    expect(z).toMatchObject({
      startProfile: 'client',
      clientShipped: true,
      entrypoint: 'lib/main.dart',
      preselect: true,
    });
    expect(at(r, 'ios')).toBeUndefined();
  });

  test('a shelf server is the server profile, entrypoint bin/', async () => {
    const root = repo({
      'pubspec.yaml': 'name: api\ndependencies:\n  shelf: ^1.4.0\n',
      'bin/server.dart': 'void main(List<String> args) async {}\n',
    });
    const z = at(await detectSurfaces({ cwd: root }), '.');
    expect(z).toMatchObject({
      surface: 'dart',
      startProfile: 'server',
      clientShipped: false,
      entrypoint: 'bin/server.dart',
    });
  });

  test('an Xcode app (no Package.swift) becomes a swift client surface', async () => {
    const root = repo({
      'ios-app/Demo.xcodeproj/project.pbxproj': '// pbx\n',
      'ios-app/Demo/DemoApp.swift':
        'import SwiftUI\n@main\nstruct DemoApp: App {}\n',
    });
    const z = at(await detectSurfaces({ cwd: root }), 'ios-app');
    expect(z?.surface).toBe('swift');
    expect(z).toMatchObject({
      startProfile: 'client',
      clientShipped: true,
      entrypoint: 'ios-app/Demo/DemoApp.swift',
    });
    expect(z?.evidence.some((e) => e.kind === 'language.xcode-project')).toBe(
      true
    );
  });

  test('a Vapor server is the server profile and starts in configure.swift', async () => {
    const root = repo({
      'Package.swift':
        '// swift-tools-version:5.9\nlet p = Package(dependencies: [.package(url: "https://github.com/vapor/vapor.git", from: "4.0.0")])\n',
      'Sources/App/entrypoint.swift': '@main\nenum Entrypoint {}\n',
      'Sources/App/configure.swift':
        'func configure(_ app: Application) throws {}\n',
    });
    const z = at(await detectSurfaces({ cwd: root }), '.');
    expect(z).toMatchObject({
      surface: 'swift',
      startProfile: 'server',
      clientShipped: false,
      entrypoint: 'Sources/App/configure.swift',
    });
  });
});
