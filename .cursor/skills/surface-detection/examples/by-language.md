# One pair per language

The listener is the citation. The lookalike is the line that gets a `service` claim rejected. Paths are the shape of the proof, not a repo you have to clone.

## JavaScript, TypeScript, Node, Bun, Deno

Listener: `src/server.ts:275` `serve({ fetch: app.fetch, port: env.port })` at top level. A Bun process cites `Bun.serve(`. A Deno process cites `Deno.serve(`.

Lookalike: `src/middleware/cors/index.ts` `export const cors = () => async (c, next) =>`. Also `new Hono(`, `export default app`, and any line in `README.md`. Depending on `bun` or `hono` is not a listener.

## Python

Listener: `server.py` under `if __name__` calls `ThreadingHTTPServer(...).serve_forever()`, or the manifest line is `gunicorn`.

Lookalike: `app = FastAPI()` or `Flask(__name__)` with no `uvicorn.run` and no `gunicorn` line.

## Go

Listener: `cmd/api/main.go` inside `func main` calls `http.ListenAndServe(":8080", nil)`.

Lookalike: `http.HandleFunc("/", ...)` in `internal/http`, or a `func main` that logs and returns.

## Rust

Listener: `src/main.rs` inside `fn main` calls `axum::serve(listener, app)`.

Lookalike: `pub fn router()` in a `[lib]` crate.

## Java, Kotlin

Listener: `src/main/java/.../Application.java` inside `main` calls `SpringApplication.run(Application.class, args)`.

Lookalike: `@RestController` / `@GetMapping` on a class with no `main`.

## C#

Listener: `Program.cs` calls `app.Run()` on a `WebApplication` built in `Main`.

Lookalike: a controller class, or `MapGet` with no `.Run(`.

## Ruby

Listener: the manifest line `rails server` or `puma`, or `TCPServer.new` in the boot file.

Lookalike: `Rails.application.routes.draw` or a controller action.

## PHP

Listener: the manifest line `php artisan serve` or `php -S`, or `$socket->listen` in the process that starts.

Lookalike: `routes/api.php`.

## Dart

Listener: `bin/server.dart` inside `main` calls `serve(handler, host, port)` or `HttpServer.bind`.

Lookalike: `runApp(` in a Flutter app. That ships to a device. It is not a server.

## Swift

Listener: the server target calls `try app.run()` (Vapor) or starts an `NWListener`.

Lookalike: a SwiftUI `@main` whose body is a `Scene`.
