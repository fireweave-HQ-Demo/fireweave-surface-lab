import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Claim } from "../../src/surface/types";
import { renderSkillReport } from "../report";
import { runSkill } from "../skill";
import { verifySkill } from "../verify";

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "fw-skill-"));
  made.push(root);
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, body);
  }
  return root;
}

const pkg = (value: unknown) => JSON.stringify(value, null, 2);

function clinic(): string {
  return repo({
    "package.json": pkg({ name: "clinic", private: true, scripts: { test: "vitest run" } }),
    "synopsis.html": "<html><body>notes</body></html>\n",
    "apps/api/package.json": pkg({
      name: "@x/api",
      scripts: { dev: "tsx src/server.ts", worker: "tsx src/worker.ts", typecheck: "tsc --noEmit" },
      dependencies: { hono: "4.0.0" },
    }),
    "apps/api/src/server.ts": 'import { Hono } from "hono";\nconst app = new Hono();\nserve({ fetch: app.fetch });\n',
    "apps/api/src/worker.ts": "await worker.run();\n",
    "apps/console/package.json": pkg({
      name: "@x/console",
      scripts: { dev: "next dev --port 3000", build: "next build", start: "next start --port 3000" },
      dependencies: { next: "15.0.0" },
    }),
    "apps/console/next.config.ts": "const nextConfig = {};\nexport default nextConfig;\n",
    "apps/console/app/api/route.ts": "export async function GET() {\n  return new Response('ok');\n}\n",
    "apps/console/app/page.tsx": "fileRef.current?.click();\n",
    "apps/marketing/package.json": pkg({
      name: "@x/marketing",
      scripts: { dev: "next dev --port 3001", start: "next start --port 3001" },
      dependencies: { next: "15.0.0" },
    }),
    "apps/marketing/next.config.ts": "const nextConfig = {};\nexport default nextConfig;\n",
    "apps/agent-worker/pyproject.toml": '[project]\nname = "agent"\ndependencies = ["temporalio>=1.9"]\n',
    "apps/agent-worker/worker.py":
      'import asyncio\n\nasync def main():\n    pass\n\nif __name__ == "__main__":\n    asyncio.run(main())\n',
    "apps/browser-runner/pyproject.toml": '[project]\nname = "browser"\ndependencies = ["playwright>=1.49"]\n',
    "apps/browser-runner/server.py":
      'from http.server import ThreadingHTTPServer\n\nif __name__ == "__main__":\n    ThreadingHTTPServer(("0.0.0.0", 4020), None).serve_forever()\n',
    "apps/voice-worker/pyproject.toml":
      '[project]\nname = "voice"\ndescription = "Production voice worker."\ndependencies = []\n',
    "apps/sandbox/server.py":
      'from http.server import ThreadingHTTPServer\n\nif __name__ == "__main__":\n    ThreadingHTTPServer(("0.0.0.0", 4010), None).serve_forever()\n',
    "packages/ui/package.json": pkg({ name: "@x/ui", exports: { ".": "./index.css" } }),
    "packages/ui/index.css": ".x{}\n",
  });
}

async function checked(root: string) {
  const outcome = await runSkill(root);
  const claims = [];
  for (const claim of outcome.claims) claims.push(await verifySkill(root, claim));
  return { outcome, claims };
}

