const CONFIDENCE_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
const ACTION_RANK: Record<string, number> = { selected: 0, review: 1, dropped: 2 };

export type ReportSurface = {
  path: string;
  stack: string;
  confidence: string;
  evidence: string;
  purpose: string | null;
  source: string;
};

export type ReportHeld = {
  path: string;
  stack: string;
  verdict: string;
  kind: string;
  reason: string;
};

export type ReportDiff = {
  unit: string;
  scanner: string;
  agent: string;
  cell: string;
  action: string;
  citation: string;
  confidence: string;
};

export type ReportModel = {
  title: string;
  summary: string;
  surfaces: readonly ReportSurface[];
  held: readonly ReportHeld[];
  diffs: readonly ReportDiff[];
  convention: { rule: string; exceptions: readonly string[] } | null;
  excluded: readonly { path: string; reason: string; review: boolean }[];
};

export function byConfidence<T extends { confidence: string; path: string }>(rows: readonly T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      (CONFIDENCE_RANK[a.confidence] ?? 9) - (CONFIDENCE_RANK[b.confidence] ?? 9) ||
      a.path.localeCompare(b.path)
  );
}

export function byAction(rows: readonly ReportDiff[]): ReportDiff[] {
  return [...rows].sort(
    (a, b) =>
      (ACTION_RANK[a.action] ?? 9) - (ACTION_RANK[b.action] ?? 9) ||
      (CONFIDENCE_RANK[a.confidence] ?? 9) - (CONFIDENCE_RANK[b.confidence] ?? 9) ||
      a.unit.localeCompare(b.unit)
  );
}

function wrap(text: string, width: number): string[] {
  if (text.length <= width) return [text];
  const lines: string[] = [];
  let rest = text;
  while (rest.length > width) {
    let cut = rest.lastIndexOf(" ", width);
    if (cut <= 0) cut = width;
    lines.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) lines.push(rest);
  return lines.length > 0 ? lines : [""];
}

/** A bordered table. `wrapAt[i]` is the maximum width of that column. */
export function boxTable(
  header: readonly string[],
  body: readonly (readonly string[])[],
  wrapAt: readonly (number | undefined)[] = []
): string {
  const cells = body.map((row) =>
    row.map((cell, i) => {
      const limit = wrapAt[i];
      return limit ? wrap(cell, limit) : [cell];
    })
  );
  const widths = header.map((label, i) =>
    Math.max(label.length, ...cells.map((row) => Math.max(...(row[i] ?? [""]).map((line) => line.length), 0)))
  );
  const bar = (left: string, mid: string, right: string) =>
    left + widths.map((width) => "─".repeat(width + 2)).join(mid) + right;
  const paint = (row: readonly string[][]) => {
    const height = Math.max(1, ...row.map((lines) => lines.length));
    const lines: string[] = [];
    for (let line = 0; line < height; line++) {
      lines.push(
        "│" +
          row
            .map((column, i) => ` ${(column[line] ?? "").padEnd(widths[i] ?? 0)} `)
            .join("│") +
          "│"
      );
    }
    return lines.join("\n");
  };
  const head = paint(header.map((label) => [label]));
  const rows = cells.map((row) => paint(row));
  return [bar("┌", "┬", "┐"), head, bar("├", "┼", "┤"), rows.join("\n" + bar("├", "┼", "┤") + "\n"), bar("└", "┴", "┘")]
    .filter((part) => part !== "")
    .join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function confidenceRows(surfaces: readonly ReportSurface[]): string {
  return byConfidence(surfaces)
    .map(
      (row) => `<tr>
        <td><code>${escapeHtml(row.path)}</code></td>
        <td>${escapeHtml(row.stack)}</td>
        <td><span class="badge ${escapeHtml(row.confidence)}">${escapeHtml(row.confidence)}</span></td>
        <td>${escapeHtml(row.evidence)}</td>
        <td>${escapeHtml(row.purpose ?? "—")}</td>
        <td>${escapeHtml(row.source)}</td>
      </tr>`
    )
    .join("\n");
}

function heldRows(held: readonly ReportHeld[]): string {
  return [...held]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map(
      (row) => `<tr>
        <td><code>${escapeHtml(row.path)}</code></td>
        <td>${escapeHtml(row.stack)}</td>
        <td>${escapeHtml(row.verdict)}</td>
        <td>${escapeHtml(row.kind)}</td>
        <td>${escapeHtml(row.reason)}</td>
      </tr>`
    )
    .join("\n");
}

function diffRows(diffs: readonly ReportDiff[]): string {
  return byAction(diffs)
    .map(
      (row) => `<tr>
        <td><code>${escapeHtml(row.unit)}</code></td>
        <td>${escapeHtml(row.scanner)}</td>
        <td>${escapeHtml(row.agent)}</td>
        <td>${escapeHtml(row.cell)}</td>
        <td>${escapeHtml(row.action)}</td>
        <td>${row.confidence ? `<span class="badge ${escapeHtml(row.confidence)}">${escapeHtml(row.confidence)}</span>` : "—"}</td>
        <td><code>${escapeHtml(row.citation)}</code></td>
      </tr>`
    )
    .join("\n");
}

export function renderReport(model: ReportModel): string {
  const exceptions =
    model.convention && model.convention.exceptions.length > 0
      ? model.convention.exceptions.join(", ")
      : "none";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(model.title)}</title>
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
  <h1>${escapeHtml(model.title)}</h1>
  <p class="note">${escapeHtml(model.summary)}</p>
  ${model.convention ? `<p class="note">${escapeHtml(model.convention.rule)}. Exceptions: ${escapeHtml(exceptions)}.</p>` : ""}
  <h2>Surfaces</h2>
  <table>
    <thead><tr><th>Path</th><th>Stack</th><th>Confidence</th><th>Evidence</th><th>Purpose</th><th>Source</th></tr></thead>
    <tbody>
      ${confidenceRows(model.surfaces)}
    </tbody>
  </table>
  <h2>Not selected</h2>
  <table>
    <thead><tr><th>Path</th><th>Stack</th><th>Verdict</th><th>Kind</th><th>Reason</th></tr></thead>
    <tbody>
      ${heldRows(model.held)}
    </tbody>
  </table>
  <h2>Agent diff</h2>
  <table>
    <thead><tr><th>Unit</th><th>Scanner</th><th>Agent</th><th>Cell</th><th>Action</th><th>Confidence</th><th>Citation</th></tr></thead>
    <tbody>
      ${diffRows(model.diffs)}
    </tbody>
  </table>
</body>
</html>
`;
}
