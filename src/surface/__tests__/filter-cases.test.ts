import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promoteSelection } from "../diff";
import { runSurfacePipeline } from "../pipeline";
import type { ScannerView } from "../types";

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "fw-filter-"));
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
    "package.json": pkg({
      name: "clinic",
      private: true,
      workspaces: ["apps/*", "packages/*"],
      scripts: { test: "vitest run" },
    }),
    "synopsis.html": "<html><body>notes</body></html>\n",
    "apps/api/package.json": pkg({
      name: "@x/api",
      scripts: { dev: "tsx src/server.ts", typecheck: "tsc --noEmit" },
      dependencies: { hono: "4.0.0", "@x/contracts": "workspace:*" },
    }),
    "apps/api/src/server.ts": 'import { Hono } from "hono";\nconst app = new Hono();\nserve({ fetch: app.fetch });\n',
    "apps/console/package.json": pkg({
      name: "@x/console",
      scripts: { dev: "next dev --port 3000", start: "next start --port 3000" },
      dependencies: { next: "15.0.0", "@x/ui": "workspace:*" },
    }),
    "apps/console/next.config.ts": "const nextConfig = {};\nexport default nextConfig;\n",
    "apps/console/app/api/route.ts":
      "export async function GET() {\n  return new Response('ok');\n}\n",
    "apps/marketing/package.json": pkg({
      name: "@x/marketing",
      scripts: { dev: "next dev --port 3001", start: "next start --port 3001" },
      dependencies: { next: "15.0.0" },
    }),
    "apps/marketing/next.config.ts": "const nextConfig = {};\nexport default nextConfig;\n",
    "apps/marketing/app/page.tsx": "export default function Page() {\n  return <main>Clinic</main>;\n}\n",
    "apps/agent-worker/pyproject.toml":
      '[project]\nname = "agent"\ndependencies = ["temporalio>=1.9"]\n',
    "apps/agent-worker/worker.py":
      "import asyncio\n\nasync def main():\n    pass\n\nif __name__ == \"__main__\":\n    asyncio.run(main())\n",
    "apps/browser-runner/pyproject.toml": '[project]\nname = "browser"\ndependencies = ["playwright>=1.49"]\n',
    "apps/browser-runner/server.py":
      "from http.server import ThreadingHTTPServer\n\nif __name__ == \"__main__\":\n    ThreadingHTTPServer((\"0.0.0.0\", 4020), None).serve_forever()\n",
    "apps/voice-worker/pyproject.toml":
      '[project]\nname = "voice"\ndescription = "Placeholder for the LiveKit voice worker. Voice is a later phase."\ndependencies = []\n',
    "apps/extension/package.json": pkg({
      name: "@x/extension",
      description: "Chrome side panel placeholder. The panel is a later phase.",
    }),
    "apps/sandbox/server.py":
      "from http.server import ThreadingHTTPServer\n\nif __name__ == \"__main__\":\n    ThreadingHTTPServer((\"0.0.0.0\", 4010), None).serve_forever()\n",
    "packages/ui/package.json": pkg({ name: "@x/ui", exports: { ".": "./index.css" } }),
    "packages/ui/index.css": ".x{}\n",
    "packages/contracts/package.json": pkg({
      name: "@x/contracts",
      exports: { ".": "./src/index.ts" },
      scripts: { test: "vitest run" },
      dependencies: { zod: "4.0.0" },
    }),
    "packages/contracts/src/index.ts": "export const schema = 1;\n",
    "packages/db/package.json": pkg({
      name: "@x/db",
      exports: { ".": "./src/schema.ts" },
      dependencies: { "drizzle-orm": "0.44.0" },
    }),
    "packages/db/src/schema.ts": "export const table = 1;\n",
    "packages/domain/package.json": pkg({
      name: "@x/domain",
      exports: { ".": "./src/index.ts" },
      scripts: { test: "vitest run" },
      dependencies: { "@x/contracts": "workspace:*" },
    }),
    "packages/domain/src/index.ts": "export const commit = 1;\n",
  });
}

