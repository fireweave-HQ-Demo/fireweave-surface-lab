/**
 * detect_surfaces — deterministic surface detection.
 *
 * ## What this replaces
 *
 * Surface detection used to be one clause of skill prose ("Detect surface(s) →
 * tier + harness profile") with no code behind it. Every repo got whatever the
 * reading agent inferred that day, and there was no artifact to disagree with:
 * a wrong surface showed up much later as a harness in the wrong idiom, or a
 * `verify_prod_path` that skipped a surface nobody meant to defer.
 *
 * ## The chain, in order
 *
 *   topology → language → deployability evidence → app-vs-library → verdict
 *
 * Each stage narrows the previous one, and each contributes EVIDENCE rather
 * than a score (see `verdict.ts` for why there is no confidence float).
 *
 * ## app-vs-library is a graph question, not a naming one
 *
 * The signal that actually separates them is the workspace dependency graph
 * plus entrypoint evidence: a zone nothing depends on, that has an entrypoint,
 * is an app; a zone many things depend on, with no entrypoint, is a library.
 * Directory names (`packages/` vs `apps/`) are a convention this detector
 * deliberately does not trust — plenty of repos deploy out of `packages/`, and
 * treating the folder name as the answer is how a deployed service silently
 * gets classified as a library and never instrumented.
 *
 * Libraries are still REPORTED. They are simply reported as libraries, so the
 * selection step can show them greyed rather than pretend they do not exist —
 * a library the user knows is actually deployed must remain selectable.
 *
 * ## Where it starts, and who receives it
 *
 * The shallow probes below decide deployability. `language-entrypoints.ts`
 * walks deeper for Go, Java, Rust, Dart and Swift to find the entrypoints the
 * start profile needs, and reports whether the zone's artifact ships to end
 * users (`clientShipped`): such code never receives a server key, and its
 * suggested `startProfile` is `client`.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { HarnessSurfaceName, StartProfile } from './types';
import { discoverZones, type UnreadableZone, type Zone } from './topology';
import {
  analyzeLanguage,
  findXcodeZoneDirs,
  xcodeProjectsIn,
  type DetectedEntrypoint,
  type LanguageAnalysis,
} from './language-entrypoints';
import { type SurfaceEvidence, type SurfaceVerdict } from './verdict';
import { detectEntrypointSource, isWorkspaceRoot } from '../select';

export type ZoneKind = 'app' | 'library' | 'unknown';

export interface DetectedSurface {
  /** Repo-relative zone path (`.` for the repo root). */
  readonly path: string;
  /** The surface FireWeave would scaffold, or null when undecidable. */
  readonly surface: HarnessSurfaceName | null;
  /** Other surfaces that were genuinely defensible here (verdict `ambiguous`). */
  readonly alternatives: readonly HarnessSurfaceName[];
  readonly verdict: SurfaceVerdict;
  readonly kind: ZoneKind;
  /** Suggested entrypoint file, when one was found. */
  readonly entrypoint?: string;
  readonly evidence: readonly SurfaceEvidence[];
  /**
   * Start file found after the verdict. The surface filter reads this.
   * It is not language evidence and does not change `kind` or `verdict`.
   */
  readonly entrypointSource?: string;
  /** True only for `.` when the repo is a workspace aggregator. */
  readonly workspaceRoot?: boolean;
  /**
   * The start profile to suggest for this surface: `client` for code that
   * ships to end users (browser, Flutter, Apple app), `server` otherwise.
   * Absent when no surface was decided.
   */
  readonly startProfile?: StartProfile;
  /**
   * True when this zone's artifact ships to end users (a bundle, an app, a
   * downloadable binary): it must NEVER receive a server key. For Go, Java and
   * Rust, whose SDKs have no client profile, initialise refuses to wire it.
   */
  readonly clientShipped: boolean;
  /** Every entrypoint the deep walk found (Go, Java, Rust, Dart, Swift), each with its own `clientShipped`. */
  readonly entrypoints?: readonly DetectedEntrypoint[];
  /** Present when initialise must not wire this zone at all (an Android module), and why. */
  readonly refusal?: string;
}

