import { join } from "node:path";
import type { Unit } from "../types";
import { repoRelative, unitDir, type Extractor, type ManifestFacts, type Resolution } from "./contract";
import { cite, readText, type Idiom } from "./scan";

const IDIOMS: Idiom[] = [
  { grep: /\buvicorn\.run\s*\(/, construct: "listener" },
  { grep: /\bapp\.run\s*\(/, construct: "listener" },
  { grep: /\.serve_forever\s*\(/, construct: "listener" },
  { grep: /\bThreadingHTTPServer\s*\(/, construct: "listener" },
  { grep: /\bHTTPServer\s*\(/, construct: "listener" },
  { grep: /\basyncio\.run\s*\(/, construct: "event_loop" },
  { grep: /while\s+True\s*:/, construct: "event_loop" },
  { grep: /\bargparse\./, construct: "cli" },
  { grep: /if\s+__name__\s*==\s*["']__main__["']/, construct: "main_guard", evidence_kind: "main_guard" },
];

function bracketValue(text: string, key: string): string | null {
  const start = new RegExp(`^${key}\\s*=\\s*\\[`, "m").exec(text);
  if (!start || start.index === undefined) return null;
  const from = start.index + start[0].length;
  let depth = 1;
  for (let i = from; i < text.length; i++) {
    const char = text[i];
    if (char === "[") depth += 1;
    else if (char === "]") {
      depth -= 1;
      if (depth === 0) return text.slice(from, i);
    }
  }
  return null;
}

function quoted(body: string): string[] {
  return [...body.matchAll(/"([^"]+)"/g)].map((match) => match[1]!);
}

function scriptsIn(text: string, header: string): string[] {
  const lines = text.split(/\r?\n/);
  let on = false;
  const scripts: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[")) {
      on = trimmed === `[${header}]`;
      continue;
    }
    if (!on || trimmed === "" || trimmed.startsWith("#")) continue;
    const match = /^([A-Za-z0-9_.-]+)\s*=\s*"([^"]+)"/.exec(trimmed);
    if (match) scripts.push(`${match[1]}: ${match[2]}`);
  }
  return scripts;
}

function moduleFile(spec: string): string | null {
  const target = spec.split(/\s+/).find((token) => token.includes(":") || token.endsWith(".py"));
  if (!target) return null;
  if (target.endsWith(".py")) return target.replace(/^\.\//, "");
  const moduleName = target.split(":")[0]?.replace(/^\.\//, "");
  if (!moduleName) return null;
  return `${moduleName.replace(/\./g, "/")}.py`;
}

export function pythonExtractor(repoRoot: string): Extractor {
  return {
    ecosystem: "python",
    exclusions: () => [
      /(?:^|\/)\.venv(?:\/|$)/,
      /(?:^|\/)venv(?:\/|$)/,
      /(?:^|\/)vendor(?:\/|$)/,
      /_pb2\.py$/,
      /(?:^|\/)test_.*\.py$/,
      /_test\.py$/,
    ],
    executionIdioms: () => IDIOMS,
    async packageName(unit: Unit): Promise<string | null> {
      const text = await readText(join(unitDir(repoRoot, unit), "pyproject.toml"));
      const name = text ? /^name\s*=\s*"([^"]+)"/m.exec(text)?.[1] : undefined;
      return name ?? null;
    },
    async readManifest(unit: Unit): Promise<ManifestFacts> {
      const text = await readText(join(unitDir(repoRoot, unit), "pyproject.toml"));
      if (!text) return { scripts: [], bins: [], deps: {} };
      const description = /^description\s*=\s*"([^"]*)"/m.exec(text)?.[1];
      const deps: Record<string, string> = {};
      const body = bracketValue(text, "dependencies");
      if (body) {
        for (const raw of quoted(body)) {
          const name = raw.split(/[<>=!~[\s]/)[0]?.trim();
          if (name) deps[name] = raw;
        }
      }
      const scripts = [
        ...scriptsIn(text, "project.scripts"),
        ...scriptsIn(text, "tool.poetry.scripts"),
      ];
      return {
        scripts,
        bins: scripts.map((script) => script.split(": ")[0] ?? script),
        deps,
        ...(description !== undefined ? { description } : {}),
      };
    },
    async resolveDeclaration(unit: Unit, decl: string): Promise<Resolution> {
      const command = decl.includes(": ") ? decl.split(": ").slice(1).join(": ") : decl;
      const relative = moduleFile(command);
      if (!relative) return { unresolved: "declaration names no python module" };
      const abs = join(unitDir(repoRoot, unit), relative);
      const text = await readText(abs);
      if (text === null) return { unresolved: `missing ${relative}` };
      const hit = cite(text, IDIOMS);
      if (!hit) return { unresolved: `${relative} has no execution construct` };
      return { file: repoRelative(repoRoot, abs), line: hit.line };
    },
  };
}
