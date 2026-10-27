import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSurfacePipeline } from "../pipeline";
import type { Unit } from "../types";

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "fw-eco-"));
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

describe("other ecosystems", () => {
  test("a Dockerfile command is followed into the program file", async () => {
    const root = repo({
      Dockerfile: 'FROM python:3.12\nCMD ["python", "server.py"]\nEXPOSE 8080\n',
      "server.py": "from fastapi import FastAPI\napp = FastAPI()\n",
    });
    const result = await runSurfacePipeline(root, [
      { path: ".", verdict: "probable", kind: "unknown", selected: true },
    ]);
    const claim = result.diffs[0]?.agent;
    expect(claim?.verified).toBe(true);
    expect(claim?.claim).toBe("runs");
    expect(claim?.category).toBe("service");
    expect(claim?.evidence_kind).toBe("container_cmd");
    expect(claim?.entrypoint).toMatchObject({ file: "server.py", line: 2 });
  });

  test("go ListenAndServe is a service and a bare func main is not a filename rule", async () => {
    const root = repo({
      "go.mod": "module example.com/svc\n\ngo 1.22\n",
      "serve.go": "package main\n\nfunc main() {\n\thttp.ListenAndServe(\":8080\", nil)\n}\n",
    });
    const result = await runSurfacePipeline(root, [
      { path: ".", verdict: "probable", kind: "unknown", selected: true },
    ]);
    expect(result.diffs[0]?.agent).toMatchObject({
      verified: true,
      claim: "runs",
      category: "service",
      entrypoint: { file: "serve.go" },
    });
  });

  test("axum::serve is a service", async () => {
    const root = repo({
      "Cargo.toml": '[package]\nname = "svc"\n',
      "src/main.rs": "#[tokio::main]\nasync fn main() {\n    axum::serve(listener, app).await.unwrap();\n}\n",
    });
    const result = await runSurfacePipeline(root, [
      { path: ".", verdict: "probable", kind: "unknown", selected: true },
    ]);
    expect(result.diffs[0]?.agent).toMatchObject({
      verified: true,
      claim: "runs",
      category: "service",
    });
    expect(result.diffs[0]?.agent.entrypoint?.file).toBe("src/main.rs");
  });

  test("a container claim that names the wrong file is rejected", async () => {
    const { dockerExtractor } = await import("../extractors/docker");
    const { verify } = await import("../verify");
    const root = repo({
      Dockerfile: 'CMD ["python", "server.py"]\n',
      "server.py": "app = FastAPI()\n",
      "other.py": "app = FastAPI()\n",
    });
    const resolved = await dockerExtractor(root).resolveDeclaration(
      unit(".", ["Dockerfile"], ["docker"]),
      'CMD: CMD ["python", "server.py"]'
    );
    expect(resolved).toEqual({ file: "server.py" });
    const result = await verify(root, {
      unit: ".",
      claim: "runs",
      category: "service",
      ecosystem: "python",
      evidence_kind: "container_cmd",
      entrypoint: { file: "other.py", line: 1, snippet: "app = FastAPI()" },
      searched: { globs: ["python:**/*"], greps: ["resolve:CMD"], files_opened: ["Dockerfile", "other.py"] },
      counter_hypothesis: "the process is a test",
      counter_checked: "opened other.py at line 1",
      coverage: { inspected: 1, skipped: [], uncertain: [] },
      confidence: "medium",
    });
    expect(result.verified).toBe(false);
    expect(result.rejection_reason).toContain("container command");
  });
});
