/**
 * Language-native entrypoints and distribution — where a zone starts, and
 * whether what it builds ships to end users.
 *
 * ## Why this is separate from the shallow probes
 *
 * `detect-surfaces.ts` probes a few files to depth 3, which is enough to call
 * a zone deployable and too shallow to say WHERE it starts: a Maven module's
 * `src/main/java/com/acme/App.java` sits at depth 5, a Go `package main` need
 * not be named `main.go`, and a Rust crate can carry several binaries. The
 * start profile needs the actual entrypoint, so these walks go deeper, one
 * language at a time, and only for zones that language nominated.
 *
 * ## Client-shipped code never receives a server key
 *
 * A server key (`project-api-key_…`) in a binary or bundle that end users
 * download is a leaked key. So this module also reports DISTRIBUTION: a Flutter
 * app, an Xcode app, a Tauri shell, a Leptos `hydrate` target, a Go binary
 * released with goreleaser or built for wasm/mobile/desktop. Such a zone is
 * `clientShipped`, its suggested start profile is `client`, and for a language
 * whose SDK has no client profile (Go, Java, Rust) initialise must refuse to
 * wire it rather than reach for a server key.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, dirname, join, relative, sep } from 'node:path';
import type { HarnessSurfaceName, StartProfile } from './types';
import type { Zone } from './topology';
import type { SurfaceEvidence } from './verdict';

/** One place a zone's process (or shipped artifact) starts. */
export interface DetectedEntrypoint {
  /** Repo-relative file. */
  readonly path: string;
  /** What it is, e.g. `go package main`, `rust binary`, `java @SpringBootApplication`. */
  readonly detail: string;
  /** True when this entrypoint's artifact ships to end users: never a server key. */
  readonly clientShipped: boolean;
}

export interface LanguageAnalysis {
  readonly evidence: SurfaceEvidence[];
  readonly entrypoints: DetectedEntrypoint[];
  /** The suggested entrypoint (server-side first), when the walk found one. */
  readonly entrypoint?: string;
  /** The zone's own artifact ships to end users. */
  readonly clientShipped: boolean;
  readonly startProfile: StartProfile;
  /** Set when initialise must not wire this zone at all, and why. */
  readonly refusal?: string;
}

/** Surfaces whose SDK ships a client profile (the `_package-surface` adapters' `profiles`). */
export const CLIENT_PROFILE_SURFACES: ReadonlySet<HarnessSurfaceName> =
  new Set<HarnessSurfaceName>(['web', 'dart', 'swift']);

const WALK_SKIP = new Set([
  'node_modules',
  'vendor',
  'testdata',
  'target',
  'build',
  'dist',
  'Pods',
  'DerivedData',
]);

const toRel = (root: string, abs: string): string =>
  relative(root, abs).split(sep).join('/');

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function isDir(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Bounded walk for files matching `ext`. Stops at directories that are their
 * own module (`stopAt` manifest present), so a nested module is not counted
 * twice — it is its own zone.
 */
async function walk(
  dir: string,
  opts: { ext: string; maxDepth: number; limit: number; stopAt?: string }
): Promise<string[]> {
  const out: string[] = [];
  async function go(d: string, depth: number): Promise<void> {
    if (depth > opts.maxDepth || out.length >= opts.limit) return;
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= opts.limit) return;
      if (e.name.startsWith('.')) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) {
        if (WALK_SKIP.has(e.name)) continue;
        if (opts.stopAt && (await isFile(join(p, opts.stopAt)))) continue;
        await go(p, depth + 1);
      } else if (e.name.endsWith(opts.ext)) {
        out.push(p);
      }
    }
  }
  await go(dir, 0);
  return out.sort();
}

/** Server entries first; within a tier, the shallowest path, then by name. */
function pickEntrypoint(
  entries: readonly DetectedEntrypoint[]
): DetectedEntrypoint | undefined {
  const depth = (p: string): number => p.split('/').length;
  return [...entries].sort(
    (a, b) =>
      Number(a.clientShipped) - Number(b.clientShipped) ||
      depth(a.path) - depth(b.path) ||
      a.path.localeCompare(b.path)
  )[0];
}

