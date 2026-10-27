# Repo conventions

A repo is internally consistent. Name its shape first (`examples/repo-shapes.md`): a single package, apps beside libraries, a workspace of published libraries, one module with `cmd/` and `internal/`, or several processes in one repo. The shape decides which folder is a unit. It does not decide the category. That is the language row in `references/constructs.md`.

Infer the rule once, with evidence, then treat a unit that breaks it as a flag to investigate harder. A flag is not a drop and not a skip.

## How to infer

Look at where manifests live, not at folder names.

- If `apps/*` declare a `start`, `serve`, `dev`, or `worker` script whose command is not a test runner, linter, or build, or they sit beside a program file, and `packages/*` do none of that, the rule is: `apps/*` are deployable and `packages/*` are libraries.
- Record `{rule, evidence, exceptions}`. Evidence is one line per unit: `path: why`. Exceptions are the apps that do not look deployable, and any package that does.
- A manifestless folder with real source is its own unit. The apps/packages rule does not cover it.

## How to use the rule

The rule is a prior for Step 3. It is not a verdict.

- A unit that matches the rule still gets Steps 5–8. `packages/ui` is a library only after the search finds exports and no listener.
- A unit that breaks the rule (`apps/voice-worker`, `apps/extension`) is investigated in full. Record the rule on the claim as `convention_flag`. The exception does not shorten the search.
- `apps/sandbox-ehr` has no manifest. Classify it from the code. Do not drop it because the convention never mentioned it.

## What is not a convention

- A filename (`worker.py`, `server.py`, `main.py`) is not a repo rule.
- A description ("later phase") is not a repo rule.
- The scanner's verdict, kind, or preselect flag is not a convention. Do not read them before the claim.
