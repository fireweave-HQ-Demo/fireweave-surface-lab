import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import index from './index.html';
import { detectSurfaces } from './detect/detect-surfaces';

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
          return Response.json({
            pr: body.pr,
            surfaces: found.surfaces,
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
