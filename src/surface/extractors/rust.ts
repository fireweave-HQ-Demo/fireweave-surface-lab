import { join } from "node:path";
import type { Unit } from "../types";
import { repoRelative, unitDir, type Extractor, type ManifestFacts, type Resolution } from "./contract";
import { cite, readText, type Idiom } from "./scan";

const IDIOMS: Idiom[] = [
  { grep: /#\[tokio::main\]/, construct: "event_loop" },
  { grep: /\bloop\s*\{/, construct: "event_loop" },
  { grep: /\bTcpListener::bind\s*\(/, construct: "listener" },
  { grep: /\baxum::serve\s*\(/, construct: "listener" },
  { grep: /\bHttpServer::new\s*\(/, construct: "listener" },
  { grep: /\bServer::bind\s*\(/, construct: "listener" },
  { grep: /\.bind\s*\(/, construct: "listener" },
  { grep: /\.serve\s*\(/, construct: "listener" },
  { grep: /\.start\s*(?:::|<|\()/, construct: "event_loop" },
];

function fileToken(decl: string): string | null {
  const command = decl.includes(": ") ? decl.split(": ").slice(1).join(": ") : decl;
  const token = command.split(/\s+/).find((part) => part.endsWith(".rs"));
  return token?.replace(/^\.\//, "") ?? null;
}

export function rustExtractor(repoRoot: string): Extractor {
  return {
    ecosystem: "rust",
    exclusions: () => [/(?:^|\/)target(?:\/|$)/],
    executionIdioms: () => IDIOMS,
    async readManifest(unit: Unit): Promise<ManifestFacts> {
      const text = await readText(join(unitDir(repoRoot, unit), "Cargo.toml"));
      if (!text) return { scripts: [], bins: [], deps: {} };
      const name = /^name\s*=\s*"([^"]+)"/m.exec(text)?.[1];
      return { scripts: [], bins: [], deps: name ? { [name]: "crate" } : {} };
    },
    async packageName(unit: Unit): Promise<string | null> {
      const text = await readText(join(unitDir(repoRoot, unit), "Cargo.toml"));
      return text ? /^name\s*=\s*"([^"]+)"/m.exec(text)?.[1] ?? null : null;
    },
    async resolveDeclaration(unit: Unit, decl: string): Promise<Resolution> {
      const relative = fileToken(decl);
      if (!relative) return { unresolved: "declaration names no rust file" };
      const abs = join(unitDir(repoRoot, unit), relative);
      const text = await readText(abs);
      if (text === null) return { unresolved: `missing ${relative}` };
      const hit = cite(text, IDIOMS, repoRelative(repoRoot, abs));
      if (!hit) return { unresolved: `${relative} has no execution construct` };
      return { file: repoRelative(repoRoot, abs), line: hit.line };
    },
  };
}
