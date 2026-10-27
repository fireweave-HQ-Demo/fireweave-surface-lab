import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSurfacePipeline } from "../pipeline";

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function write(root: string, rel: string, body: string): void {
  const abs = join(root, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, body);
}

test("vendored trees are skipped, and a manifest inside dist is a review item", async () => {
  const root = mkdtempSync(join(tmpdir(), "fw-exclude-"));
  made.push(root);
  write(root, "package.json", JSON.stringify({ name: "app", scripts: { start: "node server.js" } }));
  write(root, "server.js", "serve();\n");
  write(root, "node_modules/left-pad/index.js", "module.exports = 1;\n");
  write(root, ".venv/lib/site.py", "x = 1\n");
  write(root, "vendor/lib.go", "package vendor\n");
  write(root, "dist/hidden-app/package.json", JSON.stringify({ name: "hidden", scripts: { start: "node main.js" } }));
  write(root, "dist/hidden-app/main.js", "serve();\n");

  const result = await runSurfacePipeline(root, [
    { path: ".", verdict: "probable", kind: "app", selected: true },
  ]);
  const skipped = result.diffs[0]?.agent.coverage.skipped.map((item) => item.path) ?? [];
  expect(skipped).toContain("node_modules");
  expect(skipped).toContain(".venv");
  expect(skipped).toContain("vendor");
  expect(skipped).toContain("dist");
  const hidden = result.excluded.find((item) => item.path === "dist");
  expect(hidden?.review).toBe(true);
  expect(result.diffs.map((diff) => diff.unit)).not.toContain("dist/hidden-app");
});