test("a service citation is the listener, not the constructor or the config", async () => {
  const root = clinic();
  const { claims } = await checked(root);
  const runs = claims.filter((claim) => claim.verified && claim.claim === "runs");
  const api = runs.find((claim) => claim.entrypoint?.file.endsWith("server.ts"));
  expect(api?.entrypoint?.snippet).toContain("serve(");
  expect(api?.entrypoint?.line).toBe(3);
  expect(api?.category).toBe("service");
  expect(api?.confidence).toBe("high");

  const worker = runs.find((claim) => claim.entrypoint?.file.endsWith("worker.ts"));
  expect(worker?.category).toBe("worker");
  expect(worker?.entrypoint?.snippet).toContain("worker.run(");

  const consoleApp = runs.find((claim) => claim.unit === "apps/console");
  expect(consoleApp?.entrypoint?.file).toBe("apps/console/package.json");
  expect(consoleApp?.entrypoint?.snippet).toContain("next start");
  expect(runs.some((claim) => claim.entrypoint?.file.includes("route.ts"))).toBe(false);
  expect(runs.some((claim) => claim.entrypoint?.file.includes("next.config"))).toBe(false);
  expect(runs.some((claim) => claim.category === "cli")).toBe(false);

  const browser = runs.find((claim) => claim.unit === "apps/browser-runner");
  expect(browser?.category).toBe("service");
  expect(browser?.entrypoint?.snippet).toContain("serve_forever");

  const agent = runs.find((claim) => claim.unit === "apps/agent-worker");
  expect(agent?.category).toBe("worker");
  expect(agent?.entrypoint?.snippet).toContain("asyncio.run");

  const sandbox = runs.find((claim) => claim.unit === "apps/sandbox");
  expect(sandbox?.category).toBe("service");
  expect(sandbox?.verified).toBe(true);

  const voice = claims.find((claim) => claim.unit === "apps/voice-worker");
  expect(voice?.claim).toBe("does_not_run");
  expect(voice?.category).toBe("placeholder");
  expect(voice?.searched.files_opened.some((file) => file.endsWith("pyproject.toml"))).toBe(true);
  expect(voice?.searched.globs.length).toBeGreaterThan(0);
  expect(voice?.verified).toBe(true);

  const ui = claims.find((claim) => claim.unit === "packages/ui");
  expect(ui?.claim).toBe("does_not_run");
  expect(ui?.category).toBe("library");

  const html = renderSkillReport("clinic", claims, { claims: [], conventions: [], excluded: [] });
  expect(html.indexOf("apps/console")).toBeGreaterThan(0);
  expect(html).not.toContain("new Hono()");
  expect(html).not.toContain("route.ts");
});

test("citing new Hono() is rejected even when serve() is the next line", async () => {
  const root = repo({
    "apps/api/package.json": pkg({
      scripts: { dev: "tsx src/server.ts" },
      dependencies: { hono: "4" },
    }),
    "apps/api/src/server.ts": "const app = new Hono();\nserve({ fetch: app.fetch });\n",
  });
  const { claims } = await checked(root);
  const api = claims.find((claim) => claim.unit === "apps/api" && claim.claim === "runs");
  expect(api?.verified).toBe(true);
  const forged: Claim = {
    ...api!,
    entrypoint: { file: "apps/api/src/server.ts", line: 1, snippet: "const app = new Hono();" },
  };
  const rejected = await verifySkill(root, forged);
  expect(rejected.verified).toBe(false);
  expect(rejected.downgraded_to).toBe("uncertain");
  expect(rejected.rejection_reason).toContain("not a service");
});

test("a constructor with no listener is review, not a surface", async () => {
  const root = repo({
    Dockerfile: 'CMD ["python", "server.py"]\n',
    "server.py": "app = FastAPI()\n",
  });
  const { claims } = await checked(root);
  const server = claims.find((claim) => claim.unit === ".");
  expect(server?.claim).toBe("uncertain");
  expect(server?.verified).toBe(true);
  expect(claims.some((claim) => claim.claim === "runs" && claim.verified)).toBe(false);
});

test("an empty search is not a negative", async () => {
  const root = repo({ "apps/voice/pyproject.toml": '[project]\nname = "voice"\ndependencies = []\n' });
  const { claims } = await checked(root);
  const voice = claims.find((claim) => claim.unit === "apps/voice");
  expect(voice).toBeDefined();
  const emptied: Claim = {
    ...voice!,
    searched: { globs: [], greps: [], files_opened: [] },
  };
  const rejected = await verifySkill(root, emptied);
  expect(rejected.verified).toBe(false);
  expect(rejected.rejection_reason).toContain("empty search");
});
