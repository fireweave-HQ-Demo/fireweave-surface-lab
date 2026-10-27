# Does not run

`apps/voice-worker` has a manifest, an empty dependency list, and a description that says voice is a later phase. The description is a placeholder signal. It is not the drop. The drop is: every declared lead was resolved, an implicit sweep found no listener and no loop, and the files opened are listed.

```json
{
  "unit": "apps/voice-worker",
  "claim": "does_not_run",
  "category": "placeholder",
  "evidence_kind": "implicit_construct",
  "searched": {
    "globs": ["apps/voice-worker/**/*.py"],
    "greps": ["resolve:no-scripts", "serve_forever", "asyncio.run", "uvicorn.run"],
    "files_opened": ["apps/voice-worker/pyproject.toml"]
  },
  "counter_hypothesis": "wrong if an undeclared entry still executes",
  "counter_checked": "opened apps/voice-worker/pyproject.toml; no scripts; glob apps/voice-worker/**/*.py found no program",
  "placeholder_signals": ["Placeholder for the LiveKit voice worker. Voice is a later phase.", "no dependencies"],
  "convention_flag": "apps/* are deployable and packages/* are libraries",
  "coverage": {
    "inspected": 1,
    "skipped": [],
    "uncertain": []
  },
  "confidence": "medium"
}
```

`packages/ui` is the same shape with `category: "library"`: the package exports CSS, nothing imports it as a program, and the search record shows the export file was opened. The folder living under `packages/` is the hypothesis, not the proof.
