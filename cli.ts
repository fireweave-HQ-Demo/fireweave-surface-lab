import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { confirmAgentApps } from './agent';
import { detectSurfaces } from './detect/detect-surfaces';
import { mergeRows, strayAgentPurposes, type ConfirmRow, type ScannerRow } from './merge';
import { partitionSurfaces, toScannerRow } from './select';
import { runSurfacePipeline } from './src/surface/pipeline';
import { boxTable, byAction, byConfidence, renderReport, type ReportDiff } from './src/surface/report';
import type { Diff } from './src/surface/types';

const GITHUB =
  /^(?:https:\/\/github\.com\/|git@github\.com:)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:\/pull\/(\d+))?\/?$/;

export interface GitLink {
  readonly owner: string;
  readonly repo: string;
  readonly pr?: string;
}

/** A GitHub repository or pull request URL, https or ssh. */
export function parseGitLink(input: string): GitLink | null {
  const match = GITHUB.exec(input.trim().replace(/[?#].*$/, ''));
  if (!match) return null;
  const [, owner, repo, pr] = match;
  return { owner, repo, ...(pr !== undefined ? { pr } : {}) };
}

async function run(
  cmd: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}
): Promise<void> {
  const proc = Bun.spawn(cmd, {
    ...(opts.cwd !== undefined ? { cwd: opts.cwd } : {}),
    ...(opts.env !== undefined ? { env: opts.env } : {}),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const code = await proc.exited;
  if (code === 0) return;
  const stderr = await new Response(proc.stderr).text();
  throw new Error(stderr.trim() || `${cmd[0]} exited ${code}`);
}

/** Fetch over HTTPS with `gh`'s credentials, without writing git config. */
function ghGitEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'credential.helper',
    GIT_CONFIG_VALUE_0: '!gh auth git-credential',
  };
}

export async function checkout(link: GitLink): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'surface-lab-'));
  const remote = `https://github.com/${link.owner}/${link.repo}.git`;
  const ref = link.pr !== undefined ? `pull/${link.pr}/head` : 'HEAD';
  try {
    await run(['git', 'init', '-q', dir]);
    await run(['git', '-C', dir, 'remote', 'add', 'origin', remote]);
    await run(['git', '-C', dir, 'fetch', '--depth', '1', 'origin', ref], { env: ghGitEnv() });
    await run(['git', '-C', dir, 'checkout', '--detach', 'FETCH_HEAD']);
    return dir;
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
}


function scannerCell(diff: Diff): string {
  if (diff.scanner.selected) return 'surface';
  if (diff.scanner.kind === 'library') return 'library';
  return 'drop';
}

function agentCell(diff: Diff): string {
  const claim = diff.agent;
  if (!claim.verified || claim.downgraded_to === 'uncertain' || claim.claim === 'uncertain') {
    return 'uncertain';
  }
  return claim.claim === 'runs' ? 'runs(verified)' : claim.claim;
}

function toReportDiff(diff: Diff, confidence: string): ReportDiff {
  return {
    unit: diff.unit,
    scanner: scannerCell(diff),
    agent: agentCell(diff),
    cell: diff.cell,
    action: diff.action,
    citation: diff.agent.entrypoint ? `${diff.agent.entrypoint.file}:${diff.agent.entrypoint.line}` : '—',
    confidence,
  };
}

function formatDiff(diffs: readonly ReportDiff[]): string {
  return boxTable(
    ['Unit', 'Scanner', 'Agent', 'Cell', 'Action', 'Confidence', 'Citation'],
    diffs.map((diff) => [
      diff.unit,
      diff.scanner,
      diff.agent,
      diff.cell,
      diff.action,
      diff.confidence || '—',
      diff.citation,
    ]),
    [22, undefined, undefined, undefined, undefined, undefined, 42]
  );
}

function formatRows(rows: readonly ConfirmRow[]): string {
  return boxTable(
    ['Path', 'Stack', 'Confidence', 'Evidence', 'Purpose', 'Source'],
    rows.map((row) => [
      row.path,
      row.stack,
      row.confidence,
      row.evidence,
      row.purpose ?? '—',
      row.source,
    ]),
    [22, undefined, undefined, 36, 52, undefined]
  );
}

