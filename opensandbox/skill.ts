import { join } from "node:path";
import { inferConventions } from "../src/surface/conventions";
import { extractorsFor, repoRelative, unitDir } from "../src/surface/extractors";
import { readText } from "../src/surface/extractors/scan";
import { listFiles } from "../src/surface/files";
import { inferTopology, type Exclusion } from "../src/surface/topology";
import type { Category, Claim, Convention, Unit } from "../src/surface/types";
import {
  TOOLING,
  frameworkLine,
  isFrameworkCommand,
  legalLine,
  refusal,
  type LineHit,
  type SurfaceCategory,
} from "./constructs";

const LEAD_KEYS = ["start", "serve", "dev", "worker", "CMD", "ENTRYPOINT"];
const SOURCE = /\.(py|ts|tsx|js|mjs|cjs|go|rs|html)$/;
const MANIFEST_NAME = /^(package\.json|pyproject\.toml|Dockerfile|Procfile|go\.mod|Cargo\.toml|index\.html)$/;

export type Citation = {
  file: string;
  line: number;
  snippet: string;
  category: SurfaceCategory;
  evidence_kind: "resolved_declaration" | "implicit_construct" | "container_cmd";
  execution_id: string;
};

export type SkillOutcome = {
  claims: Claim[];
  conventions: Convention[];
  excluded: Exclusion[];
};

type Lead = { key: string; command: string; manifest: string; manifestText: string };

function commandOf(script: string): { key: string; command: string } {
  const key = script.split(": ")[0] ?? script;
  const command = script.includes(": ") ? script.split(": ").slice(1).join(": ").trim() : script.trim();
  return { key, command };
}

