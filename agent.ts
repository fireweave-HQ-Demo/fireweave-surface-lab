import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Agent, CursorAgentError } from '@cursor/sdk';
import type { AgentApp, ScannerRow } from './merge';

const MODEL = 'composer-2.5';

export function cursorApiKey(env: NodeJS.ProcessEnv = process.env): string | null {
  const key = env.CURSOR_API_KEY?.trim();
  return key ? key : null;
}

async function description(root: string, path: string): Promise<string | null> {
  const base = path === '.' ? root : join(root, path);
  try {
    const pkg = JSON.parse(await readFile(join(base, 'package.json'), 'utf8')) as {
      description?: unknown;
    };
    if (typeof pkg.description === 'string' && pkg.description.trim()) return pkg.description.trim();
  } catch {
    // No package.json description.
  }
  try {
    const text = await readFile(join(base, 'pyproject.toml'), 'utf8');
    const match = /^description\s*=\s*"([^"]+)"/m.exec(text);
    if (match?.[1]) return match[1];
  } catch {
    // No pyproject description.
  }
  return null;
}

interface RawApp {
  path?: unknown;
  purpose?: unknown;
  reasoning?: unknown;
}

export async function confirmAgentApps(
  root: string,
  scanner: readonly ScannerRow[],
  env: NodeJS.ProcessEnv = process.env
): Promise<{ apps: AgentApp[] } | { skipped: string } | { failed: string }> {
  if (scanner.length === 0) return { apps: [] };
  const apiKey = cursorApiKey(env);
  if (!apiKey) return { skipped: 'no model access' };

  const listed = [];
  for (const s of scanner.slice(0, 20)) {
    listed.push({
      path: s.path,
      stack: s.surface,
      kind: s.kind,
      verdict: s.verdict,
      description: await description(root, s.path),
    });
  }
  const prompt = [
    'You are given workspace surfaces that have already been selected as apps with real entrypoints.',
    'Do not verify or confirm them. Do not copy manifest lines.',
    'Write a one-sentence purpose for each based on path, stack, kind, and description.',
    'If the purpose is unclear, write "purpose unclear."',
    'Confidence is determined by the scanner verdict, not by your output.',
    'Reply with JSON only: {"apps":[{"path","purpose","reasoning"}]}. No markdown. Do not edit files.',
    JSON.stringify(listed),
  ].join('\n');

  let text = '';
  try {
    const result = await Agent.prompt(prompt, {
      apiKey,
      model: { id: MODEL },
      local: { cwd: root, settingSources: [] },
      tools: [],
      name: 'surface-lab',
    });
    if (result.status === 'error') {
      return { failed: result.error?.message ?? 'the model run failed' };
    }
    if (result.status === 'cancelled') return { failed: 'the model run was cancelled' };
    text = result.result ?? '';
  } catch (error) {
    if (error instanceof CursorAgentError) return { failed: error.message };
    return { failed: error instanceof Error ? error.message : 'the model request failed' };
  }
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  if (jsonStart < 0 || jsonEnd < jsonStart) return { failed: 'the model did not return JSON' };

  let parsed: { apps?: RawApp[] };
  try {
    parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as { apps?: RawApp[] };
  } catch {
    return { failed: 'the model returned invalid JSON' };
  }

  const apps: AgentApp[] = [];
  for (const raw of parsed.apps ?? []) {
    if (typeof raw.path !== 'string' || typeof raw.purpose !== 'string') continue;
    apps.push({
      path: raw.path,
      kind: 'other',
      purpose: raw.purpose,
      reasoning: typeof raw.reasoning === 'string' ? raw.reasoning : raw.purpose,
    });
  }
  return { apps };
}
