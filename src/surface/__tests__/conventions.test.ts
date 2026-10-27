import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSurfacePipeline } from "../pipeline";

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "fw-conv-"));
  made.push(root);
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, body);
  }
  return root;
}

test("a monorepo split is inferred, and the app with no program is flagged", async () => {
  const root = repo({
    "package.json": JSON.stringify({ name: "mono", private: true, workspaces: ["apps/*", "packages/*"] }),
    "apps/api/package.json": JSON.stringify({ name: "@x/api", scripts: { start: "node src/index.js" } }),
    "apps/api/src/index.js": "serve();\n",
    "apps/web/package.json": JSON.stringify({ name: "@x/web", scripts: { dev: "next dev" } }),
    "apps/voice-worker/pyproject.toml": '[project]\nname = "voice"\ndependencies = []\n',
    "packages/ui/package.json": JSON.stringify({
      name: "@x/ui",
      exports: { ".": "./index.css" },
      scripts: { test: "vitest run" },
    }),
    "packages/core/package.json": JSON.stringify({
      name: "@x/core",
      exports: { ".": "./index.ts" },
      scripts: { typecheck: "tsc --noEmit" },
    }),
    "packages/core/index.ts": "export const core = 1;\n",
  });
  const result = await runSurfacePipeline(root, [
    { path: "apps/voice-worker", verdict: "probable", kind: "unknown", selected: false },
  ]);
  const convention = result.conventions[0];
  expect(convention?.rule).toBe("apps/* are deployable and packages/* are libraries");
  expect(convention?.evidence.some((line) => line.startsWith("apps/api:"))).toBe(true);
  expect(convention?.evidence.some((line) => line.startsWith("packages/ui:"))).toBe(true);
  expect(convention?.exceptions).toContain("apps/voice-worker");
  const voice = result.diffs.find((diff) => diff.unit === "apps/voice-worker");
  expect(voice?.agent.convention_flag).toBe(convention?.rule);
  expect(voice?.agent.claim).toBe("does_not_run");
});
