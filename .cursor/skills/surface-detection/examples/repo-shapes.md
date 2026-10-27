# What the unit is

The category question does not change with the layout. The layout decides which folder you ask it about. Infer the shape from where the manifests live, then investigate each unit. The folder name is the hypothesis.

## Single package

One manifest at the root, no workspace list. The root is the unit. A listener in `src/server.ts`, `cmd/api`, or `server.py` means the root runs. Keep the root. Dropping every `.` drops the only app in this shape.

## Apps and libraries

`apps/*` declare a `start`, `serve`, or `dev` command that is not a test, lint, or build, or they sit beside a program. `packages/*` export code and do not listen. The rule is `apps/*` are deployable and `packages/*` are libraries. Search each unit anyway. An app with no program (`apps/voice-worker`) and a package that listens are exceptions: record them as `convention_flag` and classify from the row, not from the folder.

## Workspace of published libraries

Many packages, each with a name, a version, and `exports` or `files`, and a build script. Nothing in the repo imports them, because they are published for other repos. The root is a workspace aggregator, not an app. A build script is not a listener. A handler export (`export const handler`, `export default app`, `fire()` that registers `fetch` and is never called) is a library. Hono is this shape: the adapter packages and `src/middleware/*` do not run.

## One module, many folders

One `go.mod` or one Cargo workspace. `cmd/api` (Go) or the binary target (Rust) is the unit that can be a service, and only if its `main` contains a listener from the Go or Rust row. `internal/`, `pkg/`, and library crates are libraries. A `func main` in a `cmd/` tool that only parses flags is a CLI, not a service.

## Several processes, one repo

A compose file or a handful of Dockerfiles names a process per service. The unit is the directory the `CMD` or `ENTRYPOINT` runs. Follow that command into the program file and cite the listener there. The compose file is the lead, not the citation.
