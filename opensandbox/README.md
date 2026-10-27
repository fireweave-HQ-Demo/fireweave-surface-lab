# Surface detection sandbox

The entrypoint runs the surface-detection skill and writes `surface-report.html`. A start script is a lead. The cited line has to be a listener, a loop, or `next start`. `new Hono(`, a route handler, and `next.config.ts` are not surfaces.

## On the host

```bash
bun opensandbox/run.ts /path/to/repo
```

The report is written to `./surface-report.html`.

## In Docker, the same entrypoint a sandbox runs

```bash
docker build -f opensandbox/Dockerfile -t fireweave-surface-skill .
docker run --rm \
  -v /path/to/repo:/work:ro \
  -v "$PWD":/out \
  fireweave-surface-skill /work /out/surface-report.html
```

## On an OpenSandbox server

```bash
osb sandbox create --image fireweave-surface-skill --timeout 30m
osb command run <sandbox-id> -o raw -- bun /opt/surface/opensandbox/run.ts /work /work/surface-report.html
```

`opensandbox/sandbox.toml` is the image, timeout, and entrypoint.
