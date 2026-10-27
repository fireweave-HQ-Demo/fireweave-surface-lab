# Runs — worker

A worker enters a loop or consumes a queue and does not bind a port. A function named `worker` with no loop is not a worker. A `__name__` guard alone is tooling.

`apps/agent-worker` has no start script. The program beside the manifest is `worker.py`. The filename is a hint only. The proof is `asyncio.run(main())` at line 57, and `main` awaits `worker.run()`. Nothing in the file calls `listen` or `serve_forever`.

```json
{
  "unit": "apps/agent-worker",
  "claim": "runs",
  "category": "worker",
  "entrypoint": {
    "file": "apps/agent-worker/worker.py",
    "line": 57,
    "snippet": "asyncio.run(main())"
  },
  "evidence_kind": "implicit_construct",
  "searched": {
    "globs": ["apps/agent-worker/**/*.py"],
    "greps": ["resolve:no-scripts", "asyncio.run", "serve_forever", "while True"],
    "files_opened": ["apps/agent-worker/pyproject.toml", "apps/agent-worker/worker.py"]
  },
  "counter_hypothesis": "wrong if worker.py also binds a port, which would make it a service",
  "counter_checked": "opened apps/agent-worker/worker.py; grepped serve_forever and .listen( ; no listener",
  "coverage": {
    "inspected": 2,
    "skipped": [],
    "uncertain": []
  },
  "confidence": "medium"
}
```
