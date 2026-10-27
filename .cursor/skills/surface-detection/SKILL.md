---
name: surface-detection
description: Investigate a repository zone or unit to determine whether it is a runnable surface (service, worker, static site, CLI) or not (library, tooling, placeholder), with a mandatory file:line citation for every positive claim and a mandatory search record for every negative. Use when classifying repos for instrumentation, onboarding, or security review, in whatever language the construct table names. Do NOT use when the answer is already known and verified — this skill is for investigation, not confirmation.
---

# Surface Detection

## What this skill does

Given a repository and a unit (a folder with a manifest, or a folder with real source but no manifest), answer one question:

> **What, if anything, executes here, and where is the proof?**

A **surface** is a zone you would actually instrument: a running service, a worker, a static site, or a CLI. A **library**, **tooling**, or **placeholder** is not a surface even when it has a manifest, a start script, or a name that sounds like an app.

## The two rules that make this work

These are not guidelines. A claim that violates either is rejected by the verifier and downgraded to `uncertain`.

**Rule 1 — No positive claim without a citation.**
Every `runs` claim must cite `file:line` in real source, and that line must contain a construct from the **claimed category's row for that language** (`references/constructs.md`). The same rule applies in every language the table names. A constructor, a route export, a config file, and a README line do not satisfy a `service` claim. A service binds a port and blocks, or the manifest line is the framework command the table lists as the listener.

**Rule 2 — No negative claim without a search record.**
Every `does_not_run` claim must include a `searched` record: which globs were run, which greps were run, which files were opened. An empty search is a rejected claim, not a negative. "I didn't find it" and "I didn't look" must be distinguishable in the output.

## What you must NOT do

- **Do not read the scanner's verdict, kind, library flag, undecidable flag, or preselect flag before answering.** Those are priors, used only after your answer, for the diff. Seeing them first turns investigation into confirmation.
- **Do not stop at the manifest.** A start script is a lead, not proof. Follow it to a file and a line.
- **Do not use a filename allowlist.** `worker.py`, `server.py`, `main.py` are hints at most. Follow what the repo declares, or hunt for execution constructs. Never decide based on a filename.
- **Do not keyword-match descriptions.** "Voice is a later phase" is context for the placeholder check, not a reason to drop. The drop must be argued from absent execution evidence + a populated search.
- **Do not emit `runs` or `does_not_run` if you are unsure.** `uncertain` is a valid and valuable answer. It routes to review, which is better than a confident wrong answer.

## The protocol — nine steps, in order

Each step produces a typed artifact. The verifier reads the artifacts, not your reasoning. Do not skip steps. Do not reorder them.

### Step 1 — Frame
State the unit, its manifests, its languages, and its file inventory at depth ≤ 3. Exclude `node_modules`, `dist`, `.next`, `.venv`, `vendor`, `target`, `build`, `__pycache__`, `*_pb2.py`, `*.min.js`, `*.map`, and record every exclusion.

**Artifact:** `{unit, manifests, languages, file_inventory, excluded}`

### Step 2 — Observe, do not conclude
Read the manifest(s). Record:
- declared scripts (name → command string)
- declared bins / mains / entry points
- dependencies (frameworks are leads; the listener row in `references/constructs.md` is the proof)
- description
- placeholder signals ("later phase," "reserved," "TODO," "coming soon")

**Artifact:** `{declared, deps, description, placeholder_signals}`

Do not decide at this step. The manifest is the suspect, not the evidence.

### Step 3 — Form a hypothesis
Given the name, deps, and repo conventions (see `references/conventions.md`), state what you expect and why. Name the evidence *for* and *against*.

**Artifact:** `{hypothesis, evidence_for, evidence_against}`

### Step 4 — Plan the search
For each possible category, list the greps from the row for **this unit's language** in `references/constructs.md`. Search the listener column and the lookalike column. A library search is exports only, with no listener from that row.

**Artifact:** `{searches: {globs, greps}}`

### Step 5 — Follow declared leads first (top-down)
For each declared script, bin, CMD, ENTRYPOINT, or handler: extract the target and open it. Record `file:line` and the snippet. If the target doesn't exist, record `unresolved: reason`. If it's a shell script, record `traversed: [start.sh, ...]` and follow one level.

**Artifact:** `{resolved: [{decl, file, line, snippet}], unresolved: [{decl, reason}]}`

