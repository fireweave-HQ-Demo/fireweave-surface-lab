# Category → allowed constructs

The invariant is the same in every language. The row is the proof. Cite a line from the **listener** column of the unit's language. A line from the **lookalike** column is not that category.

Read the row for the language in front of you before Step 7. A unit with two languages gets one claim per language.

## How to apply a row

1. Name the language from the manifest and the file you opened (`package.json` → JavaScript/TypeScript, `pyproject.toml` → Python, `go.mod` → Go, `Cargo.toml` → Rust, `pom.xml` / `build.gradle` → Java or Kotlin, `*.csproj` → C#, `Gemfile` → Ruby, `composer.json` → PHP, `pubspec.yaml` → Dart, `Package.swift` or an Xcode project → Swift).
2. A service citation is a listener that actually runs: top level, or inside the entry (`if __name__`, `func main`, `fn main`, `public static void main`, `fun main`, `Main`, `@main` that starts a server) or inside a function that entry calls.
3. A lookalike on the cited line rejects a `service` claim. A constructor, a route, an export, and a README line are lookalikes.
4. A language with no row here is `uncertain`. Borrowing another language's patterns is not a classification.

## service

The line binds a port or starts the listener and blocks.

| Language | Entry | Listener | Lookalike |
|---|---|---|---|
| JavaScript, TypeScript, Node, Bun, Deno | top level, or a function the top level calls | `.listen(`, `serve(`, `http.createServer(`, `https.createServer(`, `Bun.serve(`, `Deno.serve(` | `new Hono(`, `express()`, `Fastify(`, `export default app`, `export const handler`, `export async function GET`, `addEventListener('fetch'` inside a function nothing calls |
| Python | module top level, or under `if __name__`, or in a function that guard calls | `uvicorn.run`, `<name>.run(`, `<name>.run_app(`, `.serve_forever(`, `HTTPServer(`, `ThreadingHTTPServer(`, `get_wsgi_application(`, `execute_from_command_line(` | `FastAPI(`, `Flask(`, `Django(`, `asyncio.run(`, `worker.run(`, a `__main__` guard with no listener in its block |
| Go | body of `func main` | `http.ListenAndServe`, `http.Serve`, `net.Listen`, `.Run(`, `.Start(`, `.Listen(` | `http.HandleFunc`, `http.Handle`, a `func main` that returns without a listener |
| Rust | body of `fn main` | `TcpListener::bind`, `axum::serve`, `HttpServer::new`, `Server::bind`, `.bind(`, `.serve(`, a `loop` or `.start(` in `fn main` | `pub fn` in a library crate, a `fn main` that returns without a listener or a loop |
| Java, Kotlin | `public static void main`, `fun main` | `SpringApplication.run`, `port(<number>)`, `ServerSocket(`, `HttpServer.create`, Ktor `embeddedServer` | `@RestController`, `@GetMapping`, `@SpringBootApplication` on a class with no `main` |
| C# | `Main` | `WebApplication` `.Run(`, `app.Run(`, `.Listen(` | a controller class, `MapGet` with no `.Run(` |
| Ruby | boot file or the manifest command that starts the process | `TCPServer.new`, `WEBrick` `.start`, the `rails server` / `puma` / `rackup` line in the manifest | a model, a controller, `Rails.application.routes.draw` |
| PHP | front controller the start command runs, or the manifest command | `socket_listen`, ReactPHP `$socket->listen` / `->run(`, the `php -S` or `php artisan serve` line in the manifest | a Laravel routes file, a class with no listener |
| Dart | `main` | `shelf` `serve(`, `HttpServer.bind` | `runApp(`, a Flutter widget |
| Swift | `@main` or `main` that starts a server | Vapor `app.run()`, `NWListener` | a SwiftUI `App` body |

Some frameworks bind inside their own binary. For those, the manifest line **is** the listener. Cite that line:

- JavaScript: `next start`, `next dev`
- Python: `gunicorn`, `runserver`
- Ruby: `rails server`, `puma`, `rackup`
- PHP: `php artisan serve`, `php -S`
- Java: `spring-boot:run`

`go run`, `cargo run`, `dotnet run`, `dart run`, and `bun run` are not listeners. Follow them to the listener in the table, or the claim is not a service.

`dev`, `build`, and `test` scripts are leads. A `build` script on a published package (it has a version and `exports` or `files`, and it is not `private`) is a library signal.

## worker

The line enters a loop or consumes a queue, and does not bind a port.

| Language | Listener | Lookalike |
|---|---|---|
| JavaScript, TypeScript | a top-level poll loop, `consumer.run(`, a `worker` script that reaches one of those | a function named `worker` |
| Python | `while True`, `asyncio.run` of a queue consumer, `worker.run(`, `@app.task`, `@shared_task`, `.consume(`, `receive_message(` | `asyncio.run` of an HTTP server (that is a service), a function named `worker` |
| Go | a `for` loop in `func main` that receives from a queue | `http.HandleFunc` |
| Rust | a loop in `fn main` that receives from a queue | `pub async fn` |
| Java, Kotlin | `@Scheduled`, a consumer loop in `main` | a `@Service` class with no loop |
| Ruby | a Sidekiq `perform` worker started by a process command, `sidekiq` on the manifest line | a class named `Worker` that nothing starts |
| PHP | a queue worker command on the manifest (`queue:work`) | a job class nothing runs |
| C# | `BackgroundService.ExecuteAsync` reached from `Main` | a class named `Worker` that `Main` never starts |

A folder named `worker` whose program calls `serve_forever` is a service.

## static-web

A deployable document tree.

- An entry HTML file with `<script src=` or `<link rel=`.
- A site config the start command uses: `astro.config`, `svelte.config`, `_config.yml`, `hugo.toml`. `next.config` is not a service citation; a Next app is a service via `next start`.
- `public/index.html` or the equivalent output root, with assets.

A lone HTML file with no assets and no start command is not a static site.

## cli

The program parses arguments, runs, and exits. It does not bind a port and it does not loop.

| Language | Listener | Lookalike |
|---|---|---|
| JavaScript, TypeScript | `process.argv` read by the entry, a `bin` entry that reaches that file | `.click()` on a DOM node |
| Python | `argparse`, `ArgumentParser(`, `click.command`, `typer.Typer` | a function named `main` that parses nothing |
| Go | `cobra.Command`, `flag.Parse` in `func main` | `func main` with no flags and no listener |
| Rust | `clap::` in `fn main` | `pub fn` |
| Java, Kotlin | `picocli` or `args` handling in `main` | `@RestController` |
| C# | `System.CommandLine` in `Main` | `WebApplication` `.Run(` (that is a service) |
| Ruby | `OptionParser`, `thor` | a Rails controller |
| PHP | `getopt` in the entry script | a route file |
| Shell | a script with a shebang whose entry reads `"$@"` or `getopts` | a script that only exports variables |

## library

The unit only exports code another unit imports.

- JavaScript: `export`, `module.exports`, a handler another process is expected to call.
- Python: `def` / class with no `__main__` listener.
- Go: a package other than one whose `func main` listens; `internal/`.
- Rust: a `[lib]` crate, `pub fn`.
- Java: a module with no `main`.
- The other languages: types and functions, and no listener from the tables above.

A listener anywhere in the unit means it is not a library.

## tooling

The command is a test runner, a build, a linter, a formatter, or a migration. `vitest`, `jest`, `pytest`, `go test`, `cargo test`, `tsc`, `vite build`, `mvn package`, `eslint`, `ruff`, `golangci-lint`, `prisma migrate`, `alembic`. A `dev` script that resolves to one of these is tooling.

## placeholder

No listener, no loop, no CLI parse, and no real program. An empty dependency list and a description that says the work is later are context. The missing program is the reason. A manifest with no code is still a placeholder.

## uncertain

Evidence is not enough to pick a row. Say what you opened and which row you could not satisfy. Use this when the language has no row, when the only hit is a lookalike, or when the listener sits in a function the entry never calls.
