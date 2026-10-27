# Rejected claim — what fails and why

## Example 1: config line cited for a service
```json
{
  "unit": "apps/marketing",
  "claim": "runs",
  "category": "service",
  "entrypoint": {"file": "apps/marketing/next.config.ts", "line": 3, "snippet": "const nextConfig = {}"},
  ...
}
```
**Rejected because:** `next.config.ts:3` does not bind a port. The service citation is the `next start` line in `package.json`.

## Example 2: route handler cited for a service
```json
{
  "unit": "apps/console",
  "claim": "runs",
  "category": "service",
  "entrypoint": {"file": "apps/console/app/api/[...path]/route.ts", "line": 22, "snippet": "export async function GET(...)"},
  ...
}
```
**Rejected because:** a route handler export does not bind a port. The service citation is the `next start` line in `package.json`.

## Example 3: constructor cited for a service
```json
{
  "unit": "apps/api",
  "claim": "runs",
  "category": "service",
  "entrypoint": {"file": "apps/api/src/server.ts", "line": 26, "snippet": "new Hono()"},
  ...
}
```
**Rejected because:** `new Hono()` constructs an app, it does not listen. If `serve({ fetch: app.fetch })` is on a later line, cite that line. If no listener is in the file, the claim is `uncertain`, not `service`.

## Example 4: empty search for a negative
```json
{
  "unit": "apps/voice-worker",
  "claim": "does_not_run",
  "category": "placeholder",
  "searched": {"globs": [], "greps": [], "files_opened": []},
  ...
}
```
**Rejected because:** `searched` is empty. The claim is indistinguishable from "I didn't look." The correct claim includes every glob run, every grep run, and every file opened during the search.
