import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentApp, Level, ScannerRow } from './merge';

const MODEL = 'claude-sonnet-5';
const OAUTH_BETA = 'oauth-2025-04-20';

interface Credential {
  readonly kind: 'subscription' | 'api-key';
  readonly secret: string;
}

/** Same choice as fw-server: a subscription token wins over an API key. */
export function fireweaveCredential(env: NodeJS.ProcessEnv = process.env): Credential | null {
  const oauth = env.ROLLOUT_CI_LLM_PROVIDER_OAUTH_TOKEN?.trim();
  if (oauth) return { kind: 'subscription', secret: oauth };
  const apiKey = env.ROLLOUT_CI_LLM_PROVIDER_API_KEY?.trim();
  if (apiKey) return { kind: 'api-key', secret: apiKey };
  return null;
}

function squash(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** The snippet appears on the quoted line, or within two lines of it. */
export async function verifyQuote(
  root: string,
  file: string,
  line: number,
  snippet: string
): Promise<boolean> {
  if (file.split('/').includes('..')) return false;
  const want = squash(snippet);
  if (!want) return false;
  let text: string;
  try {
    text = await readFile(join(root, file), 'utf8');
  } catch {
    return false;
  }
  const lines = text.split('\n');
  const from = Math.max(0, line - 1 - 2);
  const to = Math.min(lines.length, line + 2);
  for (let n = from; n < to; n++) if (squash(lines[n] ?? '').includes(want)) return true;
  return false;
}

interface RawApp {
  path?: unknown;
  kind?: unknown;
  purpose?: unknown;
  reasoning?: unknown;
  confidence?: unknown;
  evidence?: unknown;
}

function asLevel(v: unknown): Level {
  return v === 'high' || v === 'medium' || v === 'low' ? v : 'medium';
}

export async function confirmAgentApps(
  root: string,
  scanner: readonly ScannerRow[],
  env: NodeJS.ProcessEnv = process.env
): Promise<{ apps: AgentApp[] } | { skipped: string } | { failed: string }> {
  const credential = fireweaveCredential(env);
  if (!credential) return { skipped: 'no model access' };

  const listed = [];
  for (const s of scanner.slice(0, 20)) {
    const manifest = s.path === '.' ? 'package.json' : `${s.path}/package.json`;
    let excerpt = '';
    try {
      const text = await readFile(join(root, manifest), 'utf8');
      excerpt = text
        .split('\n')
        .slice(0, 20)
        .map((line, i) => `${i + 1}|${line}`)
        .join('\n');
    } catch {
      excerpt = '';
    }
    listed.push({
      path: s.path,
      surface: s.surface,
      verdict: s.verdict,
      entrypoint: s.entrypoint ?? null,
      manifest,
      excerpt,
    });
  }
  const prompt = [
    'These are the apps a scanner found. Confirm each one.',
    'For every app return path, kind (ts-server, web, python, go, java, rust, swift, dart, or other), a one-sentence purpose, a one-sentence reasoning, confidence high|medium|low, and evidence: one object { file, line, snippet }.',
    'file is the manifest path. line is the number before the pipe. snippet is the text after the pipe, copied exactly.',
    'Reply with JSON only: {"apps":[...]}. No markdown.',
    JSON.stringify(listed),
  ].join('\n');

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'anthropic-version': '2023-06-01',
  };
  let url = 'https://api.anthropic.com/v1/messages';
  if (credential.kind === 'subscription') {
    headers.authorization = `Bearer ${credential.secret}`;
    headers['anthropic-beta'] = OAUTH_BETA;
    url += '?beta=true';
  } else {
    headers['x-api-key'] = credential.secret;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch (error) {
    return { failed: error instanceof Error ? error.message : 'the model request failed' };
  }
  if (!response.ok) {
    let detail = '';
    try {
      const err = (await response.json()) as { error?: { type?: string; message?: string } };
      const type = err.error?.type ?? '';
      const message = (err.error?.message ?? '').slice(0, 180);
      detail = [type, message].filter(Boolean).join(': ');
    } catch {
      detail = '';
    }
    return {
      failed: detail
        ? `the model refused the request (${response.status}): ${detail}`
        : `the model refused the request (${response.status})`,
    };
  }

  let text = '';
  try {
    const body = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    text = body.content?.find((c) => c.type === 'text')?.text ?? '';
  } catch {
    return { failed: 'the model returned an unreadable body' };
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
    const evidence = Array.isArray(raw.evidence) ? raw.evidence : [];
    const quotes: AgentApp['evidence'][number][] = [];
    for (const q of evidence) {
      if (!q || typeof q !== 'object') continue;
      const quote = q as { file?: unknown; line?: unknown; snippet?: unknown };
      if (typeof quote.file !== 'string' || typeof quote.snippet !== 'string') continue;
      if (typeof quote.line !== 'number') continue;
      quotes.push({
        file: quote.file,
        line: quote.line,
        snippet: quote.snippet,
        verified: await verifyQuote(root, quote.file, quote.line, quote.snippet),
      });
    }
    apps.push({
      path: raw.path,
      kind: typeof raw.kind === 'string' ? raw.kind : 'other',
      purpose: raw.purpose,
      reasoning: typeof raw.reasoning === 'string' ? raw.reasoning : raw.purpose,
      selfRated: asLevel(raw.confidence),
      evidence: quotes,
    });
  }
  return { apps };
}
