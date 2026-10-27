import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SKIP_DIRS } from "./files";
import type { VerifiedClaim } from "./types";

const CACHE_DIR = ".surface-cache";

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort((a, b) => a[0].localeCompare(b[0]));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function promptVersion(): Promise<string> {
  const dir = new URL("./prompts/", import.meta.url);
  const unit = await readFile(new URL("unit-investigate.md", dir));
  const repo = await readFile(new URL("repo-conventions.md", dir));
  return createHash("sha256").update(unit).update(repo).digest("hex").slice(0, 16);
}

async function repoSha(repoRoot: string): Promise<string> {
  const proc = Bun.spawn(["git", "-C", repoRoot, "rev-parse", "HEAD"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const code = await proc.exited;
  const out = (await new Response(proc.stdout).text()).trim();
  if (code === 0 && /^[0-9a-f]{7,}$/.test(out)) return out;
  return hashTree(repoRoot);
}

async function hashTree(repoRoot: string): Promise<string> {
  const hash = createHash("sha256");
  await walk(repoRoot, "", hash);
  return hash.digest("hex").slice(0, 16);
}

async function walk(dir: string, rel: string, hash: ReturnType<typeof createHash>): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === CACHE_DIR || SKIP_DIRS.has(entry.name)) continue;
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      await walk(join(dir, entry.name), relPath, hash);
      continue;
    }
    if (!entry.isFile()) continue;
    hash.update(relPath);
    hash.update(await readFile(join(dir, entry.name)));
  }
}

/**
 * Same repo, unit, and prompt must reproduce the claim.
 * A mismatch is logged and left in the cache so the next run reports it again.
 */
export async function rememberClaim(
  repoRoot: string,
  claim: VerifiedClaim
): Promise<"stored" | "match" | "flip"> {
  const key = createHash("sha256")
    .update(await repoSha(repoRoot))
    .update(claim.unit)
    .update(await promptVersion())
    .digest("hex")
    .slice(0, 24);
  const dir = join(repoRoot, CACHE_DIR);
  const path = join(dir, `${key}.json`);
  const body = stable(claim);
  let previous: string | null = null;
  try {
    previous = await readFile(path, "utf8");
  } catch {
    previous = null;
  }
  if (previous === null) {
    await mkdir(dir, { recursive: true });
    await writeFile(path, body);
    return "stored";
  }
  if (previous === body) return "match";
  console.error(`FLIP_DETECTED ${claim.unit} ${key}`);
  return "flip";
}
