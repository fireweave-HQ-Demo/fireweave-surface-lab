import { describe, expect, test } from 'bun:test';
import { mergeRows, type AgentApp, type ScannerRow } from './merge';

const scanner: ScannerRow = {
  path: 'apps/api',
  surface: 'ts-server',
  kind: 'app',
  verdict: 'confirmed',
};

const agent = (verified: boolean): AgentApp => ({
  path: 'apps/api',
  kind: 'ts-server',
  purpose: 'HTTP API',
  reasoning: 'Hono is the server.',
  selfRated: 'high',
  evidence: [{ file: 'apps/api/package.json', line: 1, snippet: '"hono"', verified }],
});

describe('mergeRows', () => {
  test('scanner alone is medium and has no purpose', () => {
    expect(mergeRows([scanner], null)).toEqual([
      {
        path: 'apps/api',
        stack: 'ts-server',
        confidence: 'medium',
        purpose: null,
        reasoning: null,
        source: 'scanner',
      },
    ]);
  });

  test('a quote that matches the file raises the row to high and keeps the purpose', () => {
    expect(mergeRows([scanner], [agent(true)])[0]).toMatchObject({
      confidence: 'high',
      purpose: 'HTTP API',
      source: 'both',
    });
  });

  test('a quote that does not match leaves the scanner row unchanged', () => {
    expect(mergeRows([scanner], [agent(false)])[0]).toMatchObject({
      confidence: 'medium',
      purpose: null,
      source: 'scanner',
    });
  });

  test('an app only the agent found is kept when its quote matches', () => {
    const extra = { ...agent(true), path: 'apps/worker', kind: 'python' };
    expect(mergeRows([scanner], [extra]).map((r) => r.path)).toEqual(['apps/api', 'apps/worker']);
  });

  test('an app only the agent found is dropped when its quote does not match', () => {
    const extra = { ...agent(false), path: 'apps/missing' };
    expect(mergeRows([], [extra])).toEqual([]);
  });
});
