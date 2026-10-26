/**
 * Auth-seam detection — where does this app learn who the user is?
 *
 * ## What it feeds
 *
 * `initialise` Step 6b (cohort identity wiring) says "locate the identity seam
 * … ask when it is ambiguous; do not guess." That instruction was sound and
 * completely unsupported: the agent had to hunt, and a missed seam means
 * `syncFireweaveUser` / `registerFwTarget` never gets wired, so every rule on a
 * durable property matches nobody — silently, because a rule that matches
 * nobody looks exactly like a rule nobody triggered.
 *
 * This produces CANDIDATES with file, line and the token that matched. It does
 * not choose. Step 6b still asks, but now it asks about a short list instead of
 * asking the user to go find it.
 *
 * ## Why token-based and not type-aware
 *
 * A precise answer needs the type graph of an arbitrary auth library across six
 * languages. What actually distinguishes a seam is a small vocabulary the whole
 * industry converged on (`signIn`, `onAuthStateChanged`, `req.user`, `session`),
 * and those tokens are cheap and cross-language. The cost of a false positive
 * here is one extra row in a prompt; the cost of a miss is silent no-op
 * targeting. So this over-reports on purpose and lets the human cut it down.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

export interface AuthSeamCandidate {
  /** Repo-relative file. */
  readonly file: string;
  /** 1-indexed line. */
  readonly line: number;
  /** The token that matched, e.g. `onAuthStateChanged`. */
  readonly token: string;
  /** The matched line, trimmed and truncated — enough to judge without opening it. */
  readonly excerpt: string;
  /** Which side of the app this token implies. */
  readonly plane: 'client' | 'server' | 'either';
}

interface SeamToken {
  readonly re: RegExp;
  readonly token: string;
  readonly plane: AuthSeamCandidate['plane'];
}

/**
 * The vocabulary. Deliberately small: every entry has to be a token that names
 * an identity TRANSITION (a sign-in, a session resolve), not merely a mention
 * of a user — `user` alone matches half of any codebase and would bury the
 * signal it is supposed to surface.
 */
const SEAM_TOKENS: readonly SeamToken[] = Object.freeze([
  {
    re: /\bonAuthStateChanged\b/,
    token: 'onAuthStateChanged',
    plane: 'client',
  },
  { re: /\bsignInWith[A-Za-z]*\s*\(/, token: 'signInWith*', plane: 'client' },
  { re: /\b(signIn|logIn|login)\s*\(/, token: 'signIn()', plane: 'either' },
  { re: /\b(signOut|logOut|logout)\s*\(/, token: 'signOut()', plane: 'either' },
  { re: /\buseSession\s*\(/, token: 'useSession()', plane: 'client' },
  { re: /\buseUser\s*\(/, token: 'useUser()', plane: 'client' },
  { re: /\bgetSession\s*\(/, token: 'getSession()', plane: 'either' },
  { re: /\bauthClient\./, token: 'authClient.*', plane: 'client' },
  { re: /\breq\.user\b|\brequest\.user\b/, token: 'req.user', plane: 'server' },
  {
    re: /\bctx\.session\b|\bcontext\.session\b/,
    token: 'ctx.session',
    plane: 'server',
  },
  { re: /\bcurrent_user\b/, token: 'current_user', plane: 'server' },
  {
    re: /\bpassport\.authenticate\s*\(/,
    token: 'passport.authenticate()',
    plane: 'server',
  },
  {
    re: /\bbetter-auth\b|\bbetterAuth\s*\(/,
    token: 'better-auth',
    plane: 'either',
  },
  { re: /\bnext-auth\b|\bNextAuth\s*\(/, token: 'next-auth', plane: 'either' },
  { re: /@clerk\//, token: '@clerk', plane: 'either' },
  {
    re: /@auth0\/|\bAuth0(Provider|Client)\b/,
    token: 'auth0',
    plane: 'either',
  },
  { re: /\bsupabase\.auth\b/, token: 'supabase.auth', plane: 'either' },
  {
    re: /\bSecurityContextHolder\b/,
    token: 'SecurityContextHolder',
    plane: 'server',
  },
  {
    re: /\b@AuthenticationPrincipal\b/,
    token: '@AuthenticationPrincipal',
    plane: 'server',
  },
]);

const SCANNABLE =
  /\.(ts|tsx|js|jsx|mjs|cjs|svelte|vue|py|go|rs|java|kt|swift|dart)$/;
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'target',
  'vendor',
  '.next',
  '.svelte-kit',
  'coverage',
  '__pycache__',
  '.venv',
]);

/**
 * Scan a zone for identity seams.
 *
 * Bounded by `maxFiles` because this runs inside an interactive init: a repo
 * with 50k source files must not turn Step 6b into a minute of silence. The cap
 * is REPORTED (`truncated`) rather than applied quietly — a partial scan that
 * claims to be complete is how "no seam found" becomes a wrong answer instead
 * of a missing one.
 */
export async function detectAuthSeams(
  root: string,
  zonePath: string,
  maxFiles = 1500
): Promise<{ candidates: AuthSeamCandidate[]; truncated: boolean }> {
  const base = zonePath === '.' ? root : join(root, zonePath);
  const candidates: AuthSeamCandidate[] = [];
  let seen = 0;
  let truncated = false;

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 6 || seen >= maxFiles) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (seen >= maxFiles) {
        truncated = true;
        return;
      }
      if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
      const abs = join(dir, e.name);
      if (e.isDirectory()) {
        await walk(abs, depth + 1);
        continue;
      }
      if (!SCANNABLE.test(e.name)) continue;
      seen += 1;
      let text: string;
      try {
        text = await readFile(abs, 'utf8');
      } catch {
        continue;
      }
      const rel = relative(root, abs).split(sep).join('/');
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i]!;
        // One candidate per line at most: a line matching three tokens is one
        // seam, and emitting it three times just pads the prompt.
        const hit = SEAM_TOKENS.find((t) => t.re.test(line));
        if (!hit) continue;
        candidates.push({
          file: rel,
          line: i + 1,
          token: hit.token,
          excerpt: line.trim().slice(0, 120),
          plane: hit.plane,
        });
      }
    }
  }

  await walk(base, 0);
  return { candidates, truncated };
}
