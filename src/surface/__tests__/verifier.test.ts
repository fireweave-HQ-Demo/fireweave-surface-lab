import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Claim } from "../types";
import { verify } from "../verify";

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "fw-verify-"));
  made.push(root);
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, body);
  }
  return root;
}

function claim(over: Partial<Claim> & Pick<Claim, "claim" | "category">): Claim {
  return {
    unit: "apps/api",
    searched: { globs: [], greps: [], files_opened: [] },
    counter_hypothesis: "this file is only a test",
    counter_checked: "opened apps/api/src/server.ts at line 2",
    coverage: { inspected: 1, skipped: [], uncertain: [] },
    confidence: "high",
    ecosystem: "node",
    ...over,
  };
}

const server = 'import { Hono } from "hono";\nconst app = new Hono();\nserve({ fetch: app.fetch });\n';

describe("verify", () => {
  test("a resolved declaration that cites the recomputed line passes", async () => {
    const root = repo({
      "apps/api/package.json": JSON.stringify({ scripts: { dev: "tsx src/server.ts" } }),
      "apps/api/src/server.ts": server,
    });
    const result = await verify(
      root,
      claim({
        claim: "runs",
        category: "service",
        evidence_kind: "resolved_declaration",
        entrypoint: { file: "apps/api/src/server.ts", line: 2, snippet: "const app = new Hono();" },
        searched: {
          globs: [],
          greps: ["resolve:dev: tsx src/server.ts"],
          files_opened: ["apps/api/package.json", "apps/api/src/server.ts"],
        },
      })
    );
    expect(result.verified).toBe(true);
    expect(result.downgraded_to).toBeUndefined();
  });

  test("a resolved declaration whose line was not recomputed is rejected", async () => {
    const root = repo({
      "apps/api/package.json": JSON.stringify({ scripts: { dev: "tsx src/server.ts" } }),
      "apps/api/src/server.ts": server,
    });
    const result = await verify(
      root,
      claim({
        claim: "runs",
        category: "service",
        evidence_kind: "resolved_declaration",
        entrypoint: { file: "apps/api/src/server.ts", line: 3, snippet: "serve({ fetch: app.fetch });" },
      })
    );
    expect(result.verified).toBe(false);
    expect(result.downgraded_to).toBe("uncertain");
    expect(result.rejection_reason).toContain("does not resolve");
  });

  test("a cited line with no execution construct is rejected", async () => {
    const root = repo({
      "apps/api/src/server.ts": "export const value = 1;\n\n\n\n\nconst later = 2;\n",
    });
    const result = await verify(
      root,
      claim({
        claim: "runs",
        category: "service",
        evidence_kind: "implicit_construct",
        entrypoint: { file: "apps/api/src/server.ts", line: 1, snippet: "export const value = 1;" },
      })
    );
    expect(result.verified).toBe(false);
    expect(result.rejection_reason).toContain("does not match");
  });

  test("a missing file is rejected", async () => {
    const root = repo({});
    const result = await verify(
      root,
      claim({
        claim: "runs",
        category: "service",
        entrypoint: { file: "apps/api/src/server.ts", line: 1, snippet: "serve()" },
      })
    );
    expect(result.verified).toBe(false);
    expect(result.downgraded_to).toBe("uncertain");
  });

  test("does_not_run with an empty search is rejected", async () => {
    const root = repo({});
    const result = await verify(
      root,
      claim({
        unit: "apps/voice-worker",
        claim: "does_not_run",
        category: "placeholder",
        ecosystem: "python",
        counter_checked: "opened apps/voice-worker/pyproject.toml",
      })
    );
    expect(result.verified).toBe(false);
    expect(result.rejection_reason).toContain("empty search");
  });

  test("does_not_run with a declaration attempt and a sweep passes", async () => {
    const root = repo({ "apps/voice-worker/pyproject.toml": '[project]\nname = "voice"\ndependencies = []\n' });
    const result = await verify(
      root,
      claim({
        unit: "apps/voice-worker",
        claim: "does_not_run",
        category: "placeholder",
        ecosystem: "python",
        searched: {
          globs: ["*.py"],
          greps: ["resolve:pyproject.toml", "if __name__"],
          files_opened: ["apps/voice-worker/pyproject.toml"],
        },
        counter_hypothesis: "a worker module exists without a script",
        counter_checked: "glob *.py under apps/voice-worker and opened apps/voice-worker/pyproject.toml",
      })
    );
    expect(result.verified).toBe(true);
  });

  test("does_not_run that never sweeps is rejected", async () => {
    const root = repo({});
    const result = await verify(
      root,
      claim({
        unit: "apps/voice-worker",
        claim: "does_not_run",
        category: "placeholder",
        searched: { globs: [], greps: ["resolve:pyproject.toml"], files_opened: ["apps/voice-worker/pyproject.toml"] },
        counter_checked: "opened apps/voice-worker/pyproject.toml",
      })
    );
    expect(result.verified).toBe(false);
    expect(result.rejection_reason).toContain("sweep");
  });

  test("runs as a library or a tooling script is rejected", async () => {
    const root = repo({ "packages/ui/index.ts": "export const css = 1;\nserve();\n" });
    const result = await verify(
      root,
      claim({
        unit: "packages/ui",
        claim: "runs",
        category: "library",
        evidence_kind: "implicit_construct",
        entrypoint: { file: "packages/ui/index.ts", line: 2, snippet: "serve();" },
        counter_checked: "opened packages/ui/index.ts at line 2",
      })
    );
    expect(result.verified).toBe(false);
    expect(result.rejection_reason).toContain("library");
  });

  test("a counter-check that restates the hypothesis is rejected", async () => {
    const root = repo({ "apps/api/src/server.ts": server });
    const result = await verify(
      root,
      claim({
        claim: "runs",
        category: "service",
        evidence_kind: "implicit_construct",
        entrypoint: { file: "apps/api/src/server.ts", line: 2, snippet: "const app = new Hono();" },
        counter_hypothesis: "this file is only a test",
        counter_checked: "this file is only a test",
      })
    );
    expect(result.verified).toBe(false);
    expect(result.rejection_reason).toContain("counter-check");
  });
});
