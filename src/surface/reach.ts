import { codeLines, lexLang, type LexLang } from "./lex";

const SOURCE = /\.(py|ts|tsx|js|mjs|cjs|mts|cts|go|rs|java|kt)$/;
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
  const lang = lexLang(file);
  if (lang === "go" || lang === "rust") {
    return inReachableScope(braceScopes(lines, /\bfunc\s+main\s*\(|\bfn\s+main\s*\(/, lang), lineNo);
  }
  if (lang === "java") {
    return inReachableScope(braceScopes(lines, /\bvoid\s+main\s*\(/, lang), lineNo);
  }
  if (lang === "js") return inReachableScope(braceScopes(lines, /$^/, lang), lineNo);
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

function braceScopes(
  lines: readonly string[],
  entry: RegExp,
  lang: LexLang
): { scopes: Scope[]; calls: Map<string | null, Set<string>> } {
  const scopes: Scope[] = [];
  let depth = 0;
  const stack: { name: string | null; depth: number; start: number }[] = [];
  const codes = codeLines(lines.join("\n"), lang === "py" ? "x.py" : lang === "go" ? "x.go" : lang === "rust" ? "x.rs" : lang === "java" ? "x.java" : "x.ts");
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i] ?? "";
    const named = /(?:function\s+(\w+)|func\s+(\w+)\s*\(|fn\s+(\w+)\s*\(|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>)|(?:void|fun)\s+(\w+)\s*\()/.exec(
      code
    );
    const name = named?.[1] || named?.[2] || named?.[3] || named?.[4] || named?.[5] || null;
    const opens = (code.match(/\{/g) ?? []).length;
    const closes = (code.match(/\}/g) ?? []).length;
    if ((name || entry.test(code)) && opens > 0) {
      stack.push({ name: entry.test(code) ? "main" : name, depth: depth + 1, start: i });
    }
    depth += opens - closes;
    while (stack.length > 0 && depth < stack[stack.length - 1]!.depth) {
      const closed = stack.pop()!;
      scopes.push({ name: closed.name, start: closed.start, end: i + 1 });
    }
  }
  for (const open of stack) scopes.push({ name: open.name, start: open.start, end: lines.length });
  return { scopes, calls: callsFrom(codes, scopes, (line) => line) };
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
