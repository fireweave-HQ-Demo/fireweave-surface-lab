# Claim schema

Emit one JSON object per surface. The machine shapes are `assets/claim.schema.json` and `assets/verified-claim.schema.json`. The verifier reads this object. Empty required fields are a rejected claim: go back and fill them, or change `claim` to `uncertain`.

## Claim

| Field | Required | Rule |
| --- | --- | --- |
| `unit` | always | Repo-relative path. `.` is the workspace root. |
| `claim` | always | `runs`, `does_not_run`, or `uncertain`. |
| `category` | always | One row from `constructs.md`. |
| `entrypoint` | when `claim` is `runs` | `{file, line, snippet}`. `line` is 1-based. The snippet is the cited line, not a paraphrase. |
| `evidence_kind` | when `claim` is `runs` | `resolved_declaration` when you followed a script, bin, CMD, or ENTRYPOINT to that line. Otherwise `implicit_construct`. |
| `searched` | always | `{globs, greps, files_opened}`. For `does_not_run`, all three carry the search: at least one declaration-resolution attempt, one implicit sweep, and every file opened. An empty object is a reject. |
| `counter_hypothesis` | always | The specific fact that would make this claim wrong. |
| `counter_checked` | always | The action you took. It must name a file, a glob, a grep, or `line N`. It must not restate the hypothesis. |
| `coverage` | always | `{inspected, skipped, uncertain}`. `skipped` entries are `{path, reason}`. |
| `confidence` | always | `high` when `runs` came from a resolved declaration. `medium` when `runs` came from a hunt, or a non-ambiguous `does_not_run`. `low` when the category is `ambiguous` or the claim is `uncertain`. |
| `convention_flag` | when Level 1 flagged the unit | The rule string. The flag does not change the claim. |
| `placeholder_signals` | when seen | Description text and empty-deps notes. Context only. Not a reason to drop. |
| `execution_id` | when one path has two surfaces | Distinguishes a second claim on the same `unit`. |
| `reason` | when `claim` is `uncertain` | What was checked and what is missing. |

`runs` plus `library` or `tooling` is rejected. A negative without `files_opened` is rejected.

## Verified claim

The checker returns the same object plus:

| Field | Meaning |
| --- | --- |
| `verified` | `true` only when every check passed. |
| `rejection_reason` | Present when a check failed. The original `claim` string is left as emitted. |
| `downgraded_to` | `"uncertain"` on any failure. The checker never rewrites a claim upward. |
