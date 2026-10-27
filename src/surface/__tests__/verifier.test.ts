import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { investigateUnit } from "../investigate";
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
        entrypoint: { file: "apps/api/src/server.ts", line: 3, snippet: "serve({ fetch: app.fetch });" },
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

  test("a constructor is not a service, even on the line above serve()", async () => {
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
      })
    );
    expect(result.verified).toBe(false);
    expect(result.downgraded_to).toBe("uncertain");
    expect(result.rejection_reason).toContain("not a service");
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
    expect(result.rejection_reason).toContain("not a service");
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
        entrypoint: { file: "apps/api/src/server.ts", line: 3, snippet: "serve({ fetch: app.fetch });" },
        counter_hypothesis: "this file is only a test",
        counter_checked: "this file is only a test",
      })
    );
    expect(result.verified).toBe(false);
    expect(result.rejection_reason).toContain("counter-check");
  });

  test("a middleware export claimed as a service is rejected", async () => {
    const root = repo({
      "src/middleware/cors/index.ts":
        "export const cors = () => async (c, next) => {\n  await next();\n};\n",
    });
    const result = await verify(
      root,
      claim({
        unit: "src/middleware/cors",
        claim: "runs",
        category: "service",
        evidence_kind: "implicit_construct",
        entrypoint: {
          file: "src/middleware/cors/index.ts",
          line: 1,
          snippet: "export const cors = () => async (c, next) => {",
        },
        counter_checked: "opened src/middleware/cors/index.ts at line 1",
      })
    );
    expect(result.verified).toBe(false);
    expect(result.downgraded_to).toBe("uncertain");
    expect(result.claim).toBe("runs");
  });

  test("a runs claim that cites a README is rejected", async () => {
    const root = repo({ "README.md": "1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n13\n14\n15\n16\n17\n18\n19\n20\n21\n22\n23\n24\n25\n26\nnew Hono()\n" });
    const result = await verify(
      root,
      claim({
        unit: ".",
        claim: "runs",
        category: "service",
        evidence_kind: "implicit_construct",
        entrypoint: { file: "README.md", line: 27, snippet: "new Hono()" },
        counter_checked: "opened README.md at line 27",
      })
    );
    expect(result.verified).toBe(false);
    expect(result.downgraded_to).toBe("uncertain");
    expect(result.rejection_reason).toContain("not source");
  });

  test("a compose file with no program is a verified non-surface", async () => {
    const root = repo({ "compose.yaml": "services:\n  db:\n    image: postgres\n" });
    const claim = await investigateUnit(
      root,
      { path: ".", manifests: ["compose.yaml"], languages: [] },
      { nested: false, imported: false }
    );
    expect(claim.claim).toBe("does_not_run");
    const checked = await verify(root, claim);
    expect(checked.verified).toBe(true);
    expect(checked.claim).toBe("does_not_run");
  });

  test("a main guard is runs_not_surface and keeps its citation", async () => {
    const root = repo({ "tool.py": "if __name__ == \"__main__\":\n    pass\n" });
    const claim = await investigateUnit(
      root,
      { path: ".", manifests: [], languages: ["python"] },
      { nested: false, imported: false }
    );
    expect(claim.claim).toBe("runs_not_surface");
    expect(claim.category).toBe("tooling");
    expect(claim.entrypoint?.file).toBe("tool.py");
    expect(claim.entrypoint?.line).toBe(1);
    const checked = await verify(root, claim);
    expect(checked.verified).toBe(true);
    expect(checked.claim).toBe("runs_not_surface");
  });

  test("listen() inside a function nobody calls is rejected", async () => {
    const root = repo({
      "src/server.ts": "export function start() {\n  app.listen(3000);\n}\n",
    });
    const result = await verify(
      root,
      claim({
        unit: ".",
        claim: "runs",
        category: "service",
        evidence_kind: "implicit_construct",
        entrypoint: { file: "src/server.ts", line: 2, snippet: "app.listen(3000);" },
        counter_checked: "opened src/server.ts at line 2",
      })
    );
    expect(result.verified).toBe(false);
    expect(result.downgraded_to).toBe("uncertain");
    expect(result.rejection_reason).toContain("not reachable");
  });
});
