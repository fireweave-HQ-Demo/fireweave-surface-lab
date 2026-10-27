import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nodeExtractor } from "../extractors/node";
import { pythonExtractor } from "../extractors/python";
import type { Unit } from "../types";

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "fw-extract-"));
  made.push(root);
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, body);
  }
  return root;
}

const unit = (path: string, manifests: string[], languages: string[]): Unit => ({
  path,
  manifests,
  languages,
});

describe("node extractor", () => {
  test("reads scripts and runtime deps, and follows the declared file", async () => {
    const root = repo({
      "apps/api/package.json": JSON.stringify({
        scripts: { dev: "tsx src/server.ts", typecheck: "tsc --noEmit" },
        dependencies: { hono: "4.9.9" },
      }),
      "apps/api/src/server.ts": 'import { Hono } from "hono";\nconst app = new Hono();\nserve({ fetch: app.fetch });\n',
      "apps/api/src/other.ts": "export const unused = 1;\n",
    });
    const api = unit("apps/api", ["package.json"], ["node"]);
    const tool = nodeExtractor(root);
    const facts = await tool.readManifest(api);
    expect(facts.scripts).toContain("dev: tsx src/server.ts");
    expect(facts.deps.hono).toBe("4.9.9");
    const resolved = await tool.resolveDeclaration(api, "dev: tsx src/server.ts");
    expect(resolved).toEqual({ file: "apps/api/src/server.ts", line: 2 });
  });

  test("a filename that is not the declaration target is not the resolution", async () => {
    const root = repo({
      "apps/api/package.json": JSON.stringify({ scripts: { dev: "tsx src/index.ts" } }),
      "apps/api/src/index.ts": "serve();\n",
      "apps/api/src/server.ts": "new Hono();\n",
    });
    const resolved = await nodeExtractor(root).resolveDeclaration(
      unit("apps/api", ["package.json"], ["node"]),
      "dev: tsx src/index.ts"
    );
    expect(resolved).toEqual({ file: "apps/api/src/index.ts", line: 1 });
  });

  test("a tooling script is not an execution resolution", async () => {
    const root = repo({
      "packages/contracts/package.json": JSON.stringify({ scripts: { test: "vitest run" } }),
    });
    const resolved = await nodeExtractor(root).resolveDeclaration(
      unit("packages/contracts", ["package.json"], ["node"]),
      "test: vitest run"
    );
    expect(resolved).toEqual({ unresolved: "tooling: vitest run" });
  });
});

describe("python extractor", () => {
  test("follows a declared module path to the construct, not a filename list", async () => {
    const root = repo({
      "apps/agent-worker/pyproject.toml":
        '[project]\nname = "agent"\ndependencies = ["temporalio>=1.9"]\n\n[project.scripts]\nworker = "app.worker:main"\n',
      "apps/agent-worker/app/worker.py": "def main():\n    pass\n\nif __name__ == \"__main__\":\n    asyncio.run(main())\n",
      "apps/agent-worker/server.py": "ThreadingHTTPServer().serve_forever()\n",
    });
    const agent = unit("apps/agent-worker", ["pyproject.toml"], ["python"]);
    const tool = pythonExtractor(root);
    const facts = await tool.readManifest(agent);
    expect(facts.deps.temporalio).toBe("temporalio>=1.9");
    expect(facts.scripts).toContain("worker: app.worker:main");
    const resolved = await tool.resolveDeclaration(agent, "worker: app.worker:main");
    expect(resolved).toEqual({ file: "apps/agent-worker/app/worker.py", line: 5 });
  });

  test("execution idioms include the required constructs and exclusions skip virtualenvs", () => {
    const tool = pythonExtractor("/tmp");
    const labels = tool.executionIdioms().map((idiom) => idiom.grep.source);
    expect(labels.some((source) => source.includes("uvicorn"))).toBe(true);
    expect(labels.some((source) => source.includes("FastAPI"))).toBe(true);
    expect(labels.some((source) => source.includes("__name__"))).toBe(true);
    expect(labels.some((source) => source.includes("while"))).toBe(true);
    expect(tool.exclusions().some((pattern) => pattern.test(".venv/lib/x.py"))).toBe(true);
    expect(tool.exclusions().some((pattern) => pattern.test("pkg/foo_pb2.py"))).toBe(true);
  });
});
