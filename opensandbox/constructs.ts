/**
 * The category table from the surface-detection skill.
 * A cited line has to match one of these patterns itself.
 * `new Hono(`, a route export, and `next.config` are not in the service set.
 */

export type SurfaceCategory = "service" | "worker" | "static-web" | "cli";

const SERVICE = [
  /\.listen\s*\(/,
  /\bserve\s*\(/,
  /\bhttps?\.createServer\s*\(/,
  /\bBun\.serve\s*\(/,
  /\bapp\.listen\s*\(/,
  /\buvicorn\.run\b/,
  /\bapp\.run\s*\(/,
  /\.serve_forever\s*\(/,
  /\bThreadingHTTPServer\s*\(/,
  /\bHTTPServer\s*\(/,
  /\bhttp\.ListenAndServe\s*\(/,
  /\bhttp\.Serve\s*\(/,
  /\bnet\.Listen\s*\(/,
  /\bTcpListener::bind\s*\(/,
  /\baxum::serve\s*\(/,
  /\bactix_web::HttpServer/,
  /\bget_wsgi_application\s*\(/,
  /\b(?!asyncio\b)(?!worker\b)\w+\.run\s*\(/,
  /\.run_app\s*\(/,
  /\bexecute_from_command_line\s*\(/,
  /\.Run\s*\(/,
  /\.Start\s*\(/,
  /\.Listen\s*\(/,
  /\bHttpServer::new\s*\(/,
  /\bServer::bind\s*\(/,
  /\.bind\s*\(/,
  /\.serve\s*\(/,
  /\bSpringApplication\.run\s*\(/,
  /\bport\s*\(\s*\d+/,
];

/** `next start` / `gunicorn` live on the manifest line. They are the listener. */
const FRAMEWORK_SERVICE = [
  /\bnext\s+(?:start|dev)\b/,
  /\bgunicorn\b/,
  /\brunserver\b/,
];

const WORKER = [
  /\bwhile\s+True\s*:/,
  /\basyncio\.run\s*\(/,
  /\bworker\.run\s*\(/,
  /\b@app\.task\b/,
  /\bcelery\.task\b/,
  /\b@shared_task\b/,
  /\.consume\s*\(/,
  /\breceive_message\s*\(/,
  /\.start\s*(?:::|<|\()/,
];

const STATIC_WEB = [
  /\bconst\s+nextConfig\b/,
  /\bexport\s+default\s+nextConfig\b/,
  /<script\b[^>]*\bsrc\s*=/i,
  /<link\b[^>]*\brel\s*=/i,
];

const CLI = [
  /\bargparse\b/,
  /\bArgumentParser\s*\(/,
  /(?:^|\s)(?:import|from)\s+click\b/,
  /\bclick\.(?:command|group|option)\b/,
  /\btyper\.Typer\b/,
  /\bclap::/,
  /\bcobra\.Command\b/,
  /\bprocess\.argv\b/,
];

/** Looks like execution to a ranker. It is not a listener. */
const NOT_A_LISTENER: { pattern: RegExp; label: string }[] = [
  { pattern: /\bnew\s+Hono\s*\(/, label: "framework constructor" },
  { pattern: /\bexpress\s*\(\s*\)/, label: "framework constructor" },
  { pattern: /\bFastAPI\s*\(/, label: "framework constructor" },
  { pattern: /\bFlask\s*\(/, label: "framework constructor" },
  {
    pattern: /\bexport\s+(?:async\s+)?function\s+(?:GET|POST|PUT|PATCH|DELETE|HEAD)\b/,
    label: "route handler",
  },
  { pattern: /\bconst\s+nextConfig\b/, label: "config file" },
];

export const TOOLING = /^(?:vitest|jest|eslint|prettier|tsc|biome|playwright|next\s+build|next\s+lint)\b/;

const ORDER: { category: SurfaceCategory; patterns: RegExp[] }[] = [
  { category: "service", patterns: SERVICE },
  { category: "worker", patterns: WORKER },
  { category: "cli", patterns: CLI },
  { category: "static-web", patterns: STATIC_WEB },
];

export type LineHit = {
  line: number;
  snippet: string;
  category: SurfaceCategory;
};

function hits(line: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(line);
  });
}

/** Earliest line of the strongest legal category. Constructors are skipped. */
export function legalLine(text: string): LineHit | null {
  const lines = text.split(/\r?\n/);
  for (const { category, patterns } of ORDER) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      if (!hits(line, patterns)) continue;
      return { line: i + 1, snippet: line.trim().slice(0, 180), category };
    }
  }
  return null;
}

export function frameworkLine(text: string): LineHit | null {
  const lines = text.split(/\r?\n/);
  const found: LineHit[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (!hits(line, FRAMEWORK_SERVICE)) continue;
    if (TOOLING.test(line.trim())) continue;
    found.push({ line: i + 1, snippet: line.trim().slice(0, 180), category: "service" });
  }
  return (
    found.find((hit) => /\bnext\s+start\b|\bgunicorn\b|\brunserver\b/.test(hit.snippet)) ??
    found[0] ??
    null
  );
}

export function isFrameworkCommand(command: string): boolean {
  return hits(command, FRAMEWORK_SERVICE) && !TOOLING.test(command.trim());
}

/** Why a file that has no legal line still looks like a program. */
export function refusal(text: string): string | null {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    for (const item of NOT_A_LISTENER) {
      item.pattern.lastIndex = 0;
      if (item.pattern.test(line)) return item.label;
    }
  }
  return null;
}

export function patternsFor(category: string, manifest: boolean): RegExp[] {
  if (category === "service") return manifest ? [...SERVICE, ...FRAMEWORK_SERVICE] : SERVICE;
  if (category === "worker") return WORKER;
  if (category === "static-web") return STATIC_WEB;
  if (category === "cli") return CLI;
  return [];
}

export function citedLineMatches(text: string, line: number, category: string, manifest: boolean): boolean {
  const source = text.split(/\r?\n/)[line - 1] ?? "";
  return hits(source, patternsFor(category, manifest));
}
