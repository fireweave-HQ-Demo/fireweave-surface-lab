export type Unit = {
  path: string;
  manifests: string[];
  languages: string[];
};

export type Convention = {
  rule: string;
  evidence: string[];
  exceptions: string[];
};

export type SearchRecord = {
  globs: string[];
  greps: string[];
  files_opened: string[];
};

export type Category =
  | "service"
  | "worker"
  | "static-web"
  | "cli"
  | "library"
  | "tooling"
  | "placeholder"
  | "ambiguous";

export type ClaimKind = "runs" | "does_not_run" | "uncertain";

export type Claim = {
  unit: string;
  claim: ClaimKind;
  category: Category;
  /** Which extractor labelled the cited construct. The verifier uses only that table. */
  ecosystem?: string;
  entrypoint?: { file: string; line: number; snippet: string };
  evidence_kind?:
    | "resolved_declaration"
    | "framework_ctor"
    | "main_guard"
    | "container_cmd"
    | "implicit_construct";
  searched: SearchRecord;
  counter_hypothesis: string;
  counter_checked: string;
  /** Set when Level 1 flagged this unit as a convention exception. Investigation still runs. */
  convention_flag?: string;
  /** Orient-step context. Not a selection signal. */
  placeholder_signals?: string[];
  coverage: {
    inspected: number;
    skipped: { path: string; reason: string }[];
    uncertain: string[];
  };
  confidence: "high" | "medium" | "low";
};

export type VerifiedClaim = Claim & {
  verified: boolean;
  rejection_reason?: string;
  downgraded_to?: "uncertain";
};

export type Diff = {
  unit: string;
  scanner: { verdict: string; kind: string; selected: boolean };
  agent: VerifiedClaim;
  cell: "both_surface" | "scanner_only" | "agent_only" | "both_drop";
  action: "selected" | "dropped" | "review";
};

/** A scanner row as the diff sees it. The investigator never receives this. */
export type ScannerView = {
  path: string;
  verdict: string;
  kind: string;
  selected: boolean;
};