const scanner: ScannerView[] = [
  { path: ".", verdict: "ambiguous", kind: "unknown", selected: false },
  { path: "apps/api", verdict: "SENTINEL_VERDICT", kind: "SENTINEL_KIND", selected: true },
  { path: "apps/console", verdict: "confirmed", kind: "app", selected: true },
  { path: "apps/marketing", verdict: "confirmed", kind: "app", selected: true },
  { path: "apps/agent-worker", verdict: "probable", kind: "unknown", selected: true },
  { path: "apps/browser-runner", verdict: "probable", kind: "unknown", selected: true },
  { path: "apps/voice-worker", verdict: "probable", kind: "unknown", selected: false },
  { path: "apps/extension", verdict: "undecidable", kind: "unknown", selected: false },
  { path: "packages/ui", verdict: "undecidable", kind: "library", selected: false },
  { path: "packages/contracts", verdict: "probable", kind: "library", selected: false },
  { path: "packages/db", verdict: "probable", kind: "library", selected: false },
  { path: "packages/domain", verdict: "probable", kind: "library", selected: false },
];

describe("filter cases", () => {
  test("each clinic unit keeps the invariant, and the scanner fields stay out of the claim", async () => {
    const result = await runSurfacePipeline(clinic(), scanner);
    const row = (path: string) => result.diffs.find((diff) => diff.unit === path);
    const expectRun = (path: string, category: string, file: string) => {
      const diff = row(path);
      expect(diff?.agent.verified).toBe(true);
      expect(diff?.agent.claim).toBe("runs");
      expect(diff?.agent.category).toBe(category);
      expect(diff?.agent.entrypoint?.file).toBe(file);
      expect(diff?.cell).toBe("both_surface");
    };

    expectRun("apps/api", "service", "apps/api/src/server.ts");
    expect(row("apps/api")?.agent.evidence_kind).toBe("resolved_declaration");
    expect(JSON.stringify(row("apps/api")?.agent)).not.toContain("SENTINEL");
    expectRun("apps/console", "service", "apps/console/app/api/route.ts");
    expectRun("apps/marketing", "static-web", "apps/marketing/next.config.ts");
    expectRun("apps/agent-worker", "worker", "apps/agent-worker/worker.py");
    // serve_forever binds and blocks, so the invariant is service, not worker.
    expectRun("apps/browser-runner", "service", "apps/browser-runner/server.py");

    const voice = row("apps/voice-worker");
    expect(voice?.agent.claim).toBe("does_not_run");
    expect(voice?.agent.category).toBe("placeholder");
    expect(voice?.agent.verified).toBe(true);
    expect(voice?.agent.searched.globs.length).toBeGreaterThan(0);
    expect(voice?.agent.searched.files_opened).toContain("apps/voice-worker/pyproject.toml");
    expect(voice?.agent.counter_checked).not.toBe(voice?.agent.counter_hypothesis);
    expect(voice?.cell).toBe("both_drop");

    for (const path of ["packages/ui", "packages/contracts", "packages/db", "packages/domain"]) {
      const diff = row(path);
      expect(diff?.agent.claim).toBe("does_not_run");
      expect(diff?.agent.category).toBe("library");
      expect(diff?.agent.verified).toBe(true);
      expect(diff?.cell).toBe("both_drop");
    }

    const extension = row("apps/extension");
    expect(extension?.agent.claim).toBe("does_not_run");
    expect(extension?.agent.category).toBe("placeholder");
    expect(extension?.agent.verified).toBe(true);

    const root = row(".");
    expect(root?.agent.claim).toBe("does_not_run");
    expect(root?.agent.category).toBe("ambiguous");
    expect(root?.agent.verified).toBe(true);

    const sandbox = row("apps/sandbox");
    expect(sandbox?.cell).toBe("agent_only");
    expect(sandbox?.action).toBe("review");
    expect(sandbox?.agent.verified).toBe(true);

    const promotion = promoteSelection(result.diffs);
    expect(promotion.selected).toContain("apps/api");
    expect(promotion.selected).not.toContain("apps/sandbox");
    expect(promotion.review).toContain("apps/sandbox");
    expect(result.mode).toBe("shadow");
    expect(result.promotion).toBeNull();
  });
});
