import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { join } from "node:path";
import { checkout, parseGitLink } from "./cli";
import { detectSurfaces } from "./detect/detect-surfaces";
import { partitionSurfaces } from "./select";
import { runSurfacePipeline } from "./src/surface/pipeline";
import { boxTable } from "./src/surface/report";
import type { Diff } from "./src/surface/types";

export type CatalogRepo = {
  id: string;
  tier: number;
  name: string;
  url: string;
  languages: string[];
  probes: string;
  note: string;
  runnable?: boolean;
  /** When set, these repos are cloned into one parent and investigated together. */
  clones?: { dir: string; url: string }[];
};

export type Catalog = {
  runOrder: string[];
  repos: CatalogRepo[];
};

export type SuiteResult = {
  id: string;
  url: string;
  zones: number;
  selected: string[];
  held: { path: string; kind: string; verdict: string; reason: string }[];
  cells: Record<string, number>;
  agreed: {
    unit: string;
    citation: string;
  }[];
  disagreements: {
    unit: string;
    cell: string;
    action: string;
    scanner: string;
    agent: string;
    citation: string;
  }[];
  conventions: { rule: string; exceptions: string[] }[];
  error?: string;
};

const CATALOG_PATH = join(import.meta.dir, "suite", "repos.json");
const RESULTS_DIR = join(import.meta.dir, "suite", "results");

export async function loadCatalog(): Promise<Catalog> {
  return JSON.parse(await readFile(CATALOG_PATH, "utf8")) as Catalog;
}

export function runnableRepos(catalog: Catalog): CatalogRepo[] {
  return catalog.repos.filter((repo) => repo.runnable !== false);
}

/** An id, a catalog URL, `order`, or `tier:N`. */
export function pickRepos(catalog: Catalog, query: string): CatalogRepo[] | "list" {
  const text = query.trim().toLowerCase();
  if (text === "" || text === "list") return "list";
  if (text === "order" || text === "--order") {
    return catalog.runOrder.map((id) => {
      const repo = catalog.repos.find((item) => item.id === id);
      if (!repo) throw new Error(`run order names unknown id ${id}`);
      return repo;
    });
  }
  const tier = /^tier:(\d+)$/.exec(text);
  if (tier) {
    const n = Number(tier[1]);
    return runnableRepos(catalog).filter((repo) => repo.tier === n);
  }
  const byId = catalog.repos.find((repo) => repo.id === text);
  if (byId) return [byId];
  const byUrl = catalog.repos.find((repo) => repo.url.toLowerCase() === query.trim().toLowerCase());
  if (byUrl) return [byUrl];
  throw new Error(`no catalog entry for ${query}`);
}

function scannerLabel(diff: Diff): string {
  if (diff.scanner.selected) return "surface";
  if (diff.scanner.kind === "library") return "library";
  return "drop";
}

function agentLabel(diff: Diff): string {
  const claim = diff.agent;
  if (!claim.verified || claim.downgraded_to === "uncertain" || claim.claim === "uncertain") return "uncertain";
  return claim.claim === "runs" ? "runs(verified)" : claim.claim;
}

async function materialise(repo: CatalogRepo): Promise<string> {
  if (!repo.clones || repo.clones.length === 0) {
    const link = parseGitLink(repo.url);
    if (!link) throw new Error(`${repo.id} has a URL the checkout cannot use: ${repo.url}`);
    return checkout(link);
  }
  const parent = await mkdtemp(join(tmpdir(), "surface-suite-"));
  try {
    for (const clone of repo.clones) {
      const link = parseGitLink(clone.url);
      if (!link) throw new Error(`${repo.id} clone ${clone.url} is not a GitHub repository`);
      const dir = await checkout(link);
      await rename(dir, join(parent, clone.dir));
    }
    return parent;
  } catch (error) {
    await rm(parent, { recursive: true, force: true });
    throw error;
  }
}

