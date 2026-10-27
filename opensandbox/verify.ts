import { join } from "node:path";
import { readText } from "../src/surface/extractors/scan";
import type { Claim, Unit, VerifiedClaim } from "../src/surface/types";
import { citedLineMatches } from "./constructs";
import { declaredCitations } from "./skill";

const MANIFEST = /(?:^|\/)(package\.json|pyproject\.toml|Dockerfile|Procfile|go\.mod|Cargo\.toml|index\.html)$/;

function reject(claim: Claim, reason: string): VerifiedClaim {
  return { ...claim, verified: false, rejection_reason: reason, downgraded_to: "uncertain" };
}

function accept(claim: Claim): VerifiedClaim {
  return { ...claim, verified: true };
}

function counterIsConcrete(claim: Claim): boolean {
  const checked = claim.counter_checked.trim();
  const hypothesis = claim.counter_hypothesis.trim();
  if (checked === "" || checked === hypothesis) return false;
  if (hypothesis.length > 0 && checked.includes(hypothesis)) return false;
  return (
    claim.searched.files_opened.some((file) => checked.includes(file)) ||
    claim.searched.globs.some((glob) => checked.includes(glob)) ||
    claim.searched.greps.some((grep) => checked.includes(grep)) ||
    /\bline\s+\d+\b/.test(checked)
  );
}

function unitFor(claim: Claim): Unit {
  const prefix = claim.unit === "." ? "" : `${claim.unit}/`;
  const manifests = claim.searched.files_opened
    .filter((file) => (claim.unit === "." ? !file.includes("/") : file.startsWith(prefix)))
    .map((file) => (claim.unit === "." ? file : file.slice(prefix.length)))
    .filter((name) => MANIFEST.test(name) && !name.includes("/"));
  return { path: claim.unit, manifests, languages: claim.ecosystem ? [claim.ecosystem] : [] };
}

/**
 * Skill verifier. It rejects a service citation whose own line is not a listener.
 * A constructor one line away does not rescue it. Nothing is promoted.
 */
export async function verifySkill(repoRoot: string, claim: Claim): Promise<VerifiedClaim> {
  if (claim.claim === "runs" && (claim.category === "tooling" || claim.category === "library")) {
    return reject(claim, `${claim.category} is not a surface`);
  }

  if (claim.claim === "runs") {
    if (!claim.entrypoint) return reject(claim, "runs has no file:line");
    const text = await readText(join(repoRoot, claim.entrypoint.file));
    if (text === null) return reject(claim, `missing ${claim.entrypoint.file}`);
    const lines = text.split(/\r?\n/);
    if (claim.entrypoint.line < 1 || claim.entrypoint.line > lines.length) {
      return reject(claim, `line ${claim.entrypoint.line} is outside ${claim.entrypoint.file}`);
    }
    const manifest = MANIFEST.test(claim.entrypoint.file);
    if (!citedLineMatches(text, claim.entrypoint.line, claim.category, manifest)) {
      return reject(claim, `line ${claim.entrypoint.line} is not a ${claim.category} construct`);
    }
    if (claim.evidence_kind === "resolved_declaration" || claim.evidence_kind === "container_cmd") {
      const citations = await declaredCitations(repoRoot, unitFor(claim));
      const matched = citations.some(
        (citation) =>
          citation.file === claim.entrypoint!.file &&
          citation.line === claim.entrypoint!.line &&
          citation.category === claim.category
      );
      if (!matched) return reject(claim, "declaration does not resolve to the cited file:line");
    }
  }

  if (claim.claim === "does_not_run" || claim.claim === "uncertain") {
    const searched =
      claim.searched.globs.length + claim.searched.greps.length + claim.searched.files_opened.length;
    if (searched === 0) return reject(claim, "empty search");
  }

  if (claim.claim === "does_not_run") {
    if (claim.searched.files_opened.length === 0) return reject(claim, "does_not_run opened no files");
    const declared =
      claim.searched.files_opened.some((file) => MANIFEST.test(file)) ||
      claim.searched.greps.some((grep) => grep.startsWith("resolve:"));
    if (!declared) return reject(claim, "does_not_run did not try a declaration");
    const swept =
      claim.searched.globs.length > 0 ||
      claim.searched.greps.some((grep) => grep.length > 0 && !grep.startsWith("resolve:"));
    if (!swept) return reject(claim, "does_not_run did not sweep for constructs");
  }

  if (!counterIsConcrete(claim)) {
    return reject(claim, "counter-check does not name a file, glob, or line");
  }
  return accept(claim);
}
