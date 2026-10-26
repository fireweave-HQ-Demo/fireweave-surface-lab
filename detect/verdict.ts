/**
 * Named verdicts for surface detection.
 *
 * ## Why names and not a confidence number
 *
 * A float invites a threshold, and a threshold is a decision nobody wrote down:
 * `0.72` means "declare it" or "ask" depending on a constant somebody tuned
 * once. Worse, arithmetic over evidence implies the pieces are commensurable —
 * that "has a Dockerfile" and "is a dependency-graph root" trade off on one
 * axis. They do not; they answer different questions.
 *
 * A verdict names WHY the detector reached its answer, so the caller can act on
 * the reason rather than on a cut-off, and so a wrong answer is legible in a bug
 * report ("it said `probable` because it found no entrypoint") instead of
 * arriving as `0.61`.
 *
 * The four are ordered by how much the detector is willing to assert, and every
 * one of them is REPORTED — none is a silent drop (`undecidable` in particular
 * is a finding, not an absence).
 */
export type SurfaceVerdict =
  /** Language and deployability both resolve, and they agree. Safe to pre-select. */
  | 'confirmed'
  /** Language resolves; deployability is inferred from weaker signal. Pre-select, but say why. */
  | 'probable'
  /** More than one surface is genuinely defensible here. The user picks — the detector must not. */
  | 'ambiguous'
  /** Recognised as a zone, but nothing maps it to a surface FireWeave supports. */
  | 'undecidable';

export const SURFACE_VERDICTS: readonly SurfaceVerdict[] = Object.freeze([
  'confirmed',
  'probable',
  'ambiguous',
  'undecidable',
]);

/** True for verdicts a caller may pre-select in a confirmation prompt. */
export function isPreselectable(v: SurfaceVerdict): boolean {
  return v === 'confirmed' || v === 'probable';
}

/**
 * One reason the detector believes what it believes.
 *
 * Evidence is carried through to the caller verbatim rather than collapsed into
 * the verdict, because the remediation for a wrong answer is almost always
 * "the detector looked at the wrong file" — which is only actionable if the
 * caller can see which file it looked at.
 */
export interface SurfaceEvidence {
  /** Stable machine token, e.g. `entrypoint.package-json-bin`. */
  readonly kind: string;
  /** Repo-relative path the evidence came from, when it came from a file. */
  readonly path?: string;
  /** One line a human can read without opening the file. */
  readonly detail: string;
}