export async function runCatalogRepo(repo: CatalogRepo): Promise<SuiteResult> {
  if (repo.runnable === false) {
    return {
      id: repo.id,
      url: repo.url,
      zones: 0,
      selected: [],
      held: [],
      cells: {},
      agreed: [],
      disagreements: [],
      conventions: [],
      error: repo.note,
    };
  }
  console.log(`\n${repo.name}  ${repo.url}`);
  console.log(repo.note);
  const dir = await materialise(repo);
  try {
    const found = await detectSurfaces({ cwd: dir });
    const { surfaces, held } = partitionSurfaces(found.surfaces);
    const selected = new Set(surfaces.map((zone) => zone.path));
    const shadow = await runSurfacePipeline(
      dir,
      found.surfaces.map((zone) => ({
        path: zone.path,
        verdict: zone.verdict,
        kind: zone.kind,
        selected: selected.has(zone.path),
      }))
    );
    const cells: Record<string, number> = {};
    const agreed = [];
    const disagreements = [];
    for (const diff of shadow.diffs) {
      cells[diff.cell] = (cells[diff.cell] ?? 0) + 1;
      const citation = diff.agent.entrypoint ? `${diff.agent.entrypoint.file}:${diff.agent.entrypoint.line}` : "—";
      if (diff.cell === "both_drop") continue;
      if (diff.cell === "both_surface") {
        agreed.push({ unit: diff.unit, citation });
        continue;
      }
      disagreements.push({
        unit: diff.unit,
        cell: diff.cell,
        action: diff.action,
        scanner: scannerLabel(diff),
        agent: agentLabel(diff),
        citation,
      });
    }
    const result: SuiteResult = {
      id: repo.id,
      url: repo.url,
      zones: found.zonesExamined,
      selected: surfaces.map((zone) => zone.path).sort(),
      held: held
        .map((zone) => ({
          path: zone.path,
          kind: zone.kind,
          verdict: zone.verdict,
          reason: zone.reason,
        }))
        .sort((a, b) => a.path.localeCompare(b.path)),
      cells,
      agreed,
      disagreements,
      conventions: shadow.conventions.map((convention) => ({
        rule: convention.rule,
        exceptions: [...convention.exceptions],
      })),
    };
    console.log(shadow.summary);
    console.log(
      `${result.selected.length} selected from ${result.zones} zones. ${result.held.length} not selected. agreed ${result.agreed.length}. disagreements ${result.disagreements.length}.`
    );
    if (result.selected.length > 0) console.log(`selected: ${result.selected.join(", ")}`);
    if (result.disagreements.length > 0) {
      console.log(
        boxTable(
          ["Unit", "Scanner", "Agent", "Cell", "Action", "Citation"],
          result.disagreements.map((row) => [
            row.unit,
            row.scanner,
            row.agent,
            row.cell,
            row.action,
            row.citation,
          ]),
          [28, undefined, undefined, undefined, undefined, 42]
        )
      );
    }
    return result;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function printList(catalog: Catalog): void {
  console.log(
    boxTable(
      ["Id", "Tier", "Name", "Run"],
      catalog.repos.map((repo) => [repo.id, String(repo.tier), repo.name, repo.runnable === false ? "no" : "yes"]),
      [22, 6, 28, 5]
    )
  );
  console.log("\nPick an id, tier:N, or order.");
  console.log(`Short run: ${catalog.runOrder.join(" → ")}`);
}

async function ask(argv: readonly string[]): Promise<string> {
  const given = argv.slice(2).join(" ").trim();
  if (given) return given;
  printList(await loadCatalog());
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question("Run: ")).trim();
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const catalog = await loadCatalog();
  const query = await ask(process.argv);
  const picked = pickRepos(catalog, query);
  if (picked === "list") {
    printList(catalog);
    return;
  }
  await mkdir(RESULTS_DIR, { recursive: true });
  const results: SuiteResult[] = [];
  for (const repo of picked) {
    try {
      const result = await runCatalogRepo(repo);
      results.push(result);
      await writeFile(join(RESULTS_DIR, `${repo.id}.json`), JSON.stringify(result, null, 2));
    } catch (error) {
      const message = error instanceof Error ? error.message : "run failed";
      console.error(`${repo.id}: ${message}`);
      const failed: SuiteResult = {
        id: repo.id,
        url: repo.url,
        zones: 0,
        selected: [],
        held: [],
        cells: {},
        agreed: [],
        disagreements: [],
        conventions: [],
        error: message,
      };
      results.push(failed);
      await writeFile(join(RESULTS_DIR, `${repo.id}.json`), JSON.stringify(failed, null, 2));
      break;
    }
  }
  await writeFile(join(RESULTS_DIR, "summary.json"), JSON.stringify(results, null, 2));
  console.log(`\nWrote ${results.length} result(s) to suite/results/`);
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Suite failed.");
    process.exitCode = 1;
  });
}