function finish(
  base: Omit<LanguageAnalysis, 'entrypoint' | 'clientShipped' | 'startProfile'>,
  zoneClientShipped: boolean
): LanguageAnalysis {
  const chosen = pickEntrypoint(base.entrypoints);
  const clientShipped = zoneClientShipped || (chosen?.clientShipped ?? false);
  return {
    ...base,
    ...(chosen !== undefined ? { entrypoint: chosen.path } : {}),
    clientShipped,
    startProfile: clientShipped ? 'client' : 'server',
  };
}

const entryEvidence = (e: DetectedEntrypoint): SurfaceEvidence => ({
  kind: 'entrypoint.language-native',
  path: e.path,
  detail: e.detail + (e.clientShipped ? ' (client-shipped)' : ''),
});

const shipped = (path: string, detail: string): SurfaceEvidence => ({
  kind: 'distribution.client-shipped',
  path,
  detail,
});

// ── Go ──────────────────────────────────────────────────────────────────────

const GO_CLIENT_DEPS: ReadonlyArray<readonly [RegExp, string]> = [
  [/github\.com\/wailsapp\/wails/, 'wails desktop app'],
  [/fyne\.io\/fyne/, 'fyne desktop/mobile app'],
  [/golang\.org\/x\/mobile/, 'gomobile app'],
];