### Step 6 — Hunt for implicit execution (bottom-up)
If Step 5 resolved nothing, or in addition to it, search for execution idioms. For each ecosystem, see `references/constructs.md`. Record every glob and grep you ran and every file you opened.

**Artifact:** `{implicit: [{file, line, construct}], searched: {globs, greps, opened}}`

### Step 7 — Classify by invariant, not by name
Apply the row for this unit's language (`references/constructs.md`). The folder name is not evidence. A folder called `browser-runner` whose program calls `serve_forever` is a **service**. A folder called `worker` with only exported functions is a **library**. A language with no row is `uncertain`.

**Artifact:** `{category, invariant, construct}`

If no category fits cleanly, emit `uncertain` with the reason. Do not force a category.

### Step 8 — Challenge yourself, then check
State the specific thing that would make your answer wrong. Then go check it. The check must be a concrete action (open a file, run a glob, read a line) — not a restatement of the hypothesis.

Examples:
- "I said library. Wrong if something imports it as runnable, or if there's a Dockerfile CMD."
- "I said does_not_run. Wrong if there's a container CMD I didn't open, or a script I didn't follow."
- "I said service. Wrong if the listener is inside an uncalled function, or if it also consumes a queue (then it's worker too)."

**Artifact:** `{counter_hypothesis, counter_checked, result}`

### Step 9 — Commit with receipt
Emit the claim in the schema at `references/schemas.md`. Every field is required. If any field would be empty, either go back and fill it, or change your claim to `uncertain`.

```json
{
  "unit": "apps/api",
  "claim": "runs",
  "category": "service",
  "entrypoint": {"file": "apps/api/src/server.ts", "line": 275, "snippet": "serve({ fetch: app.fetch, port: env.port })"},
  "evidence_kind": "resolved_declaration",
  "searched": {"globs": ["apps/api/**/*.ts"], "greps": ["listen\\(", "serve\\("], "files_opened": ["apps/api/src/server.ts", "apps/api/package.json"]},
  "counter_hypothesis": "wrong if the dev script points at a test runner",
  "counter_checked": "opened apps/api/package.json scripts.dev → tsx src/server.ts; opened src/server.ts:275 → serve()",
  "coverage": {"inspected": 11, "skipped": [{"path": "node_modules", "reason": "excluded"}], "uncertain": []},
  "confidence": "high"
}
```

## The verifier contract — what will be checked

After you emit, a deterministic checker (no model) will check:

1. Cited file exists.
2. Cited line exists.
3. The cited line itself contains a construct from the **listener column of the claimed category, for that language** (`references/constructs.md`). A neighbor line does not count. A `service` claim citing `new Hono(`, `FastAPI(`, `http.HandleFunc`, `@RestController`, `next.config.ts`, or a route export fails.
4. If `evidence_kind` is `resolved_declaration`, the resolution is recomputed from the manifest. If your `file:line` differs from the recomputed one, the claim is rejected.
5. If `claim` is `does_not_run`, `searched` must be non-empty **and** must include at least one declared-script resolution attempt and one implicit sweep.
6. If `claim` is `runs` and `category` is `tooling` or `library`, the claim is rejected.
7. `counter_checked` must reference a concrete action, not a restatement of `counter_hypothesis`.
8. `searched.files_opened` must be non-empty for any `does_not_run` claim.

Any failure downgrades the claim to `uncertain`. Nothing is promoted. The verifier can only reject or pass; it cannot upgrade.

## When to emit `uncertain`

Emit `uncertain` — with a reason — when:
- the evidence conflicts (a start script exists but the target doesn't)
- the only hit is a lookalike from that language's row, or the language has no row
- the resolution required following a shell script more than one level
- the unit has real source but no manifest and no execution construct was found
- you ran out of tool budget before completing the search

`uncertain` routes to review, which is a valid outcome. It is not a failure.

## Reading order

- `references/constructs.md` — the listener and the lookalike for each language. **Read the row for this unit's language before Step 7.**
- `references/conventions.md` and `examples/repo-shapes.md` — which folder is a unit. **Read both before Step 3.**
- `examples/by-language.md` — one listener and one lookalike per language. **Read the pair for this unit's language before the first claim.**
- `references/failure-modes.md` — what to do when stuck. **Read this if you're about to emit `uncertain` and want to avoid it.**
- `examples/runs-service.md`, `examples/runs-worker.md`, `examples/does-not-run.md`, `examples/agent-only.md`, `examples/rejected.md` — worked receipts. Read one before your first claim.
