import { join } from "node:path";
import type { Unit } from "../types";
import { repoRelative, unitDir, type Extractor, type ManifestFacts, type Resolution } from "./contract";
import { cite, readText, type Idiom } from "./scan";

const IDIOMS: Idiom[] = [
  { grep: /\.listen\s*\(/, construct: "listener" },
  { grep: /\bserve\s*\(/, construct: "listener" },
  { grep: /\bcreateServer\s*\(/, construct: "listener" },
  { grep: /\bnew\s+Hono\s*\(/, construct: "listener", evidence_kind: "framework_ctor" },
  { grep: /\bhttp\.createServer\s*\(/, construct: "listener" },
  { grep: /\bapp\.listen\s*\(/, construct: "listener" },
  {
    grep: /\bexport\s+(?:async\s+)?function\s+(?:GET|POST|PUT|PATCH|DELETE|HEAD)\b/,
    construct: "route_handler",
  },
];

const TOOLING = /^(?:vitest|jest|eslint|prettier|tsc|biome|playwright|next\s+build|next\s+lint)\b/;

function fileToken(script: string): string | null {
  for (const token of script.split(/\s+/)) {
    const clean = token.replace(/^['"]|['"]$/g, "").replace(/^\.\//, "");
    if (/\.(ts|tsx|js|mjs|cjs)$/.test(clean)) return clean;
  }
  return null;
}

export function nodeExtractor(repoRoot: string): Extractor {
  return {
    ecosystem: "node",
    exclusions: () => [
      /(?:^|\/)node_modules(?:\/|$)/,
      /(?:^|\/)dist(?:\/|$)/,
      /(?:^|\/)\.next(?:\/|$)/,
      /\.min\.js$/,
      /\.(?:test|spec)\.(?:ts|tsx|js|mjs|cjs)$/,
    ],
    executionIdioms: () => IDIOMS,
    async packageName(unit: Unit): Promise<string | null> {
      const text = await readText(join(unitDir(repoRoot, unit), "package.json"));
      if (!text) return null;
      try {
        const name = (JSON.parse(text) as { name?: unknown }).name;
        return typeof name === "string" ? name : null;
      } catch {
        return null;
      }
    },
    async readManifest(unit: Unit): Promise<ManifestFacts> {
      const text = await readText(join(unitDir(repoRoot, unit), "package.json"));
      if (!text) return { scripts: [], bins: [], deps: {} };
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(text) as Record<string, unknown>;
      } catch {
        return { scripts: [], bins: [], deps: {} };
      }
      const scripts: string[] = [];
      const rawScripts = parsed.scripts;
      if (rawScripts && typeof rawScripts === "object") {
        for (const [key, value] of Object.entries(rawScripts as Record<string, unknown>)) {
          if (typeof value === "string") scripts.push(`${key}: ${value}`);
        }
      }
      const bins: string[] = [];
      const bin = parsed.bin;
      if (typeof bin === "string") bins.push(bin);
      else if (bin && typeof bin === "object") {
        for (const value of Object.values(bin as Record<string, unknown>)) {
          if (typeof value === "string") bins.push(value);
        }
      }
      const deps: Record<string, string> = {};
      const rawDeps = parsed.dependencies;
      if (rawDeps && typeof rawDeps === "object") {
        for (const [key, value] of Object.entries(rawDeps as Record<string, unknown>)) {
          if (typeof value === "string") deps[key] = value;
        }
      }
      const description = typeof parsed.description === "string" ? parsed.description : undefined;
      const exportsOnly = parsed.exports !== undefined && scripts.every((script) => TOOLING.test(script.split(": ").slice(1).join(": ")));
      return {
        scripts,
        bins,
        deps,
        ...(description !== undefined ? { description } : {}),
        ...(exportsOnly ? { exportsOnly: true } : {}),
      };
    },
    async resolveDeclaration(unit: Unit, decl: string): Promise<Resolution> {
      const command = decl.includes(": ") ? decl.split(": ").slice(1).join(": ") : decl;
      if (TOOLING.test(command.trim())) return { unresolved: `tooling: ${command.trim()}` };
      const token = fileToken(command);
      if (!token) return { unresolved: "declaration names no source file" };
      const abs = join(unitDir(repoRoot, unit), token);
      const text = await readText(abs);
      if (text === null) return { unresolved: `missing ${token}` };
      const hit = cite(text, IDIOMS);
      if (!hit) return { unresolved: `${token} has no execution construct` };
      return { file: repoRelative(repoRoot, abs), line: hit.line };
    },
  };
}
