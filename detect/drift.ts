/**
 * Re-run drift — what changed between what a repo DECLARED and what detection
 * finds now.
 *
 * ## Why vanished surfaces are flagged and never auto-retired
 *
 * A declared surface that detection no longer finds has two very different
 * causes, and they are indistinguishable from here:
 *
 *   1. The surface was genuinely deleted. Retiring it is correct.
 *   2. Detection could not see it this run — a moved directory, an unreadable
 *      manifest, a workspace glob that stopped matching, a checkout with a
 *      submodule missing.
 *
 * Auto-retiring on (2) destroys a server-minted `sfc_` id that a committed
 * harness still references, and the damage shows up at ship as a surface the
 * rollout cannot resolve. The cost is asymmetric — a stale declaration is
 * noise, a wrongly-retired one is a broken ship — so the only safe default is
 * to REPORT and let a human say which case it is.
 *
 * The matching key is `(surface, path)`, the same pair the server matches a
 * re-declare on, so a surface that merely moved reads as vanished+added rather
 * than silently rebinding to a new id.
 */
import type { DetectedSurface } from './detect-surfaces';

/** One surface as the repo already declared it. */
export interface DeclaredSurface {
  readonly surface: string;
  readonly path: string;
  readonly surfaceId?: string;
}

export interface SurfaceDrift {
  /** Declared but NOT detected this run. Flagged for a human, never auto-retired. */
  readonly vanished: readonly DeclaredSurface[];
  /** Detected but not declared. Candidates for this run's declare call. */
  readonly added: readonly DetectedSurface[];
  /** Declared and still detected. */
  readonly unchanged: readonly DeclaredSurface[];
  /**
   * True when something needs a human decision before declaring. The skill uses
   * this to decide whether to stop, so "nothing changed" stays a silent path.
   */
  readonly needsReview: boolean;
}

const keyOf = (s: { surface: string | null; path: string }): string =>
  `${s.surface ?? '?'} ${s.path}`;

/**
 * Diff detection output against the declared set.
 *
 * `declared` is empty on a first init, which makes every detected surface
 * `added` and `needsReview` false — a first run has nothing to review, only to
 * select.
 */
export function diffDeclaredSurfaces(
  detected: readonly DetectedSurface[],
  declared: readonly DeclaredSurface[]
): SurfaceDrift {
  const detectedKeys = new Set(detected.map(keyOf));
  const declaredKeys = new Set(declared.map(keyOf));

  const vanished = declared.filter((d) => !detectedKeys.has(keyOf(d)));
  const unchanged = declared.filter((d) => detectedKeys.has(keyOf(d)));
  const added = detected.filter((d) => !declaredKeys.has(keyOf(d)));

  return {
    vanished,
    added,
    unchanged,
    // Only a vanished surface needs a RULING. New surfaces are the ordinary
    // outcome of a re-run and are handled by the selection prompt itself.
    needsReview: vanished.length > 0,
  };
}