async function ask(argv: readonly string[]): Promise<string> {
  const given = argv[2]?.trim();
  if (given) return given;
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question('Git link: ')).trim();
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const raw = await ask(process.argv);
  const link = parseGitLink(raw);
  if (!link) {
    console.error('Paste a GitHub repository or pull request URL.');
    process.exitCode = 1;
    return;
  }

  console.log(`Checking out ${link.owner}/${link.repo}${link.pr ? `#${link.pr}` : ''}…`);
  const dir = await checkout(link);
  try {
    const found = await detectSurfaces({ cwd: dir });
    const { surfaces, held } = partitionSurfaces(found.surfaces);
    const scanner: ScannerRow[] = found.surfaces.map(toScannerRow);
    const filterSelected = new Set(surfaces.map((s) => s.path));
    const shadow = await runSurfacePipeline(
      dir,
      found.surfaces.map((zone) => ({
        path: zone.path,
        verdict: zone.verdict,
        kind: zone.kind,
        selected: filterSelected.has(zone.path),
      }))
    ).catch((error: unknown) => {
      console.error(
        `agent diff failed: ${error instanceof Error ? error.message : 'investigation failed'}`
      );
      return null;
    });
    const promote = shadow?.mode === 'promote' ? shadow.promotion : null;
    const selected = promote ? new Set(promote.selected) : filterSelected;
    const agent = await confirmAgentApps(dir, surfaces.filter((zone) => selected.has(zone.path)).map(toScannerRow));
    const apps = 'apps' in agent ? agent.apps : null;
    for (const stray of strayAgentPurposes(apps, selected)) {
      console.warn(
        `agent returned a purpose for an unselected path ${stray.path}: ${JSON.stringify(stray.purpose)}`
      );
    }
    const rows = byConfidence(mergeRows(scanner, apps, selected));
    const confidenceOf = new Map(rows.map((row) => [row.path, row.confidence]));
    const lane = 'apps' in agent ? 'ok' : 'skipped' in agent ? 'skipped' : 'failed';
    const note = 'apps' in agent ? null : 'skipped' in agent ? agent.skipped : agent.failed;
    const agentLine = lane === 'ok' ? 'agent ok' : `agent ${lane}: ${note}`;
    console.log(
      promote
        ? `${rows.length} surfaces from ${found.zonesExamined} zones. ${promote.review.length} in review. ${agentLine}.`
        : `${rows.length} surfaces from ${found.zonesExamined} zones. ${held.length} not selected. ${agentLine}.`
    );
    if (found.unreadable.length > 0) {
      for (const zone of found.unreadable) console.log(`unreadable ${zone.path}: ${zone.reason}`);
    }
    if (rows.length > 0) console.log(`\n${formatRows(rows)}`);
    const heldRows = [...held].sort((a, b) => a.path.localeCompare(b.path));
    if (!promote && heldRows.length > 0) {
      console.log(
        `\nNot selected\n${boxTable(
          ['Path', 'Stack', 'Verdict', 'Kind', 'Reason'],
          heldRows.map((zone) => [
            zone.path,
            zone.surface ?? zone.kind,
            zone.verdict,
            zone.kind,
            zone.reason,
          ])
        )}`
      );
    }
    if (promote && promote.review.length > 0) {
      console.log(`\nReview\n${promote.review.join('\n')}`);
    }
    if (shadow) {
      const diffs = byAction(
        shadow.diffs.map((diff) => toReportDiff(diff, confidenceOf.get(diff.unit) ?? ''))
      );
      console.log(`\nAgent diff (${shadow.mode})\n${formatDiff(diffs)}`);
      const reportPath = join(process.cwd(), 'surface-report.html');
      await writeFile(
        reportPath,
        renderReport({
          title: `${link.owner}/${link.repo}`,
          summary: promote
            ? `${rows.length} surfaces from ${found.zonesExamined} zones. ${promote.review.length} in review. ${agentLine}.`
            : `${rows.length} surfaces from ${found.zonesExamined} zones. ${held.length} not selected. ${agentLine}.`,
          surfaces: rows.map((row) => ({
            path: row.path,
            stack: row.stack,
            confidence: row.confidence,
            evidence: row.evidence,
            purpose: row.purpose,
            source: row.source,
          })),
          held: heldRows.map((zone) => ({
            path: zone.path,
            stack: zone.surface ?? zone.kind,
            verdict: zone.verdict,
            kind: zone.kind,
            reason: zone.reason,
          })),
          diffs,
          convention: shadow.conventions[0]
            ? { rule: shadow.conventions[0].rule, exceptions: shadow.conventions[0].exceptions }
            : null,
          excluded: shadow.excluded,
        })
      );
      console.log(`\nReport  ${reportPath}`);
      if (shadow.conventions.length > 0) {
        console.log('\nConventions');
        for (const convention of shadow.conventions) {
          const exceptions =
            convention.exceptions.length > 0 ? convention.exceptions.join(', ') : 'none';
          console.log(`${convention.rule}\nexceptions: ${exceptions}`);
        }
      }
      console.log('\nExcluded');
      if (shadow.excluded.length === 0) console.log('(none)');
      for (const item of shadow.excluded) {
        console.log(`${item.path}  ${item.reason}${item.review ? '  review' : ''}`);
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Detection failed.');
    process.exitCode = 1;
  });
}
