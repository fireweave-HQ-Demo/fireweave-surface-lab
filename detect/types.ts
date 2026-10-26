/** Surface names the detector can return. Copied from today's harness vocabulary. */
export type HarnessSurfaceName =
  | 'ts-server'
  | 'web'
  | 'go'
  | 'rust'
  | 'python'
  | 'dart'
  | 'java'
  | 'swift';

/** `server` reads the process environment. `client` is a browser or shipped app. */
export type StartProfile = 'server' | 'client';