function sourceFile(command: string): string | null {
  const tokens = command
    .replace(/[\[\]",]/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/^['"]|['"]$/g, "").replace(/^\.\//, ""))
    .filter(Boolean);
  for (const token of tokens) {
    if (/\.(py|ts|tsx|js|mjs|cjs|go|rs)$/.test(token)) return token;
  }
  for (const token of tokens) {
    if (/^[\w.]+:[\w.]+$/.test(token)) {
      const moduleName = token.split(":")[0] ?? "";
      if (moduleName && !moduleName.includes("/")) return `${moduleName.replaceAll(".", "/")}.py`;
    }
  }
  return null;
}

function rel(unit: Unit, name: string): string {
  return unit.path === "." ? name : `${unit.path}/${name}`;
}

function toClaim(
  unit: Unit,
  body: Omit<Claim, "unit" | "searched" | "counter_hypothesis" | "counter_checked" | "coverage"> & {
    searched: Claim["searched"];
    counter_hypothesis: string;
    counter_checked: string;
    coverage: Claim["coverage"];
  }
): Claim {
  return { unit: unit.path, ...body };
}

/**
 * Declarations only. A start script that names a file is followed to the legal
 * line in that file. `next start` is itself the listener. A constructor is not.
 */
export async function declaredCitations(repoRoot: string, unit: Unit): Promise<Citation[]> {
  const tools = extractorsFor(unit, repoRoot);
  const leads: Lead[] = [];
  for (const tool of tools) {
    const facts = await tool.readManifest(unit);
    for (const name of unit.manifests) {
      const text = await readText(join(unitDir(repoRoot, unit), name));
      if (!text) continue;
      for (const script of facts.scripts) {
        const { key, command } = commandOf(script);
        if (!LEAD_KEYS.includes(key)) continue;
        if (!text.includes(command) && !text.includes(key)) continue;
        leads.push({ key, command, manifest: rel(unit, name), manifestText: text });
      }
    }
  }

  const unique = new Map<string, Lead>();
  for (const lead of leads) unique.set(`${lead.manifest}:${lead.key}:${lead.command}`, lead);
  const ordered = [...unique.values()].sort(
    (a, b) => LEAD_KEYS.indexOf(a.key) - LEAD_KEYS.indexOf(b.key) || a.command.localeCompare(b.command)
  );

  const citations: Citation[] = [];
  let frameworkTaken = false;
  for (const lead of ordered) {
    if (TOOLING.test(lead.command)) continue;
    if (isFrameworkCommand(lead.command)) {
      if (frameworkTaken) continue;
      const hit = frameworkLine(lead.manifestText);
      if (!hit) continue;
      frameworkTaken = true;
      citations.push({
        ...hit,
        file: lead.manifest,
        evidence_kind: "resolved_declaration",
        execution_id: lead.key,
      });
      continue;
    }
    const token = sourceFile(lead.command);
    if (!token) continue;
    const abs = join(unitDir(repoRoot, unit), token);
    const text = await readText(abs);
    if (text === null) continue;
    const hit = legalLine(text);
    if (!hit) continue;
    const fromContainer = lead.key === "CMD" || lead.key === "ENTRYPOINT";
    citations.push({
      ...hit,
      file: repoRelative(repoRoot, abs),
      evidence_kind: fromContainer ? "container_cmd" : "resolved_declaration",
      execution_id: lead.key,
    });
  }
  return dedupe(citations);
}

function dedupe(citations: readonly Citation[]): Citation[] {
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const citation of citations) {
    const key = `${citation.file}:${citation.line}:${citation.category}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(citation);
  }
  return out;
}

async function hunt(
  repoRoot: string,
  unit: Unit,
  files: readonly string[],
  nested: boolean
): Promise<{ citations: Citation[]; opened: string[]; refused: string | null }> {
  const citations: Citation[] = [];
  const opened: string[] = [];
  let refused: string | null = null;
  for (const file of files) {
    if (MANIFEST_NAME.test(file.split("/").pop() ?? "")) continue;
    if (!SOURCE.test(file) || file.endsWith(".d.ts")) continue;
    const text = await readText(join(repoRoot, file));
    if (text === null) continue;
    opened.push(file);
    const hit: LineHit | null = legalLine(text);
    if (!hit) {
      refused ??= refusal(text);
      continue;
    }
    if (nested && hit.category === "static-web") continue;
    citations.push({
      ...hit,
      file,
      evidence_kind: "implicit_construct",
      execution_id: hit.category,
    });
  }
  return { citations: dedupe(citations), opened, refused };
}

function negativeCategory(facts: {
  exportsOnly: boolean;
  imported: boolean;
  sourceFiles: number;
  deps: number;
  onlyTooling: boolean;
}): Category {
  if (facts.exportsOnly || facts.imported) return "library";
  if (facts.sourceFiles === 0 && facts.deps === 0) return "placeholder";
  if (facts.onlyTooling && facts.sourceFiles === 0) return "tooling";
  return "ambiguous";
}

async function investigate(repoRoot: string, unit: Unit, context: {
  flag?: string;
  nested: boolean;
  imported: boolean;
  stayOut: readonly string[];
}): Promise<Claim[]> {
  const tools = extractorsFor(unit, repoRoot);
  const scope = await listFiles(
    unit.path === "." ? repoRoot : join(repoRoot, unit.path),
    unit.path,
    3,
    tools.flatMap((tool) => tool.exclusions()),
    context.stayOut
  );
  const manifests = unit.manifests.map((name) => rel(unit, name));
  const deps: Record<string, string> = {};
  const descriptions: string[] = [];
  let exportsOnly = false;
  let scriptCount = 0;
  let toolingCount = 0;
  const leadKeys: string[] = [];
  for (const tool of tools) {
    const facts = await tool.readManifest(unit);
    Object.assign(deps, facts.deps);
    if (facts.description) descriptions.push(facts.description);
    if (facts.exportsOnly) exportsOnly = true;
    for (const script of facts.scripts) {
      const { key, command } = commandOf(script);
      if (!LEAD_KEYS.includes(key)) continue;
      scriptCount += 1;
      leadKeys.push(key);
      if (TOOLING.test(command)) toolingCount += 1;
    }
  }
  const sourceFiles = scope.files.filter((file) => SOURCE.test(file) && !file.endsWith(".d.ts"));
  const declared = await declaredCitations(repoRoot, unit);
  const hunted = await hunt(repoRoot, unit, scope.files, context.nested);
  const hasService = declared.some((citation) => citation.category === "service") ||
    hunted.citations.some((citation) => citation.category === "service");
  const extra = hunted.citations.filter((citation) => {
    if (hasService && citation.category === "static-web") return false;
    return !declared.some((item) => item.file === citation.file && item.line === citation.line);
  });
  const citations = dedupe([...declared, ...extra]);

  const searched = {
    globs: [...new Set(tools.map((tool) => `${tool.ecosystem}:**/*`))].sort(),
    greps: [
      ...(leadKeys.length > 0 ? leadKeys.map((key) => `resolve:${key}`) : ["resolve:no-scripts"]),
      "serve\\(",
      "\\.listen\\(",
      "serve_forever",
      "asyncio.run",
      "next start",
    ].sort(),
    files_opened: [...new Set([...manifests, ...hunted.opened, ...citations.map((citation) => citation.file)])].sort(),
  };
  if (searched.globs.length === 0) searched.globs.push("*");
  const opened = searched.files_opened[0] ?? unit.path;
  const glob = searched.globs[0] ?? "*";
  const placeholderSignals = [
    ...descriptions,
    ...(Object.keys(deps).length === 0 ? ["no dependencies"] : []),
    ...(sourceFiles.length === 0 ? ["no source files"] : []),
  ];
  const coverage = {
    inspected: scope.files.length,
    skipped: scope.skipped,
    uncertain: citations.length === 0 && hunted.refused ? [hunted.refused] : [],
  };
  const shared = {
    searched,
    ...(context.flag ? { convention_flag: context.flag } : {}),
    ...(placeholderSignals.length > 0 ? { placeholder_signals: placeholderSignals } : {}),
    coverage,
  };

  if (citations.length === 0 && hunted.refused) {
    return [
      toClaim(unit, {
        ...shared,
        claim: "uncertain",
        category: "ambiguous",
        counter_hypothesis: "a listener exists on another line",
        counter_checked: `opened ${opened}; glob ${glob}`,
        confidence: "low",
      } as Claim),
    ];
  }

  if (citations.length === 0) {
    const category = negativeCategory({
      exportsOnly,
      imported: context.imported,
      sourceFiles: sourceFiles.length,
      deps: Object.keys(deps).length,
      onlyTooling: scriptCount > 0 && toolingCount === scriptCount,
    });
    return [
      toClaim(unit, {
        ...shared,
        claim: "does_not_run",
        category,
        counter_hypothesis: "an undeclared entry still executes",
        counter_checked: `opened ${opened}; glob ${glob}`,
        confidence: category === "ambiguous" ? "low" : "medium",
      }),
    ];
  }

  return citations.map((citation) =>
    toClaim(unit, {
      ...shared,
      claim: "runs",
      category: citation.category,
      ecosystem: citation.file.endsWith(".py")
        ? "python"
        : citation.file.endsWith(".go")
          ? "go"
          : citation.file.endsWith(".rs")
            ? "rust"
            : "node",
      entrypoint: { file: citation.file, line: citation.line, snippet: citation.snippet },
      evidence_kind: citation.evidence_kind,
      counter_hypothesis: "the cited line is a constructor, a config file, or a route handler",
      counter_checked: `opened ${citation.file} at line ${citation.line}`,
      confidence: citation.evidence_kind === "implicit_construct" ? "medium" : "high",
    })
  );
}

export async function runSkill(repoRoot: string): Promise<SkillOutcome> {
  const topology = await inferTopology(repoRoot);
  const conventions = await inferConventions(repoRoot, topology.units);
  const claims: Claim[] = [];
  for (const unit of topology.units) {
    const nested =
      topology.units.some((other) => other.path !== unit.path && other.path.startsWith(`${unit.path === "." ? "" : unit.path}/`)) ||
      (unit.path === "." && topology.units.length > 1);
    const found = await investigate(repoRoot, unit, {
      ...(conventions.flags.get(unit.path) ? { flag: conventions.flags.get(unit.path) } : {}),
      nested,
      imported: conventions.importedUnits.has(unit.path),
      stayOut: topology.units.map((other) => other.path).filter((path) => path !== unit.path),
    });
    claims.push(...found);
  }
  return { claims, conventions: conventions.conventions, excluded: topology.excluded };
}