export interface DetectSurfacesResult {
  readonly surfaces: readonly DetectedSurface[];
  /** Zones that could not be read. NEVER empty-and-ignored — the caller reports these. */
  readonly unreadable: readonly UnreadableZone[];
  /** Zones examined, including those that produced no surface. */
  readonly zonesExamined: number;
}

/** package.json dependency-ish fields, as one map. */
function allDeps(manifest: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
    const v = manifest[field];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [k, spec] of Object.entries(v as Record<string, unknown>)) {
        if (typeof spec === 'string') out[k] = spec;
      }
    }
  }
  return out;
}

const WEB_FRAMEWORK_DEPS = [
  'svelte',
  '@sveltejs/kit',
  'react-dom',
  'vue',
  'next',
  'nuxt',
  'vite',
  '@angular/core',
  'solid-js',
  'astro',
];

const SERVER_RUNTIME_DEPS = [
  'express',
  'fastify',
  'elysia',
  'koa',
  '@nestjs/core',
  'hono',
  'restify',
];

async function listFiles(dir: string, limit = 400): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string, depth: number): Promise<void> {
    if (depth > 3 || out.length >= limit) return;
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= limit) return;
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const p = join(d, e.name);
      if (e.isDirectory()) await walk(p, depth + 1);
      else out.push(p);
    }
  }
  await walk(dir, 0);
  return out;
}

function extCounts(files: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of files) {
    const m = /\.[^./\\]+$/.exec(f);
    if (m) counts[m[0]] = (counts[m[0]] ?? 0) + 1;
  }
  return counts;
}

/**
 * Candidate surfaces for a zone, each with the evidence that nominated it.
 *
 * Returns MORE than one deliberately when more than one is defensible — a
 * SvelteKit app with a server directory really is both, and collapsing that to
 * a single guess here is what makes the verdict a lie rather than `ambiguous`.
 */
