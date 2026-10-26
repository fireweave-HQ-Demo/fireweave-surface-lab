import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import index from './index.html';
import { confirmAgentApps } from './agent';
import { detectSurfaces } from './detect/detect-surfaces';
import { mergeRows } from './merge';
import { partitionSurfaces, toScannerRow } from './select';

const PR =
  /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/(\d+)\/?$/;

async function run(cmd: string[], cwd?: string): Promise<void> {
  const proc = Bun.spawn(cmd, { cwd, stdout: 'pipe', stderr: 'pipe' });
  const code = await proc.exited;
  if (code === 0) return;
  const stderr = await new Response(proc.stderr).text();
  throw new Error(stderr.trim() || `${cmd[0]} exited ${code}`);
}

async function checkoutPullRequest(url: string): Promise<string> {
  const match = PR.exec(url.trim());
  if (!match) throw new Error('Paste a GitHub pull request URL.');
  const [, owner, repo, number] = match;
  const dir = await mkdtemp(join(tmpdir(), 'surface-lab-'));
  try {
    await run(['git', 'init', '-q', dir]);
    await run(
      ['git', '-C', dir, 'remote', 'add', 'origin', `git@github.com:${owner}/${repo}.git`]
    );
    await run(['git', '-C', dir, 'fetch', '--depth', '1', 'origin', `pull/${number}/head`]);
    await run(['git', '-C', dir, 'checkout', '--detach', 'FETCH_HEAD']);
    return dir;
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
}

Bun.serve({
  port: 8787,
  routes: {
    '/': index,
    '/api/surfaces': {
      POST: async (req) => {
        let body: { pr?: string };
        try {
          body = (await req.json()) as { pr?: string };
        } catch {
          return Response.json({ error: 'Send a JSON body with pr.' }, { status: 400 });
        }
        let dir: string | undefined;
        try {
          dir = await checkoutPullRequest(body.pr ?? '');
          const found = await detectSurfaces({ cwd: dir });
          const { surfaces, held } = await partitionSurfaces(dir, found.surfaces);
          const scanner = found.surfaces.map(toScannerRow);
          const selected = new Set(surfaces.map((s) => s.path));
          const agent = await confirmAgentApps(dir, surfaces.map(toScannerRow));
          const rows = mergeRows(scanner, 'apps' in agent ? agent.apps : null, selected);
          return Response.json({
            pr: body.pr,
            lanes: {
              scanner: 'ok',
              agent: 'apps' in agent ? 'ok' : 'skipped' in agent ? 'skipped' : 'failed',
            },
            agentNote: 'apps' in agent ? null : 'skipped' in agent ? agent.skipped : agent.failed,
            rows,
            held: held.map((zone) => ({
              path: zone.path,
              stack: zone.surface ?? zone.kind,
              verdict: zone.verdict,
              kind: zone.kind,
              reason: zone.reason,
            })),
            unreadable: found.unreadable,
            zonesExamined: found.zonesExamined,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Detection failed.';
          return Response.json({ error: message }, { status: 400 });
        } finally {
          if (dir) await rm(dir, { recursive: true, force: true });
        }
      },
    },
  },
});

console.log('surface lab http://127.0.0.1:8787');
