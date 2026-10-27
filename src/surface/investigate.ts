import { join } from "node:path";
import { extractorsFor } from "./extractors";
import { listFiles } from "./files";
import { cite, readText, type Hit } from "./extractors/scan";
import type { Category, Claim, Unit } from "./types";

const RANK: Record<string, number> = {
  listener: 70,
  route_handler: 60,
  container: 50,
  event_loop: 40,
  site_config: 30,
  document: 20,
  cli: 15,
  main_guard: 10,
};

const SOURCE = /\.(py|ts|tsx|js|mjs|cjs|go|rs|html)$/;

type Found = Hit & {
  file: string;
  ecosystem: string;
  fromDeclaration: boolean;
};

export type InvestigateContext = {
  flag?: string;
  nested: boolean;
  imported: boolean;
};

/**
 * Level 2. Eight steps, each a value. The scanner's verdict is not an input.
 */
export async function investigateUnit(
  repoRoot: string,
  unit: Unit,
  context: InvestigateContext & { stayOut?: readonly string[] }
): Promise<Claim> {
  const tools = extractorsFor(unit, repoRoot);
  const skip = tools.flatMap((tool) => tool.exclusions());
  const scope = await listFiles(
    unit.path === "." ? repoRoot : join(repoRoot, unit.path),
    unit.path,
    3,
    skip,
    context.stayOut ?? []
  );

  const facts = [];
  for (const tool of tools) facts.push({ tool, facts: await tool.readManifest(unit) });
  const deps: Record<string, string> = {};
  const descriptions: string[] = [];
  const leads: { lead: string; ecosystem: string }[] = [];
  let exportsOnly = false;
  for (const entry of facts) {
    Object.assign(deps, entry.facts.deps);
    if (entry.facts.description) descriptions.push(entry.facts.description);
    if (entry.facts.exportsOnly) exportsOnly = true;
    for (const script of entry.facts.scripts) leads.push({ lead: script, ecosystem: entry.tool.ecosystem });
    for (const bin of entry.facts.bins) leads.push({ lead: bin, ecosystem: entry.tool.ecosystem });
  }
  const sourceFiles = scope.files.filter((file) => SOURCE.test(file) && !file.endsWith(".d.ts"));
  const placeholderSignals = [
    ...descriptions,
    ...(Object.keys(deps).length === 0 ? ["no dependencies"] : []),
    ...(sourceFiles.length === 0 ? ["no source files"] : []),
  ];

  const searched = {
    globs: tools.map((tool) => `${tool.ecosystem}:**/*`).sort(),
    greps: leads.length > 0 ? leads.map((lead) => `resolve:${lead.lead}`) : ["resolve:no-scripts"],
    files_opened: [
      ...unit.manifests.map((name) => (unit.path === "." ? name : `${unit.path}/${name}`)),
    ],
  };

  const resolved: Found[] = [];
  const unresolved: string[] = [];
  for (const lead of leads) {
    const tool = tools.find((candidate) => candidate.ecosystem === lead.ecosystem);
    if (!tool) continue;
    const resolution = await tool.resolveDeclaration(unit, lead.lead);
    if ("unresolved" in resolution) {
      unresolved.push(`${lead.lead}: ${resolution.unresolved}`);
      continue;
    }
    const text = await readText(join(repoRoot, resolution.file));
    if (text === null) {
      unresolved.push(`${lead.lead}: missing ${resolution.file}`);
      continue;
    }
    const cited =
      "line" in resolution
        ? cite(text, tool.executionIdioms())
        : tools
            .map((candidate) => {
              const hit = cite(text, candidate.executionIdioms());
              return hit ? { hit, ecosystem: candidate.ecosystem } : null;
            })
            .filter((item): item is { hit: Hit; ecosystem: string } => item !== null)
            .sort((a, b) => (RANK[b.hit.construct] ?? 0) - (RANK[a.hit.construct] ?? 0))[0];
    if (!cited) continue;
    const hit = "hit" in cited ? cited.hit : cited;
    const ecosystem = "hit" in cited ? cited.ecosystem : tool.ecosystem;
    if ("line" in resolution && hit.line !== resolution.line) continue;
    const fromContainer = tool.ecosystem === "docker";
    resolved.push({
      ...hit,
      file: resolution.file,
      ecosystem,
      fromDeclaration: !fromContainer,
      ...(fromContainer ? { evidence_kind: "container_cmd" as const } : {}),
    });
    if (!searched.files_opened.includes(resolution.file)) searched.files_opened.push(resolution.file);
  }

  const hunted: Found[] = [];
  if (resolved.length === 0) {
    for (const file of scope.files) {
      if (/(?:^|\/)(Dockerfile|Procfile|package\.json|pyproject\.toml|go\.mod|Cargo\.toml)$/.test(file)) {
        continue;
      }
      const abs = join(repoRoot, file);
      const text = await readText(abs);
      if (text === null) continue;
      for (const tool of tools) {
        const hit = cite(text, tool.executionIdioms());
        if (!hit) continue;
        const idiom = tool.executionIdioms().find((item) => item.construct === hit.construct);
        if (idiom) searched.greps.push(idiom.grep.source);
        hunted.push({ ...hit, file, ecosystem: tool.ecosystem, fromDeclaration: false });
      }
    }
  }

  let hits = resolved.length > 0 ? resolved : hunted;
  if (context.nested) {
    hits = hits.filter((hit) => hit.construct !== "document" && hit.construct !== "site_config");
  }
  hits.sort((a, b) => (RANK[b.construct] ?? 0) - (RANK[a.construct] ?? 0) || a.file.localeCompare(b.file) || a.line - b.line);
  const best = hits[0];
  const category = classify(best, {
    exportsOnly,
    imported: context.imported,
    sourceFiles: sourceFiles.length,
    deps: Object.keys(deps).length,
  });
  const runs = best !== undefined && category !== "library" && category !== "tooling" && category !== "placeholder" && category !== "ambiguous";

  const searchedRecord = {
    globs: [...new Set(searched.globs)].sort(),
    greps: [...new Set(searched.greps)].sort(),
    files_opened: [...new Set(searched.files_opened)].sort(),
  };
  const openedManifest = searchedRecord.files_opened[0] ?? unit.path;
  const counter_hypothesis = runs
    ? "the cited construct is a test helper or a client call"
    : "an undeclared entry still executes";
  const counter_checked = runs && best
    ? `opened ${best.file} at line ${best.line}`
    : `opened ${openedManifest}; glob ${searchedRecord.globs[0] ?? "*"}`;

  const claim: Claim = {
    unit: unit.path,
    claim: runs ? "runs" : "does_not_run",
    category,
    ...(best && runs ? { ecosystem: best.ecosystem } : best ? { ecosystem: best.ecosystem } : {}),
    ...(runs && best
      ? {
          entrypoint: { file: best.file, line: best.line, snippet: best.snippet },
          evidence_kind: best.fromDeclaration ? "resolved_declaration" : best.evidence_kind,
        }
      : {}),
    searched: searchedRecord,
    counter_hypothesis,
    counter_checked,
    ...(context.flag ? { convention_flag: context.flag } : {}),
    ...(placeholderSignals.length > 0 ? { placeholder_signals: placeholderSignals } : {}),
    coverage: {
      inspected: scope.files.length,
      skipped: scope.skipped,
      uncertain: unresolved,
    },
    confidence: runs && best?.fromDeclaration ? "high" : runs ? "medium" : category === "ambiguous" ? "low" : "medium",
  };
  return claim;
}

function classify(
  best: Found | undefined,
  facts: { exportsOnly: boolean; imported: boolean; sourceFiles: number; deps: number }
): Category {
  if (!best) {
    if (facts.exportsOnly || facts.imported) return "library";
    if (facts.sourceFiles === 0 && facts.deps === 0) return "placeholder";
    return "ambiguous";
  }
  switch (best.construct) {
    case "listener":
    case "route_handler":
    case "container":
      return "service";
    case "event_loop":
      return "worker";
    case "site_config":
    case "document":
      return "static-web";
    case "cli":
      return "cli";
    case "main_guard":
      return "tooling";
    default:
      return "ambiguous";
  }
}
