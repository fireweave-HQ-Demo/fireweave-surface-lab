import { resolve } from "node:path";
import type { VerifiedClaim } from "../src/surface/types";
import { boxTable } from "../src/surface/report";
import { renderSkillReport, writeSkillReport } from "./report";
import { runSkill } from "./skill";
import { verifySkill } from "./verify";

export async function investigateRepo(repoRoot: string): Promise<{
  checked: VerifiedClaim[];
  html: string;
}> {
  const root = resolve(repoRoot);
  const outcome = await runSkill(root);
  const checked: VerifiedClaim[] = [];
  for (const claim of outcome.claims) checked.push(await verifySkill(root, claim));
  const title = root.split("/").filter(Boolean).pop() ?? root;
  return { checked, html: renderSkillReport(title, checked, outcome) };
}

function citation(claim: VerifiedClaim): string {
  return claim.entrypoint ? `${claim.entrypoint.file}:${claim.entrypoint.line}` : "—";
}

async function main(): Promise<void> {
  const repo = resolve(process.argv[2] ?? "/work");
  const out = resolve(process.argv[3] ?? "surface-report.html");
  const outcome = await runSkill(repo);
  const checked: VerifiedClaim[] = [];
  for (const claim of outcome.claims) checked.push(await verifySkill(repo, claim));
  await writeSkillReport(repo, out, checked, outcome);
  const surfaces = checked.filter((claim) => claim.verified && claim.claim === "runs");
  const rank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  surfaces.sort(
    (a, b) => (rank[a.confidence] ?? 9) - (rank[b.confidence] ?? 9) || a.unit.localeCompare(b.unit)
  );
  console.log(
    boxTable(
      ["Path", "Category", "Confidence", "Citation"],
      surfaces.map((claim) => [claim.unit, claim.category, claim.confidence, citation(claim)]),
      [28, undefined, undefined, 56]
    )
  );
  const review = checked.filter((claim) => !claim.verified || claim.claim === "uncertain");
  console.log(
    `\n${surfaces.length} surfaces. ${checked.filter((claim) => claim.verified && claim.claim === "does_not_run").length} not selected. ${review.length} in review.`
  );
  console.log(`Report  ${out}`);
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Surface detection failed.");
    process.exitCode = 1;
  });
}