function nominateSurfaces(
  zone: Zone,
  files: readonly string[]
): Map<HarnessSurfaceName, SurfaceEvidence[]> {
  const nominated = new Map<HarnessSurfaceName, SurfaceEvidence[]>();
  const add = (s: HarnessSurfaceName, ev: SurfaceEvidence): void => {
    const list = nominated.get(s) ?? [];
    list.push(ev);
    nominated.set(s, list);
  };
  const counts = extCounts(files);
  const m0: Record<string, unknown> = zone.manifest ?? {};
  const deps = zone.manifest ? allDeps(zone.manifest) : {};

  if (zone.manifestFiles.includes('package.json')) {
    const web = WEB_FRAMEWORK_DEPS.filter((d) => d in deps);
    if (web.length > 0) {
      add('web', {
        kind: 'language.web-framework-dep',
        path: `${zone.path}/package.json`,
        detail: `depends on ${web.join(', ')}`,
      });
    }
    const server = SERVER_RUNTIME_DEPS.filter((d) => d in deps);
    if (server.length > 0) {
      add('ts-server', {
        kind: 'language.server-framework-dep',
        path: `${zone.path}/package.json`,
        detail: `depends on ${server.join(', ')}`,
      });
    }
    const components = (counts['.svelte'] ?? 0) + (counts['.vue'] ?? 0);
    if (components > 0) {
      add('web', {
        kind: 'language.component-files',
        path: zone.path,
        detail: `${components} .svelte/.vue file(s)`,
      });
    }
    // Positive browser signals that do NOT depend on a framework dependency,
    // gathered BEFORE the absence inference below — otherwise a zero-dependency
    // browser package trips both rules and reads as `ambiguous` (or worse, as
    // ts-server, since that sorts first).
    let browserSignals = components;
    if (typeof m0.browser !== 'undefined') {
      browserSignals += 1;
      add('web', {
        kind: 'language.browser-field',
        path: `${zone.path}/package.json`,
        detail: 'package.json declares a `browser` field',
      });
    }
    if (files.some((f) => /\/index\.html$/.test(f))) {
      browserSignals += 1;
      add('web', {
        kind: 'language.index-html',
        path: zone.path,
        detail: 'index.html present — a browser entry document',
      });
    }

    const tsish =
      (counts['.ts'] ?? 0) +
      (counts['.tsx'] ?? 0) +
      (counts['.js'] ?? 0) +
      (counts['.mjs'] ?? 0);
    // TS/JS with NO browser signal at all resolves to `ts-server`, it is not
    // ambiguous. Browser code cannot ship without a bundler or framework, so the
    // ABSENCE of every web signal is itself evidence, not missing information.
    //
    // An earlier draft nominated both surfaces here "rather than guessing", and
    // on this monorepo that turned 17 of 23 zones ambiguous — which does not
    // make the detector honest, it makes the selection step unusable and trains
    // the user to click through prompts. `ambiguous` has to be rare enough that
    // it still means something when it fires.
    if (web.length === 0 && browserSignals === 0 && tsish > 0) {
      add('ts-server', {
        kind: 'language.typescript-sources',
        path: zone.path,
        detail: `${tsish} TS/JS source file(s), no browser framework or component file present`,
      });
    }
    const engines = m0.engines;
    if (engines !== null && typeof engines === 'object' && 'node' in engines) {
      add('ts-server', {
        kind: 'language.engines-node',
        path: `${zone.path}/package.json`,
        detail: 'engines.node declared — targets a server runtime',
      });
    }
  }

  const byManifest: ReadonlyArray<readonly [string, HarnessSurfaceName]> = [
    ['go.mod', 'go'],
    ['Cargo.toml', 'rust'],
    ['pyproject.toml', 'python'],
    ['setup.py', 'python'],
    ['requirements.txt', 'python'],
    ['pom.xml', 'java'],
    ['build.gradle', 'java'],
    ['build.gradle.kts', 'java'],
    ['Package.swift', 'swift'],
    ['pubspec.yaml', 'dart'],
  ];
  for (const [file, surface] of byManifest) {
    if (zone.manifestFiles.includes(file)) {
      add(surface, {
        kind: 'language.manifest',
        path: `${zone.path}/${file}`,
        detail: `${file} declares a ${surface} module`,
      });
    }
  }
  return nominated;
}

