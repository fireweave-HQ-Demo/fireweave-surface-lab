# Runs — service

The citation is the line that binds and blocks. The constructor on an earlier line is not the citation.

`apps/api` declares `dev: tsx src/server.ts`. That script is the lead. The file it names contains `const app = new Hono()` at line 26 and `serve({ fetch: app.fetch, port: env.port })` at line 275. Line 26 fails the service row. Line 275 is the claim.

```json
{
  "unit": "apps/api",
  "claim": "runs",
  "category": "service",
  "entrypoint": {
    "file": "apps/api/src/server.ts",
    "line": 275,
    "snippet": "serve({ fetch: app.fetch, port: env.port }, () => {"
  },
  "evidence_kind": "resolved_declaration",
  "searched": {
    "globs": ["apps/api/**/*.ts"],
    "greps": ["resolve:dev: tsx src/server.ts", "serve\\(", "\\.listen\\("],
    "files_opened": ["apps/api/package.json", "apps/api/src/server.ts"]
  },
  "counter_hypothesis": "wrong if scripts.dev points at a test runner, or if serve() is inside a function nothing calls",
  "counter_checked": "opened apps/api/package.json scripts.dev → tsx src/server.ts; opened apps/api/src/server.ts:275 → serve() at top level",
  "coverage": {
    "inspected": 11,
    "skipped": [{"path": "node_modules", "reason": "excluded"}],
    "uncertain": []
  },
  "confidence": "high"
}
```

A folder named `browser-runner` whose program ends in `ThreadingHTTPServer(...).serve_forever()` is the same category. The name suggested a worker. The line binds and blocks, so the category is `service`.

A Next app is also a service, and the citation is the `start` script, not the config and not a route handler. For `apps/marketing` that line is `package.json:8` (`next start --port 3001`). `next.config.ts:3` and `app/page.tsx` are not service evidence. See `rejected.md`.
