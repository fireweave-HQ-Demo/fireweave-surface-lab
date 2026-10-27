import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSurfacePipeline } from "../pipeline";

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), "fw-stable-"));
  made.push(root);
  const file = join(root, "package.json");
  mkdirSync(root, { recursive: true });
  writeFileSync(
    file,
    JSON.stringify({ name: "api", scripts: { dev: "tsx src/server.ts" }, dependencies: { hono: "4.0.0" } })
  );
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src/server.ts"), "const app = new Hono();\nserve(app);\n");
  return root;
}

test("a second run on the same tree matches the first byte for byte", async () => {
  const root = repo();
  const scanner = [{ path: ".", verdict: "probable", kind: "unknown", selected: true }];
  const first = await runSurfacePipeline(root, scanner);
  const second = await runSurfacePipeline(root, scanner);
  expect(second.flips).toEqual([]);
  expect(JSON.stringify(second.diffs)).toBe(JSON.stringify(first.diffs));
});

test("a changed cache entry is reported as FLIP_DETECTED and not treated as the result", async () => {
  const root = repo();
  const scanner = [{ path: ".", verdict: "probable", kind: "unknown", selected: true }];
  const first = await runSurfacePipeline(root, scanner);
  const cache = join(root, ".surface-cache");
  const [file] = readdirSync(cache);
  writeFileSync(join(cache, file!), "{\"tampered\":true}");
  const logged: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    logged.push(args.map(String).join(" "));
  };
  try {
    const second = await runSurfacePipeline(root, scanner);
    expect(logged.some((line) => line.startsWith("FLIP_DETECTED"))).toBe(true);
    expect(second.flips).toEqual(["."]);
    expect(JSON.stringify(second.diffs)).toBe(JSON.stringify(first.diffs));
  } finally {
    console.error = original;
  }
});
