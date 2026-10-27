# Failure modes and how to avoid them

## "I couldn't find an entrypoint"
You cannot claim `does_not_run` unless `searched` is non-empty and includes:
- every declared script's resolution attempt
- at least one implicit sweep (globs + greps for execution constructs)
- every file you opened

If you have not done all three, go back and do them. "I couldn't find" is not the same as "I searched and found nothing."

## "The start script points to a file that doesn't exist"
Emit `unresolved: {decl, reason: "target not found"}` and continue to Step 6 (hunt). Do not claim `runs` on the strength of the declaration alone.

## "The start script is a shell script"
Open it, record `traversed: [start.sh, ...]`, and follow one level. If the shell script invokes another script, emit `uncertain` with reason `shell_traversal_exceeded`. Do not guess.

## "It has a dev script that runs a test runner"
That is `tooling`, not a surface. Cite the test runner invocation in the dev script line and classify as `tooling`. Do not classify as service.

## "It's a Next.js app"
The surface is the `next start` line in `package.json`. Cite that line. `next.config.ts`, `route.ts`, and a page export are lookalikes.

## "It's a Django app"
Cite `get_wsgi_application()` in `wsgi.py`, or the `gunicorn` / `runserver` line in the manifest. `settings.py` and `Django()` are lookalikes.

## "This language is not JavaScript"
Use the row for that language in `references/constructs.md`. The listener column is the citation. The lookalike column rejects a `service` claim. A language with no row is `uncertain`.

## "The repo is not the clinic layout"
Name the shape in `examples/repo-shapes.md` before classifying folders. A workspace of published libraries (a build script, `exports`, no listener) is a library monorepo. `cmd/api` plus `internal/` is one Go module, and only `cmd/api` can be the service.

## "It's a monorepo with polyglot units"
Classify per unit. If one path has both a TS server and a Python worker, emit two claims with distinct `execution_id` values. A single path can have multiple surfaces.

## "I ran out of tool budget"
Emit `uncertain` with reason `budget_exhausted` and the `searched` record so far. Do not guess. The next run will have a fresh budget and the cache will help.

## "The evidence conflicts"
Emit `uncertain` with the conflict stated. Example: "declared script resolves to a file, but that file has no execution construct. Start script may be stale."

## "I'm not sure if this is a library or a service"
If it has a listener, it's a service, regardless of whether it also exports. If it only exports, it's a library. If it has both a listener and a queue consumer, it's a service (with a note that it also consumes a queue). Do not average categories.
