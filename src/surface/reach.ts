const SOURCE = /\.(py|ts|tsx|js|mjs|cjs|mts|cts|go|rs)$/;
const MANIFEST = /(?:^|\/)(package\.json|pyproject\.toml|Dockerfile|Procfile|go\.mod|Cargo\.toml)$/;

/** A runs citation has to be source or a package file. README and other prose are not. */
export function isCitationFile(file: string): boolean {
  return SOURCE.test(file) || MANIFEST.test(file);
}

export function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("#")
  );
}

/** A service line that only exports or declares a function does not start anything. */
export function isExportOnly(line: string): boolean {
  return /^\s*(?:export\s+(?:default\s+)?)?(?:async\s+)?function\b|^\s*export\s+(?:default\s+)?(?:async\s+)?(?:function|const|class|let|var)\b|^\s*export\s*\{|^\s*export\s+default\b|^\s*module\.exports\b|^\s*(?:async\s+)?function\s+\w+/.test(
    line
  );
}

/**
 * The cited line runs on its own, or it sits in a function the module actually calls.
 * `func main` / `fn main` and `if __name__` count as the start. A function nobody calls does not.
 */
export function lineIsReachable(text: string, lineNo: number, file: string): boolean {
  const lines = text.split(/\r?\n/);
  const line = lines[lineNo - 1] ?? "";
  if (isCommentLine(line)) return false;
  if (MANIFEST.test(file)) return true;
  if (file.endsWith(".py")) return inReachableScope(pythonScopes(lines), lineNo);
  if (/\.(go|rs)$/.test(file)) return inReachableScope(braceScopes(lines, /\bfunc\s+main\s*\(|\bfn\s+main\s*\(/), lineNo);
  if (/\.(ts|tsx|js|mjs|cjs|mts|cts)$/.test(file)) return inReachableScope(braceScopes(lines, /$^/), lineNo);
  return false;
}

type Scope = { name: string | null; start: number; end: number };

function inReachableScope(info: { scopes: Scope[]; calls: Map<string | null, Set<string>> }, lineNo: number): boolean {
  const reachable = new Set<string | null>([null, "__main__", "main"]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const scope of reachable) {
      for (const callee of info.calls.get(scope) ?? []) {
        if (!reachable.has(callee)) {
          reachable.add(callee);
          grew = true;
        }
      }
    }
  }
  return reachable.has(scopeAt(info.scopes, lineNo));
}

function scopeAt(scopes: readonly Scope[], lineNo: number): string | null {
  const index = lineNo - 1;
  let best: Scope | null = null;
  for (const scope of scopes) {
    if (index < scope.start || index >= scope.end) continue;
    if (!best || scope.start >= best.start) best = scope;
  }
  return best?.name ?? null;
}

function pythonScopes(lines: readonly string[]): { scopes: Scope[]; calls: Map<string | null, Set<string>> } {
  const scopes: Scope[] = [];
  for (let i = 0; i < lines.length; i++) {
    const header = /^(\s*)(?:async\s+)?def\s+(\w+)\b/.exec(lines[i] ?? "");
    const main = /^if\s+__name__\s*==\s*["']__main__["']\s*:/.exec((lines[i] ?? "").trim());
    if (!header && !main) continue;
    const indent = header ? header[1]!.length : 0;
    const name = header ? header[2]! : "__main__";
    let end = lines.length;
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j] ?? "";
      if (next.trim() === "" || next.trim().startsWith("#")) continue;
      if ((next.match(/^\s*/)?.[0].length ?? 0) <= indent) {
        end = j;
        break;
      }
    }
    scopes.push({ name, start: i + 1, end });
  }
  return { scopes, calls: callsFrom(lines, scopes, (line) => line.replace(/#.*$/, "")) };
}

function braceScopes(lines: readonly string[], entry: RegExp): { scopes: Scope[]; calls: Map<string | null, Set<string>> } {
  const scopes: Scope[] = [];
  let depth = 0;
  let block = false;
  const stack: { name: string | null; depth: number; start: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    let code = "";
    const raw = lines[i] ?? "";
    if (block) {
      const close = raw.indexOf("*/");
      if (close === -1) continue;
      block = false;
      code = raw.slice(close + 2);
    } else {
      code = raw.replace(/\/\/.*$/, "");
      const open = code.indexOf("/*");
      if (open !== -1) {
        const close = code.indexOf("*/", open + 2);
        if (close === -1) {
          block = true;
          code = code.slice(0, open);
        } else {
          code = code.slice(0, open) + code.slice(close + 2);
        }
      }
    }
    code = code.replace(/"(?:\\.|[^"])*"/g, '""').replace(/'(?:\\.|[^'])*'/g, "''");
    const named = /(?:function\s+(\w+)|func\s+(\w+)\s*\(|fn\s+(\w+)\s*\(|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>))/.exec(
      code
    );
    const name = named?.[1] || named?.[2] || named?.[3] || named?.[4] || null;
    const opens = (code.match(/\{/g) ?? []).length;
    const closes = (code.match(/\}/g) ?? []).length;
    if (name && depth === 0 && opens > 0) {
      stack.push({ name: entry.test(raw) ? "main" : name, depth: depth + 1, start: i });
    } else if (entry.test(raw) && depth === 0 && opens > 0) {
      stack.push({ name: "main", depth: depth + 1, start: i });
    }
    depth += opens - closes;
    while (stack.length > 0 && depth < stack[stack.length - 1]!.depth) {
      const closed = stack.pop()!;
      scopes.push({ name: closed.name, start: closed.start, end: i + 1 });
    }
  }
  for (const open of stack) scopes.push({ name: open.name, start: open.start, end: lines.length });
  return { scopes, calls: callsFrom(lines, scopes, (line) => line.replace(/\/\/.*$/, "")) };
}

function callsFrom(
  lines: readonly string[],
  scopes: readonly Scope[],
  clean: (line: string) => string
): Map<string | null, Set<string>> {
  const calls = new Map<string | null, Set<string>>();
  for (let i = 0; i < lines.length; i++) {
    if (isCommentLine(lines[i] ?? "")) continue;
    const scope = scopeAt(scopes, i + 1);
    const bucket = calls.get(scope) ?? new Set<string>();
    for (const match of clean(lines[i] ?? "").matchAll(/\b([A-Za-z_]\w*)\s*\(/g)) bucket.add(match[1]!);
    calls.set(scope, bucket);
  }
  return calls;
}

function scopeAt(scopes: readonly Scope[], lineNo: number): string | null {
  const index = lineNo - 1;
  let best: Scope | null = null;
  for (const scope of scopes) {
    if (index < scope.start || index >= scope.end) continue;
    if (!best || scope.start >= best.start) best = scope;
  }
  return best?.name ?? null;
}
