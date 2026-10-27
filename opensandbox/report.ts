import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import type { Claim, VerifiedClaim } from "../src/surface/types";
import type { SkillOutcome } from "./skill";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function citation(claim: Claim): string {
  return claim.entrypoint ? `${claim.entrypoint.file}:${claim.entrypoint.line}` : "—";
}

function byConfidence(claims: readonly VerifiedClaim[]): VerifiedClaim[] {
  const rank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  return [...claims].sort(
    (a, b) =>
      (rank[a.confidence] ?? 9) - (rank[b.confidence] ?? 9) ||
      a.unit.localeCompare(b.unit) ||
      citation(a).localeCompare(citation(b))
  );
}

export function renderSkillReport(title: string, checked: readonly VerifiedClaim[], outcome: SkillOutcome): string {
  const surfaces = byConfidence(checked.filter((claim) => claim.verified && claim.claim === "runs"));
  const held = checked
    .filter((claim) => claim.verified && claim.claim === "does_not_run")
    .sort((a, b) => a.unit.localeCompare(b.unit));
  const review = checked
    .filter((claim) => !claim.verified || claim.claim === "uncertain")
    .sort((a, b) => a.unit.localeCompare(b.unit));
  const rule = outcome.conventions[0];
  const exceptions = rule && rule.exceptions.length > 0 ? rule.exceptions.join(", ") : "none";
  const surfaceRows = surfaces
    .map(
      (claim) => `<tr>
        <td><code>${escapeHtml(claim.unit)}</code></td>
        <td>${escapeHtml(claim.category)}</td>
        <td><span class="badge ${escapeHtml(claim.confidence)}">${escapeHtml(claim.confidence)}</span></td>
        <td><code>${escapeHtml(citation(claim))}</code></td>
        <td>${escapeHtml(claim.entrypoint?.snippet ?? "—")}</td>
      </tr>`
    )
    .join("\n");
  const heldRows = held
    .map((claim) => {
      const opened = claim.searched.files_opened[0] ?? claim.unit;
      const glob = claim.searched.globs[0] ?? "*";
      return `<tr>
        <td><code>${escapeHtml(claim.unit)}</code></td>
        <td>${escapeHtml(claim.category)}</td>
        <td>opened ${escapeHtml(opened)}; glob ${escapeHtml(glob)}</td>
      </tr>`;
    })
    .join("\n");
  const reviewRows = review
    .map(
      (claim) => `<tr>
        <td><code>${escapeHtml(claim.unit)}</code></td>
        <td>${escapeHtml(claim.claim)}</td>
        <td>${escapeHtml(claim.rejection_reason ?? claim.coverage.uncertain[0] ?? "uncertain")}</td>
      </tr>`
    )
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 2rem auto; max-width: 1180px; font: 15px/1.45 ui-sans-serif, system-ui, sans-serif; color: #1c1917; background: #fafaf9; }
    h1 { font-size: 1.35rem; margin: 0 0 0.25rem; }
    h2 { font-size: 1rem; margin: 1.75rem 0 0.4rem; }
    p.note { color: #57534e; margin: 0; }
    table { width: 100%; border-collapse: collapse; background: white; }
    th, td { text-align: left; vertical-align: top; border-bottom: 1px solid #e7e5e4; padding: 0.5rem 0.6rem; }
    th { font-size: 0.75rem; letter-spacing: 0.04em; text-transform: uppercase; color: #57534e; background: #f5f5f4; position: sticky; top: 0; }
    code { font-size: 0.86em; }
    .badge { display: inline-block; border-radius: 999px; padding: 0.05rem 0.5rem; font-size: 0.78rem; }
    .high { background: #dcfce7; color: #166534; }
    .medium { background: #fef3c7; color: #92400e; }
    .low { background: #e7e5e4; color: #44403c; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="note">${surfaces.length} surfaces. ${held.length} not selected. ${review.length} in review.</p>
  ${rule ? `<p class="note">${escapeHtml(rule.rule)}. Exceptions: ${escapeHtml(exceptions)}.</p>` : ""}
  <h2>Surfaces</h2>
  <table>
    <thead><tr><th>Path</th><th>Category</th><th>Confidence</th><th>Citation</th><th>Line</th></tr></thead>
    <tbody>${surfaceRows}</tbody>
  </table>
  <h2>Not selected</h2>
  <table>
    <thead><tr><th>Path</th><th>Category</th><th>Search</th></tr></thead>
    <tbody>${heldRows}</tbody>
  </table>
  <h2>Review</h2>
  <table>
    <thead><tr><th>Path</th><th>Claim</th><th>Why</th></tr></thead>
    <tbody>${reviewRows}</tbody>
  </table>
</body>
</html>
`;
}

export async function writeSkillReport(
  repoRoot: string,
  outPath: string,
  checked: readonly VerifiedClaim[],
  outcome: SkillOutcome
): Promise<void> {
  const title = repoRoot.split("/").filter(Boolean).pop() ?? repoRoot;
  await writeFile(outPath, renderSkillReport(title, checked, outcome));
}

export function reportPath(cwd: string): string {
  return join(cwd, "surface-report.html");
}