/** Deployability evidence — does this zone look like something that RUNS? */
async function entrypointEvidence(
  root: string,
  zone: Zone,
  files: readonly string[]
): Promise<{ evidence: SurfaceEvidence[]; entrypoint?: string }> {
  const evidence: SurfaceEvidence[] = [];
  let entrypoint: string | undefined;
  const abs = zone.path === '.' ? root : join(root, zone.path);

  const m = zone.manifest;
  if (m) {
    const scripts = m.scripts;
    if (scripts && typeof scripts === 'object') {
      const s = scripts as Record<string, unknown>;
      // `dev` is deliberately NOT here. Libraries routinely carry a `dev`
      // script (watch builds, storybook), so counting it as deployability
      // evidence classifies component libraries as apps, and a positive
      // language read then marks them `confirmed`.
      for (const key of ['start', 'serve']) {
        if (typeof s[key] === 'string') {
          evidence.push({
            kind: 'entrypoint.package-json-script',
            path: `${zone.path}/package.json`,
            detail: `scripts.${key} = ${String(s[key]).slice(0, 60)}`,
          });
          break;
        }
      }
      // A `build` script is WEAK on its own — every library builds. It becomes
      // deployability evidence only for a zone nothing imports (see
      // classifyKind), where the artifact it produces has no consumer except a
      // deploy. This is what recognises a monorepo web app whose Dockerfile
      // lives centrally in infra/ rather than beside its package.json — the
      // most common shape there is, and one an entrypoint-only rule misses.
      if (typeof s.build === 'string') {
        evidence.push({
          kind: 'deployability.build-script',
          path: `${zone.path}/package.json`,
          detail: `scripts.build = ${String(s.build).slice(0, 60)}`,
        });
      }
    }
    if (m.bin !== undefined) {
      evidence.push({
        kind: 'entrypoint.package-json-bin',
        path: `${zone.path}/package.json`,
        detail: 'declares a bin entry',
      });
    }
    if (m.private === true) {
      evidence.push({
        kind: 'deployability.private-package',
        path: `${zone.path}/package.json`,
        detail:
          'private: true — not published, so it is consumed by deploy or by siblings',
      });
    }
  }

  for (const marker of [
    'Dockerfile',
    'Procfile',
    'fly.toml',
    'render.yaml',
    'vercel.json',
  ]) {
    if (files.some((f) => f === join(abs, marker))) {
      evidence.push({
        kind: 'entrypoint.deploy-manifest',
        path: `${zone.path}/${marker}`,
        detail: `${marker} present — this zone is deployed as a unit`,
      });
    }
  }

  // Language-native entrypoints. Cheap content probes, bounded to a few files.
  const probes: ReadonlyArray<readonly [RegExp, RegExp, string]> = [
    [/\/main\.go$/, /func\s+main\s*\(/, 'go func main()'],
    [/\/main\.rs$/, /fn\s+main\s*\(/, 'rust fn main()'],
    [
      /\/(main|__main__|app|wsgi|asgi)\.py$/,
      /if\s+__name__\s*==|app\s*=\s*/,
      'python entrypoint',
    ],
    [
      /\.java$/,
      /@SpringBootApplication|static\s+void\s+main\s*\(/,
      'java main/SpringBoot',
    ],
    [/\.swift$/, /@main\b/, 'swift @main'],
    [/\/main\.dart$/, /void\s+main\s*\(/, 'dart void main()'],
  ];
  for (const [nameRe, bodyRe, label] of probes) {
    const hit = files.find((f) => nameRe.test(f));
    if (!hit) continue;
    try {
      const text = await readFile(hit, 'utf8');
      if (bodyRe.test(text)) {
        entrypoint = hit.slice(root.length + 1);
        evidence.push({
          kind: 'entrypoint.language-native',
          path: entrypoint,
          detail: label,
        });
      }
    } catch {
      // Unreadable single file is not a zone-level failure; absence of this
      // evidence simply weakens the verdict, which is the honest outcome.
    }
  }
  return { evidence, ...(entrypoint !== undefined ? { entrypoint } : {}) };
}

/** Workspace dependency in-degree: how many sibling zones depend on each package name. */
function buildInDegree(zones: readonly Zone[]): Map<string, number> {
  const nameOf = new Map<string, string>();
  for (const z of zones) {
    const n = z.manifest?.name;
    if (typeof n === 'string') nameOf.set(z.path, n);
  }
  const known = new Set(nameOf.values());
  const inDegree = new Map<string, number>();
  for (const n of known) inDegree.set(n, 0);
  for (const z of zones) {
    if (!z.manifest) continue;
    for (const dep of Object.keys(allDeps(z.manifest))) {
      if (known.has(dep)) inDegree.set(dep, (inDegree.get(dep) ?? 0) + 1);
    }
  }
  return inDegree;
}

function classifyKind(
  zone: Zone,
  inDegree: Map<string, number>,
  hasEntrypointEvidence: boolean,
  buildsArtifact = false
): { kind: ZoneKind; evidence: SurfaceEvidence[] } {
  const evidence: SurfaceEvidence[] = [];
  const name =
    typeof zone.manifest?.name === 'string' ? zone.manifest.name : undefined;
  const dependents = name !== undefined ? (inDegree.get(name) ?? 0) : 0;

  // A build script counts as deployability ONLY for a zone nothing imports:
  // the artifact it produces has no in-repo consumer, so a deploy is the only
  // thing it can be for. For a depended-upon zone the same script means the
  // opposite — it is building for its siblings — so it must not promote there.
  // A published package (versioned, with exports) that only builds is a library
  // someone else imports. A build script is not a listener. A private site
  // with no in-repo importer is still an app: the artifact is for a deploy.
  const published =
    zone.manifest?.private !== true &&
    (zone.manifest?.exports !== undefined || zone.manifest?.files !== undefined);
  const hasEntrypoint =
    hasEntrypointEvidence || (buildsArtifact && dependents === 0 && !published);
  if (buildsArtifact && dependents === 0 && !hasEntrypointEvidence && !published) {
    evidence.push({
      kind: 'deployability.unimported-build',
      path: zone.path,
      detail: 'builds an artifact and no workspace package imports it',
    });
  }

  if (hasEntrypoint && dependents === 0) {
    evidence.push({
      kind: 'graph.root-with-entrypoint',
      path: zone.path,
      detail: 'nothing in the workspace depends on it and it has an entrypoint',
    });
    return { kind: 'app', evidence };
  }
  if (!hasEntrypoint && dependents > 0) {
    evidence.push({
      kind: 'graph.depended-upon-no-entrypoint',
      path: zone.path,
      detail: `${dependents} workspace package(s) depend on it and it has no entrypoint`,
    });
    return { kind: 'library', evidence };
  }
  if (hasEntrypoint && dependents > 0) {
    // Both signals fire: a deployable that siblings also import. Real, and it
    // stays an app — being importable does not stop it being deployed.
    evidence.push({
      kind: 'graph.entrypoint-and-dependents',
      path: zone.path,
      detail: `has an entrypoint AND ${dependents} dependent(s) — deployable and importable`,
    });
    return { kind: 'app', evidence };
  }
  evidence.push({
    kind: 'graph.no-signal',
    path: zone.path,
    detail: 'no entrypoint and nothing depends on it',
  });
  return { kind: 'unknown', evidence };
}

/**
 * Language evidence that is an inference from ABSENCE rather than a positive
 * finding: "TS files and no browser signal, therefore server". Sound as a
 * default, but it is the one nomination that can be wrong while every input is
 * correct — a zero-dependency browser library looks exactly like this.
 */
const ABSENCE_INFERRED_EVIDENCE = new Set(['language.typescript-sources']);

function decideVerdict(
  nominated: Map<HarnessSurfaceName, SurfaceEvidence[]>,
  kind: ZoneKind
): {
  verdict: SurfaceVerdict;
  surface: HarnessSurfaceName | null;
  alternatives: HarnessSurfaceName[];
} {
  const names = [...nominated.keys()].sort();
  if (names.length === 0) {
    return { verdict: 'undecidable', surface: null, alternatives: [] };
  }
  if (names.length > 1) {
    // Ambiguous is a REPORTED state, not a coin flip. The first name is offered
    // as the lead only so the caller has something to render; the caller must
    // ask. The surface filter holds this row back on the verdict itself.
    return {
      verdict: 'ambiguous',
      surface: names[0]!,
      alternatives: names.slice(1),
    };
  }
  const only = names[0]!;
  const support = nominated.get(only) ?? [];
  const positivelyEvidenced = support.some(
    (e) => !ABSENCE_INFERRED_EVIDENCE.has(e.kind)
  );
  // `confirmed` requires POSITIVE language evidence, not merely a deployable
  // zone. Without this, a zero-dependency browser SDK reads as `confirmed
  // ts-server` — and a confidently wrong answer is worse than an uncertain one,
  // because the surface filter keeps a `confirmed` app and nobody looks again. Verified
  // against a real multi-language SDK repo, where exactly that happened.
  if (kind === 'app' && positivelyEvidenced) {
    return { verdict: 'confirmed', surface: only, alternatives: [] };
  }
  return { verdict: 'probable', surface: only, alternatives: [] };
}

export interface DetectSurfacesOptions {
  /** Repo root. */
  readonly cwd: string;
}

/** Run the full detection chain over a repo. */
export async function detectSurfaces(
  opts: DetectSurfacesOptions
): Promise<DetectSurfacesResult> {
  const root = opts.cwd;
  const discovered = await discoverZones(root);
  const unreadable = discovered.unreadable;
  // An Xcode app has no manifest topology knows, so its directory is added
  // as a zone here (the Flutter / React Native runner directories excluded).
  const known = new Set(discovered.zones.map((z) => z.path));
  const zones: Zone[] = [...discovered.zones];
  for (const dir of await findXcodeZoneDirs(root)) {
    if (!known.has(dir))
      zones.push({ path: dir, via: 'module', manifestFiles: [] });
  }
  zones.sort((a, b) => a.path.localeCompare(b.path));
  const inDegree = buildInDegree(zones);

  const workspaceRoot = await isWorkspaceRoot(root);
  const surfaces: DetectedSurface[] = [];
  for (const zone of zones) {
    const abs = zone.path === '.' ? root : join(root, zone.path);
    const files = await listFiles(abs);
    const nominated = nominateSurfaces(zone, files);
    const xcode = await xcodeProjectsIn(abs);
    if (xcode.length > 0) {
      nominated.set('swift', [
        ...(nominated.get('swift') ?? []),
        {
          kind: 'language.xcode-project',
          path: `${zone.path}/${xcode[0]}`,
          detail: `Xcode project ${xcode.join(', ')}`,
        },
      ]);
    }
    const { evidence: probeEv, entrypoint: probeEntrypoint } =
      await entrypointEvidence(root, zone, files);
    // Deep, per-language entrypoint walks for every language this zone
    // nominated; their entrypoints count as deployability evidence too.
    const analyses = new Map<HarnessSurfaceName, LanguageAnalysis>();
    for (const s of nominated.keys()) {
      const a = await analyzeLanguage(root, zone, s);
      if (a) analyses.set(s, a);
    }
    const probed = new Set(
      probeEv.filter((e) => e.kind.startsWith('entrypoint.')).map((e) => e.path)
    );
    const entryEv = [
      ...probeEv,
      ...[...analyses.values()]
        .flatMap((a) => a.evidence)
        .filter(
          (e) => !(e.kind.startsWith('entrypoint.') && probed.has(e.path))
        ),
    ];
    const hasEntrypoint = entryEv.some((e) => e.kind.startsWith('entrypoint.'));
    const buildsArtifact = entryEv.some(
      (e) => e.kind === 'deployability.build-script'
    );
    const { kind, evidence: kindEv } = classifyKind(
      zone,
      inDegree,
      hasEntrypoint,
      buildsArtifact
    );
    const { verdict, surface, alternatives } = decideVerdict(nominated, kind);
    const analysis = surface !== null ? analyses.get(surface) : undefined;
    const entrypoint = analysis?.entrypoint ?? probeEntrypoint;
    const clientShipped =
      surface === 'web' || (analysis?.clientShipped ?? false);
    const startProfile: StartProfile | undefined =
      surface === null
        ? undefined
        : (analysis?.startProfile ?? (surface === 'web' ? 'client' : 'server'));

    // A zone with no language signal AND no deployability signal is not worth
    // reporting as a surface at all — it is a directory. A zone with EITHER is
    // reported, because the interesting failures live in the half-signal cases.
    if (verdict === 'undecidable' && entryEv.length === 0) continue;

    const evidence = [...[...nominated.values()].flat(), ...entryEv, ...kindEv];
    const entrypointSource = await detectEntrypointSource(root, {
      path: zone.path,
      surface,
      kind,
      verdict,
      ...(entrypoint !== undefined ? { entrypoint } : {}),
    });
    surfaces.push({
      path: zone.path,
      surface,
      alternatives,
      verdict,
      kind,
      ...(entrypoint !== undefined ? { entrypoint } : {}),
      ...(entrypointSource !== null ? { entrypointSource } : {}),
      ...(zone.path === '.' && workspaceRoot ? { workspaceRoot: true } : {}),
      evidence,
      ...(startProfile !== undefined ? { startProfile } : {}),
      clientShipped,
      ...(analysis && analysis.entrypoints.length > 0
        ? { entrypoints: analysis.entrypoints }
        : {}),
      ...(analysis?.refusal !== undefined ? { refusal: analysis.refusal } : {}),
    });
  }

  return { surfaces, unreadable, zonesExamined: zones.length };
}
