import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { confirmAgentApps } from './agent';
import { detectSurfaces } from './detect/detect-surfaces';
import { mergeRows, strayAgentPurposes, type ConfirmRow, type ScannerRow } from './merge';
import { partitionSurfaces, toScannerRow } from './select';

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

async function checkout(link: GitLink): Promise<string> {
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

function formatTable(header: readonly string[], body: readonly (readonly string[])[]): string {
  const widths = header.map((cell, i) =>
    Math.max(cell.length, ...body.map((line) => line[i]!.length))
  );
  const line = (cells: readonly string[]) =>
    cells.map((cell, i) => cell.padEnd(widths[i]!)).join('  ');
  return [line(header), ...body.map(line)].join('\n');
}

function formatRows(rows: readonly ConfirmRow[]): string {
  return formatTable(
    ['Path', 'Stack', 'Confidence', 'Evidence', 'Purpose', 'Source'],
    rows.map((row) => [
      row.path,
      row.stack,
      row.confidence,
      row.evidence,
      row.purpose ?? '—',
      row.source,
    ])
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
    const selected = new Set(surfaces.map((s) => s.path));
    const agent = await confirmAgentApps(dir, surfaces.map(toScannerRow));
    const apps = 'apps' in agent ? agent.apps : null;
    for (const stray of strayAgentPurposes(apps, selected)) {
      console.warn(
        `agent returned a purpose for an unselected path ${stray.path}: ${JSON.stringify(stray.purpose)}`
      );
    }
    const rows = mergeRows(scanner, apps, selected);
    const lane = 'apps' in agent ? 'ok' : 'skipped' in agent ? 'skipped' : 'failed';
    const note = 'apps' in agent ? null : 'skipped' in agent ? agent.skipped : agent.failed;
    const agentLine = lane === 'ok' ? 'agent ok' : `agent ${lane}: ${note}`;
    console.log(
      `${rows.length} surfaces from ${found.zonesExamined} zones. ${held.length} not selected. ${agentLine}.`
    );
    if (found.unreadable.length > 0) {
      for (const zone of found.unreadable) console.log(`unreadable ${zone.path}: ${zone.reason}`);
    }
    if (rows.length > 0) console.log(`\n${formatRows(rows)}`);
    if (held.length > 0) {
      console.log(
        `\nNot selected\n${formatTable(
          ['Path', 'Stack', 'Verdict', 'Kind', 'Reason'],
          held.map((zone) => [
            zone.path,
            zone.surface ?? zone.kind,
            zone.verdict,
            zone.kind,
            zone.reason,
          ])
        )}`
      );
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
