# Agent only

`apps/sandbox-ehr` has no manifest. It is still a unit: a folder of real source whose parent is not itself a manifest. The scanner's topology skips it. You do not read that fact before answering.

The file ends at:

```python
if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
```

`serve_forever` binds and blocks. The category is `service`. The `__name__` guard does not downgrade it to tooling, because a listener outranks a main guard.

```json
{
  "unit": "apps/sandbox-ehr",
  "claim": "runs",
  "category": "service",
  "entrypoint": {
    "file": "apps/sandbox-ehr/server.py",
    "line": 107,
    "snippet": "ThreadingHTTPServer((\"0.0.0.0\", PORT), Handler).serve_forever()"
  },
  "evidence_kind": "implicit_construct",
  "searched": {
    "globs": ["apps/sandbox-ehr/**/*.py"],
    "greps": ["resolve:no-scripts", "serve_forever", "ThreadingHTTPServer("],
    "files_opened": ["apps/sandbox-ehr/server.py"]
  },
  "counter_hypothesis": "wrong if serve_forever is inside a test or an uncalled helper",
  "counter_checked": "opened apps/sandbox-ehr/server.py:107; serve_forever is under the __main__ guard at top level",
  "coverage": {
    "inspected": 1,
    "skipped": [],
    "uncertain": []
  },
  "confidence": "medium"
}
```

Emit this claim. The later diff, which you do not compute, marks the unit `agent_only` and sends it to review. Do not drop it because no manifest declared it, and do not select it yourself.
