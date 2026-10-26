import { describe, expect, test } from 'bun:test';
import { mergeRows, type AgentApp, type ScannerRow } from './merge';

const confirmed: ScannerRow = {
  path: 'apps/console',
  surface: 'web',
  kind: 'app',
  verdict: 'confirmed',
};

const probable: ScannerRow = {
  path: 'apps/api',
  surface: 'ts-server',
  kind: 'unknown',
  verdict: 'probable',
};

const library: ScannerRow = {
  path: 'packages/db',
  surface: 'ts-server',
  kind: 'library',
  verdict: 'probable',
};

const purpose = (path: string): AgentApp => ({
  path,
  kind: 'ts-server',
  purpose: 'HTTP API',
  reasoning: 'It serves the clinic backend.',
});

const selected = new Set(['apps/console', 'apps/api']);

describe('mergeRows', () => {
  test('a confirmed surface with no agent purpose is high', () => {
    expect(mergeRows([confirmed], null, selected)).toEqual([
      {
        path: 'apps/console',
        stack: 'web',
        confidence: 'high',
        purpose: null,
        reasoning: null,
        source: 'scanner',
      },
    ]);
  });

  test('a probable surface with no agent purpose is medium', () => {
    expect(mergeRows([probable], null, new Set(['apps/api']))[0]).toMatchObject({
      confidence: 'medium',
      purpose: null,
      source: 'scanner',
    });
  });

  test('a purpose sticks without a quote, and confidence stays with the verdict', () => {
    const rows = mergeRows([confirmed, probable], [purpose('apps/api'), purpose('apps/console')], selected);
    expect(rows.find((r) => r.path === 'apps/console')).toMatchObject({
      confidence: 'high',
      purpose: 'HTTP API',
      source: 'both',
    });
    expect(rows.find((r) => r.path === 'apps/api')).toMatchObject({
      confidence: 'medium',
      purpose: 'HTTP API',
      source: 'both',
    });
  });

  test('a row that was not selected is omitted, including one the agent names', () => {
    const rows = mergeRows(
      [confirmed, library],
      [purpose('packages/db')],
      new Set(['apps/console'])
    );
    expect(rows.map((r) => r.path)).toEqual(['apps/console']);
  });
});
