import { describe, expect, test } from 'bun:test';
import { parseGitLink } from './cli';

describe('parseGitLink', () => {
  test('a repository URL', () => {
    expect(parseGitLink('https://github.com/fireweave-HQ-Demo/fireweave-test-repo')).toEqual({
      owner: 'fireweave-HQ-Demo',
      repo: 'fireweave-test-repo',
    });
  });

  test('a pull request URL', () => {
    expect(parseGitLink('https://github.com/org/repo/pull/123/')).toEqual({
      owner: 'org',
      repo: 'repo',
      pr: '123',
    });
  });

  test('an ssh URL with .git', () => {
    expect(parseGitLink('git@github.com:org/repo.git')).toEqual({
      owner: 'org',
      repo: 'repo',
    });
  });

  test('anything else is refused', () => {
    expect(parseGitLink('https://gitlab.com/org/repo')).toBeNull();
    expect(parseGitLink('')).toBeNull();
  });
});
