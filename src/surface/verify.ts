import { join } from "node:path";
import type { Claim, Unit, VerifiedClaim } from "./types";
import { ecosystemsForFiles, extractor } from "./extractors";
import { matchesNear, readText } from "./extractors/scan";

const MANIFEST = /(?:^|\/)(package\.json|pyproject\.toml|Dockerfile|Procfile|go\.mod|Cargo\.toml|index\.html)$/;

function reject(claim: Claim, reason: string): VerifiedClaim {
  return { ...claim, verified: false, rejection_reason: reason, downgraded_to: "uncertain" };
}

function accept(claim: Claim): VerifiedClaim {
  return { ...claim, verified: true };
}

function hasDeclarationAttempt(claim: Claim): boolean {
  return (
    claim.searched.files_opened.some((file) => MANIFEST.test(file)) ||
    claim.searched.greps.some((grep) => grep.startsWith("resolve:"))
  );
}

function hasImplicitSweep(claim: Claim): boolean {
  return (
    claim.searched.globs.length > 0 ||
    claim.searched.greps.some((grep) => grep.length > 0 && !grep.startsWith("resolve:"))
  );
}

function searchPopulated(claim: Claim): boolean {
  return (
    claim.searched.globs.length + claim.searched.greps.length + claim.searched.files_opened.length > 0
  );
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
  const manifests = claim.searched.files_opened
    .filter((file) => file.startsWith(`${claim.unit}/`) || claim.unit === ".")
    .map((file) => file.slice(claim.unit === "." ? 0 : claim.unit.length + 1))
    .filter((name) => !name.includes("/"));
  const languages = claim.ecosystem ? [claim.ecosystem] : [];
  return { path: claim.unit, manifests, languages };
}

/**
 * Deterministic check of one claim. It can reject and downgrade to uncertain.
 * It never turns a rejected claim into a pass, and it never raises confidence.
 */
export async function verify(repoRoot: string, claim: Claim): Promise<VerifiedClaim> {
  if (claim.claim === "runs" && (claim.category === "tooling" || claim.category === "library")) {
    return reject(claim, `${claim.category} is not a surface`);
  }

  if (claim.claim === "runs") {
    if (!claim.entrypoint) return reject(claim, "runs has no file:line");
    const abs = join(repoRoot, claim.entrypoint.file);
    const text = await readText(abs);
    if (text === null) return reject(claim, `missing ${claim.entrypoint.file}`);
    const lines = text.split(/\r?\n/);
    if (claim.entrypoint.line < 1 || claim.entrypoint.line > lines.length) {
      return reject(claim, `line ${claim.entrypoint.line} is outside ${claim.entrypoint.file}`);
    }
    const ecosystem =
      claim.ecosystem ?? ecosystemsForFiles([claim.entrypoint.file])[0] ?? null;
    const tool = ecosystem ? extractor(ecosystem, repoRoot) : null;
    if (!tool) return reject(claim, "no extractor for the cited file");
    if (!matchesNear(text, claim.entrypoint.line, tool.executionIdioms())) {
      return reject(claim, "cited line does not match an execution construct");
    }
    if (claim.evidence_kind === "resolved_declaration") {
      const facts = await tool.readManifest(unitFor(claim));
      const declarations = [...facts.scripts, ...facts.bins];
      const resolutions = await Promise.all(
        declarations.map((decl) => tool.resolveDeclaration(unitFor(claim), decl))
      );
      const matched = resolutions.some(
        (resolution) =>
          "file" in resolution &&
          resolution.file === claim.entrypoint!.file &&
          resolution.line === claim.entrypoint!.line
      );
      if (!matched) return reject(claim, "declaration does not resolve to the cited file:line");
    }
  }

  if (claim.claim === "does_not_run") {
    if (!searchPopulated(claim)) return reject(claim, "does_not_run with an empty search");
    if (!hasDeclarationAttempt(claim)) return reject(claim, "does_not_run did not try a declaration");
    if (!hasImplicitSweep(claim)) return reject(claim, "does_not_run did not sweep for constructs");
  }

  if (!counterIsConcrete(claim)) {
    return reject(claim, "counter-check does not name a file, glob, or line");
  }

  return accept(claim);
}