async function goreleaserMains(
  root: string,
  abs: string
): Promise<string[] | null> {
  for (const dir of [abs, root]) {
    for (const name of [
      '.goreleaser.yml',
      '.goreleaser.yaml',
      'goreleaser.yml',
      'goreleaser.yaml',
    ]) {
      const text = await readText(join(dir, name));
      if (text === null) continue;
      const mains = [
        ...text.matchAll(/^\s*-?\s*main:\s*['"]?([^'"\s#]+)/gm),
      ].map((m) => toRel(abs, join(dir, m[1]!)));
      return mains.length > 0 ? mains : [''];
    }
  }
  return null;
}

async function analyzeGo(root: string, abs: string): Promise<LanguageAnalysis> {
  const evidence: SurfaceEvidence[] = [];
  const entrypoints: DetectedEntrypoint[] = [];
  const zoneRel = toRel(root, abs) || '.';
  const goMod = (await readText(join(abs, 'go.mod'))) ?? '';
  let zoneShipped = false;
  for (const [re, label] of GO_CLIENT_DEPS) {
    if (re.test(goMod)) {
      zoneShipped = true;
      evidence.push(
        shipped(`${zoneRel}/go.mod`, `${label}: ships to end users`)
      );
    }
  }
  if (await isFile(join(abs, 'wails.json'))) {
    zoneShipped = true;
    evidence.push(
      shipped(`${zoneRel}/wails.json`, 'wails desktop app: ships to end users')
    );
  }
  const released = await goreleaserMains(root, abs);
  if (released !== null) {
    evidence.push(
      shipped(
        zoneRel,
        `goreleaser releases ${released.map((m) => m || '.').join(', ')} as downloadable binaries`
      )
    );
  }

  const files = (
    await walk(abs, { ext: '.go', maxDepth: 6, limit: 2000, stopAt: 'go.mod' })
  ).filter((f) => !f.endsWith('_test.go'));
  const mainDirs = new Map<string, { file: string; wasm: boolean }>();
  for (const f of files) {
    const text = await readText(f);
    if (text === null) continue;
    const pkg = /^package\s+(\w+)/m.exec(text)?.[1];
    if (
      /github\.com\/GoogleCloudPlatform\/functions-framework-go\/functions|funcframework\.Register/.test(
        text
      )
    ) {
      entrypoints.push({
        path: toRel(root, f),
        detail: 'functions-framework-go handler',
        clientShipped: false,
      });
    }
    if (pkg !== 'main') continue;
    const dir = dirname(f);
    const wasm = /^\/\/(go:build|\s*\+build)\s.*\b(js|wasip1)\b/m.test(text);
    const prev = mainDirs.get(dir);
    const hasMain = /\bfunc\s+main\s*\(/.test(text);
    if (!prev || hasMain) {
      mainDirs.set(dir, {
        file: hasMain || !prev ? f : prev.file,
        wasm: (prev?.wasm ?? false) || wasm,
      });
    } else if (wasm) {
      prev.wasm = true;
    }
  }
  for (const [dir, { file, wasm }] of mainDirs) {
    const relDir = toRel(abs, dir);
    const viaRelease = released?.includes(relDir) ?? false;
    const clientShipped = zoneShipped || wasm || viaRelease;
    if (wasm) {
      evidence.push(
        shipped(
          toRel(root, file),
          'built for js/wasm or wasip1: runs outside your servers'
        )
      );
    }
    entrypoints.push({
      path: toRel(root, file),
      detail: 'go package main',
      clientShipped,
    });
  }
  return finish(
    { evidence: [...entrypoints.map(entryEvidence), ...evidence], entrypoints },
    zoneShipped && entrypoints.length === 0
  );
}

// ── Rust ────────────────────────────────────────────────────────────────────

/** The body of one `[section]` of a Cargo.toml, up to the next header. */
function tomlSection(text: string, header: string): string | null {
  const re = new RegExp(
    `^\\[${header.replace(/[.[\]]/g, '\\$&')}\\]\\s*$`,
    'm'
  );
  const m = re.exec(text);
  if (!m) return null;
  const rest = text.slice(m.index + m[0].length);
  const next = /^\[/m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

async function analyzeRust(
  root: string,
  abs: string
): Promise<LanguageAnalysis> {
  const evidence: SurfaceEvidence[] = [];
  const entrypoints: DetectedEntrypoint[] = [];
  const zoneRel = toRel(root, abs) || '.';
  const cargo = (await readText(join(abs, 'Cargo.toml'))) ?? '';
  const workspace = tomlSection(cargo, 'workspace');
  const hasPackage = tomlSection(cargo, 'package') !== null;
  if (workspace !== null) {
    const members = /members\s*=\s*\[([^\]]*)\]/m.exec(workspace)?.[1];
    const list = members
      ? [...members.matchAll(/"([^"]+)"/g)].map((m) => m[1]!)
      : [];
    evidence.push({
      kind: 'deployability.cargo-workspace',
      path: `${zoneRel}/Cargo.toml`,
      detail: `Cargo workspace${list.length ? ` (members: ${list.join(', ')})` : ''}${hasPackage ? '' : ' with no [package]: its members are the surfaces'}`,
    });
    if (!hasPackage) {
      return {
        evidence,
        entrypoints,
        clientShipped: false,
        startProfile: 'server',
      };
    }
  }

  let zoneShipped = false;
  const tauri =
    basename(abs) === 'src-tauri' ||
    (await isFile(join(abs, 'tauri.conf.json'))) ||
    (await isFile(join(abs, 'tauri.conf.json5'))) ||
    (await isFile(join(abs, 'Tauri.toml'))) ||
    /^\s*tauri\s*=/m.test(tomlSection(cargo, 'dependencies') ?? '');
  if (tauri) {
    zoneShipped = true;
    evidence.push(shipped(zoneRel, 'Tauri app: the binary ships to end users'));
  }
  const features = tomlSection(cargo, 'features') ?? '';
  const hydrate = /^\s*hydrate\s*=.*leptos\/hydrate/m.test(features);
  const ssr = /^\s*ssr\s*=.*leptos\/ssr/m.test(features);

  const bins: string[] = [];
  if (await isFile(join(abs, 'src', 'main.rs')))
    bins.push(join(abs, 'src', 'main.rs'));
  try {
    for (const e of await readdir(join(abs, 'src', 'bin'), {
      withFileTypes: true,
    })) {
      if (e.isFile() && e.name.endsWith('.rs'))
        bins.push(join(abs, 'src', 'bin', e.name));
      else if (
        e.isDirectory() &&
        (await isFile(join(abs, 'src', 'bin', e.name, 'main.rs')))
      ) {
        bins.push(join(abs, 'src', 'bin', e.name, 'main.rs'));
      }
    }
  } catch {
    // No src/bin — the common case.
  }
  for (const m of cargo.matchAll(
    /^\[\[bin\]\][^[]*?^\s*path\s*=\s*"([^"]+)"/gms
  )) {
    const p = join(abs, m[1]!);
    if (!bins.includes(p) && (await isFile(p))) bins.push(p);
  }
  for (const b of bins) {
    entrypoints.push({
      path: toRel(root, b),
      detail: 'rust binary',
      clientShipped: zoneShipped,
    });
  }
  if (hydrate) {
    const lib = join(abs, 'src', 'lib.rs');
    entrypoints.push({
      path: toRel(root, lib),
      detail: 'leptos `hydrate` target (wasm in the browser)',
      clientShipped: true,
    });
    evidence.push(
      shipped(
        `${zoneRel}/Cargo.toml`,
        ssr && bins.length > 0
          ? 'leptos `hydrate` compiles this crate to wasm for the browser: keep the start call ' +
              'and any key behind `#[cfg(feature = "ssr")]`'
          : 'leptos `hydrate` target: compiled to wasm for the browser'
      )
    );
    if (!(ssr && bins.length > 0)) zoneShipped = true;
  }
  return finish(
    { evidence: [...entrypoints.map(entryEvidence), ...evidence], entrypoints },
    zoneShipped
  );
}

// ── Java ────────────────────────────────────────────────────────────────────

async function analyzeJava(
  root: string,
  abs: string
): Promise<LanguageAnalysis> {
  const evidence: SurfaceEvidence[] = [];
  const entrypoints: DetectedEntrypoint[] = [];
  const zoneRel = toRel(root, abs) || '.';
  const pom = await readText(join(abs, 'pom.xml'));
  const gradle =
    (await readText(join(abs, 'build.gradle.kts'))) ??
    (await readText(join(abs, 'build.gradle')));
  const settings =
    (await readText(join(abs, 'settings.gradle.kts'))) ??
    (await readText(join(abs, 'settings.gradle')));

  const android =
    /com\.android\.(application|library)|^\s*android\s*\{/m.test(
      gradle ?? ''
    ) || (await isFile(join(abs, 'src', 'main', 'AndroidManifest.xml')));
  if (android) {
    const refusal =
      'Android module: it ships to devices, and the Java SDK has no client profile, so a ' +
      'server key would be compiled into the app. FireWeave does not wire Android modules.';
    evidence.push({
      kind: 'refusal.android-module',
      path: zoneRel,
      detail: refusal,
    });
    return {
      evidence,
      entrypoints,
      clientShipped: true,
      startProfile: 'client',
      refusal,
    };
  }

  const sourceRoot = join(abs, 'src', 'main', 'java');
  const hasSources = await isDir(sourceRoot);
  if (pom !== null && /<packaging>\s*pom\s*<\/packaging>/.test(pom)) {
    const modules = [...pom.matchAll(/<module>\s*([^<\s]+)\s*<\/module>/g)].map(
      (m) => m[1]!
    );
    evidence.push({
      kind: 'deployability.aggregator',
      path: `${zoneRel}/pom.xml`,
      detail:
        'aggregator POM (packaging pom)' +
        (modules.length
          ? `: select its deployable modules (${modules.join(', ')}) instead`
          : ''),
    });
    return {
      evidence,
      entrypoints,
      clientShipped: false,
      startProfile: 'server',
    };
  }
  if (
    pom === null &&
    settings !== null &&
    /\binclude\b/.test(settings) &&
    !hasSources
  ) {
    evidence.push({
      kind: 'deployability.aggregator',
      path: zoneRel,
      detail:
        'Gradle build root with included projects and no sources: select its deployable projects instead',
    });
    return {
      evidence,
      entrypoints,
      clientShipped: false,
      startProfile: 'server',
    };
  }

  for (const f of await walk(sourceRoot, {
    ext: '.java',
    maxDepth: 12,
    limit: 3000,
  })) {
    const text = await readText(f);
    if (text === null) continue;
    if (/@SpringBootApplication\b/.test(text)) {
      entrypoints.push({
        path: toRel(root, f),
        detail: 'java @SpringBootApplication',
        clientShipped: false,
      });
    } else if (/\bstatic\s+void\s+main\s*\(/.test(text)) {
      entrypoints.push({
        path: toRel(root, f),
        detail: 'java main',
        clientShipped: false,
      });
    }
  }
  // Spring Boot's application class is the entrypoint even when a test-only
  // `main` helper sits shallower.
  const spring = entrypoints.filter((e) => e.detail.includes('SpringBoot'));
  const ranked = spring.length > 0 ? spring : entrypoints;
  const chosen = pickEntrypoint(ranked);
  return {
    evidence: entrypoints.map(entryEvidence),
    entrypoints,
    ...(chosen !== undefined ? { entrypoint: chosen.path } : {}),
    clientShipped: false,
    startProfile: 'server',
  };
}

// ── Dart ────────────────────────────────────────────────────────────────────

/** True when pubspec.yaml depends on the Flutter SDK. */
export function isFlutterPubspec(pubspec: string): boolean {
  return /^\s+flutter:\s*\n\s+sdk:\s*flutter\b/m.test(pubspec);
}

const DART_SERVER_DEPS = ['shelf', 'shelf_router', 'dart_frog'];

async function analyzeDart(
  root: string,
  abs: string
): Promise<LanguageAnalysis> {
  const evidence: SurfaceEvidence[] = [];
  const entrypoints: DetectedEntrypoint[] = [];
  const zoneRel = toRel(root, abs) || '.';
  const pubspec = (await readText(join(abs, 'pubspec.yaml'))) ?? '';
  if (isFlutterPubspec(pubspec)) {
    evidence.push(
      shipped(
        `${zoneRel}/pubspec.yaml`,
        'Flutter app: ships to devices and browsers (client profile, browser key)'
      )
    );
    if (await isFile(join(abs, 'lib', 'main.dart'))) {
      entrypoints.push({
        path: toRel(root, join(abs, 'lib', 'main.dart')),
        detail: 'flutter main',
        clientShipped: true,
      });
    }
    return finish(
      {
        evidence: [...entrypoints.map(entryEvidence), ...evidence],
        entrypoints,
      },
      true
    );
  }
  const serverDeps = DART_SERVER_DEPS.filter((d) =>
    new RegExp(`^\\s+${d}\\s*:`, 'm').test(pubspec)
  );
  if (serverDeps.length > 0) {
    evidence.push({
      kind: 'language.server-framework-dep',
      path: `${zoneRel}/pubspec.yaml`,
      detail: `depends on ${serverDeps.join(', ')} (server profile)`,
    });
  }
  if (
    serverDeps.includes('dart_frog') &&
    (await isFile(join(abs, 'main.dart')))
  ) {
    entrypoints.push({
      path: toRel(root, join(abs, 'main.dart')),
      detail: 'dart_frog custom entrypoint',
      clientShipped: false,
    });
  }
  try {
    for (const e of await readdir(join(abs, 'bin'), { withFileTypes: true })) {
      if (!e.isFile() || !e.name.endsWith('.dart')) continue;
      const p = join(abs, 'bin', e.name);
      if (/\bmain\s*\(/.test((await readText(p)) ?? '')) {
        entrypoints.push({
          path: toRel(root, p),
          detail: 'dart bin/ entrypoint',
          clientShipped: false,
        });
      }
    }
  } catch {
    // No bin/ — not a server or CLI.
  }
  let webShipped = false;
  if (
    entrypoints.length === 0 &&
    (await isFile(join(abs, 'web', 'main.dart')))
  ) {
    webShipped = true;
    entrypoints.push({
      path: toRel(root, join(abs, 'web', 'main.dart')),
      detail: 'dart web app',
      clientShipped: true,
    });
    evidence.push(
      shipped(
        `${zoneRel}/web`,
        'Dart web app: compiled to JavaScript for the browser'
      )
    );
  }
  return finish(
    { evidence: [...entrypoints.map(entryEvidence), ...evidence], entrypoints },
    webShipped
  );
}

// ── Swift ───────────────────────────────────────────────────────────────────

const SWIFT_SERVER_DEPS: ReadonlyArray<readonly [RegExp, string]> = [
  [/vapor\/vapor/i, 'Vapor'],
  [/hummingbird-project\/hummingbird/i, 'Hummingbird'],
];

const SWIFT_APP_MARKERS =
  /@main\s+struct\s+\w+\s*:\s*App\b|@UIApplicationMain|@NSApplicationMain|\bUIApplicationMain\s*\(|:\s*[^{]*\b(UI|NS)ApplicationDelegate\b/;

/** `*.xcodeproj` directly inside `dir`. */
export async function xcodeProjectsIn(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir, { withFileTypes: true }))
      .filter((e) => e.isDirectory() && e.name.endsWith('.xcodeproj'))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

async function analyzeSwift(
  root: string,
  abs: string
): Promise<LanguageAnalysis> {
  const evidence: SurfaceEvidence[] = [];
  const entrypoints: DetectedEntrypoint[] = [];
  const zoneRel = toRel(root, abs) || '.';
  const manifest = (await readText(join(abs, 'Package.swift'))) ?? '';
  const server = SWIFT_SERVER_DEPS.filter(([re]) => re.test(manifest)).map(
    ([, n]) => n
  );
  const xcode = await xcodeProjectsIn(abs);
  for (const f of await walk(abs, {
    ext: '.swift',
    maxDepth: 6,
    limit: 1500,
    stopAt: 'Package.swift',
  })) {
    const text = await readText(f);
    if (text === null) continue;
    const rel = toRel(root, f);
    if (SWIFT_APP_MARKERS.test(text)) {
      entrypoints.push({
        path: rel,
        detail: 'swift app entry (@main App / app delegate)',
        clientShipped: true,
      });
    } else if (server.length > 0 && /(^|\/)configure\.swift$/.test(rel)) {
      entrypoints.push({
        path: rel,
        detail: `${server.join('/')} configure (start goes here)`,
        clientShipped: false,
      });
    } else if (/@main\b/.test(text) || /(^|\/)main\.swift$/.test(rel)) {
      entrypoints.push({
        path: rel,
        detail: 'swift executable entry',
        clientShipped: server.length === 0 && xcode.length > 0,
      });
    }
  }
  if (server.length > 0) {
    evidence.push({
      kind: 'language.server-framework-dep',
      path: `${zoneRel}/Package.swift`,
      detail: `depends on ${server.join(', ')} (server profile)`,
    });
  }
  const app =
    server.length === 0 &&
    (xcode.length > 0 || entrypoints.some((e) => e.clientShipped));
  if (app) {
    evidence.push(
      shipped(
        xcode.length > 0 ? `${zoneRel}/${xcode[0]}` : zoneRel,
        'Apple app target: ships to devices (client profile, browser key from Info.plist)'
      )
    );
  }
  // A configure.swift outranks the @main entry on a server: the plan starts FireWeave in configure.
  const configure = entrypoints.find((e) => e.detail.includes('configure'));
  const analysis = finish(
    { evidence: [...entrypoints.map(entryEvidence), ...evidence], entrypoints },
    app
  );
  return configure && !app
    ? { ...analysis, entrypoint: configure.path }
    : analysis;
}

// ── Entry ───────────────────────────────────────────────────────────────────

/**
 * Deep entrypoint and distribution analysis for one zone and one nominated
 * surface. Returns null for surfaces this module does not analyse (ts-server,
 * web and python keep the shallow probes).
 */
export async function analyzeLanguage(
  root: string,
  zone: Zone,
  surface: HarnessSurfaceName
): Promise<LanguageAnalysis | null> {
  const abs = zone.path === '.' ? root : join(root, zone.path);
  switch (surface) {
    case 'go':
      return zone.manifestFiles.includes('go.mod')
        ? analyzeGo(root, abs)
        : null;
    case 'rust':
      return zone.manifestFiles.includes('Cargo.toml')
        ? analyzeRust(root, abs)
        : null;
    case 'java':
      return zone.manifestFiles.some(
        (f) => f === 'pom.xml' || f.startsWith('build.gradle')
      )
        ? analyzeJava(root, abs)
        : null;
    case 'dart':
      return zone.manifestFiles.includes('pubspec.yaml')
        ? analyzeDart(root, abs)
        : null;
    case 'swift':
      return analyzeSwift(root, abs);
    default:
      return null;
  }
}

/**
 * Directories holding an Xcode project that topology did not make a zone (an
 * Xcode app has no manifest topology knows). Skips the `ios/`/`macos/` runner
 * of a Flutter or React Native project, which belongs to that project's zone.
 */
export async function findXcodeZoneDirs(
  root: string,
  maxDepth = 3
): Promise<string[]> {
  const out: string[] = [];
  async function go(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.some((e) => e.isDirectory() && e.name.endsWith('.xcodeproj'))) {
      const parent = dirname(dir);
      const hostedBy =
        (await isFile(join(parent, 'pubspec.yaml'))) ||
        /"react-native"/.test(
          (await readText(join(parent, 'package.json'))) ?? ''
        );
      if (!hostedBy) out.push(toRel(root, dir) || '.');
    }
    for (const e of entries) {
      if (
        !e.isDirectory() ||
        e.name.startsWith('.') ||
        e.name.endsWith('.xcodeproj')
      )
        continue;
      if (WALK_SKIP.has(e.name) || e.name.endsWith('.xcworkspace')) continue;
      await go(join(dir, e.name), depth + 1);
    }
  }
  await go(root, 0);
  return out;
}
