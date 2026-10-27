<!-- prompt-version: 1 -->

# Repo conventions

Run once per repo, before any unit investigation. The scanner's verdict, kind, library, undecidable, and preselect fields are not inputs.

## topology

Enumerate units. A unit is a directory with its own manifest (`package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `Dockerfile`, `Procfile`, `index.html`), or a manifestless directory that contains source and whose only manifest ancestor is the repo root.

Record `{path, manifests, languages}` for each unit.

Do not enter `node_modules`, `dist`, `.venv`, `vendor`, or `.git`. Record each skipped directory. If an excluded directory contains a manifest, record it as a review item. Do not silently drop it, and do not treat it as an ordinary unit.

## conventions

Infer this repo's own rule for deployable versus library. The rule is fallible. Every rule is `{rule, evidence, exceptions}`.

Evidence is a list of paths and the manifest fact that put them on one side. Example shape, only when the repo actually splits this way: apps that name a start, serve, or dev script, or that contain a program file, versus packages whose scripts are test, typecheck, or lint.

Directory names are not the rule by themselves. They count only when the manifests agree.

## check

Compare every unit with the inferred rule. Agreement is a prior. Disagreement is a flag passed into the unit investigation. A flag does not skip a step and does not drop the unit. `apps/voice-worker` with no program and no start script is an exception to be investigated, not an exception to ignore.
