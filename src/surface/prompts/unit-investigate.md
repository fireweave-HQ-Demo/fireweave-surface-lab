<!-- prompt-version: 1 -->

# Unit investigation

Each step emits a typed artifact. The verifier reads those artifacts, not prose. Do not skip a step. Do not decide in step 1.

The scanner's verdict, kind, library, undecidable, and preselect fields are not inputs. Do not ask for them.

## STEP 0 SCOPE

Emit `{manifests, languages, file_inventory}` for this unit. File inventory stops at depth 3. Do not enter `node_modules`, `dist`, `.venv`, `vendor`, or another unit's directory.

## STEP 1 ORIENT

Emit `{languages, deps_summary, description, placeholder_signals}`. A description may mention a later phase. That is context, not a decision. DO NOT DECIDE.

## STEP 2 DECLARE

List every claim of execution: `scripts.*`, `[project.scripts]`, `[tool.poetry.scripts]`, `main` / `bin`, Dockerfile `CMD` / `ENTRYPOINT`, Procfile, serverless handlers, `func main`. These are LEADS, not facts. A manifest line is copyable and is not yet evidence.

## STEP 3 RESOLVE

Follow each declaration to `file:line`, or record `unresolved(reason)`.

- `tsx src/server.ts` resolves to that file, then to the construct inside it.
- `worker = "app.worker:main"` resolves to `app/worker.py`.
- A command with no source file (`next start`, `vitest`) stays unresolved. `vitest` is tooling, not a service.

## STEP 4 HUNT

If nothing resolved, scan execution idioms from the extractor for this ecosystem. Record the search: `{globs, greps, files_opened}`. An empty search cannot support `does_not_run`.

## STEP 5 RECONCILE

Compare the declarations with what the hunt found. Disagreement is recorded, not hidden. A dev script that points at vitest, eslint, tsc, or `next build` is tooling, not a service.

## STEP 6 CLASSIFY

One category, from the invariant, not from a filename:

| Category | Invariant |
|---|---|
| service | constructs a listener/bind and blocks |
| worker | event/poll loop, no listener |
| static-web | deployable document tree (entry HTML + assets, or a site config) |
| cli | parses args, runs, exits — no loop |
| library | exports only; consumers import it |
| tooling | executes but short-lived and dev-invoked (build/test/lint/migrate) |
| placeholder | empty deps + no code |
| ambiguous | evidence insufficient → review |

A listener outranks a main guard. A route handler outranks a site config. A main guard with no loop is tooling, not a worker.

## STEP 7 CRITIQUE

State "wrong if X". Check X. Emit the check: a file opened, a glob run, or a line read. A restatement of the hypothesis is not a check.

## STEP 8 COVERAGE

Emit `{inspected, skipped (with reason), uncertain}`, then the claim and its citations.

A `runs` claim includes `{file, line, snippet}` and an evidence kind: `resolved_declaration`, `framework_ctor`, `main_guard`, `container_cmd`, or `implicit_construct`.

A `does_not_run` claim includes the search from step 4, including one declaration attempt and one idiom sweep.
