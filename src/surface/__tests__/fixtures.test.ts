import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { investigateUnit } from "../investigate";
import { lineIsReachable } from "../reach";
import type { Claim } from "../types";
import { verify } from "../verify";

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "fw-fixture-"));
  made.push(root);
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, body);
  }
  return root;
}

async function checked(root: string, unit: { path: string; manifests: string[]; languages: string[] }): Promise<Claim> {
  const claim = await investigateUnit(root, unit, { nested: false, imported: false });
  return verify(root, claim);
}

describe("repo fixtures", () => {
  test("apps/api cites serve() at line 26, past a route glob that looks like a comment", async () => {
    const head = [
      'import { Hono } from "hono";',
      'import { serve } from "@hono/node-server";',
      "const app = new Hono();",
      'app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));',
      "const objectKey = `clinics/${who.clinicId}/documents/${documentId}`;",
    ];
    const pad = Array.from({ length: 20 }, () => 'app.get("/health", (c) => c.json({ ok: true }));');
    const body = [
      ...head,
      ...pad,
      "serve({ fetch: app.fetch, port: env.port }, () => {",
      "  console.log(`api listening on ${env.port}`);",
      "});",
      "",
    ].join("\n");
    expect(body.split("\n")[25]).toContain("serve({ fetch: app.fetch");
    const root = repo({
      "apps/api/package.json": JSON.stringify({ scripts: { dev: "tsx src/server.ts" } }),
      "apps/api/src/server.ts": body,
    });
    const claim = await checked(root, { path: "apps/api", manifests: ["package.json"], languages: ["node"] });
    expect(claim.claim).toBe("runs");
    expect(claim.category).toBe("service");
    expect(claim.verified).toBe(true);
    expect(claim.entrypoint).toMatchObject({ file: "apps/api/src/server.ts", line: 26 });
    expect(claim.entrypoint?.snippet).toContain("serve({ fetch: app.fetch");
  });

  test("a __main__ guard that calls a listener is a service, and the citation is the listener", async () => {
    const root = repo({
      "django/app/manage.py":
        'if __name__ == "__main__":\n    from django.core.management import execute_from_command_line\n    execute_from_command_line(sys.argv)\n',
      "nginx-flask-mysql/backend/hello.py":
        "server = None\n\nif __name__ == '__main__':\n    server.run()\n",
    });
    const django = await checked(root, { path: "django/app", manifests: [], languages: ["python"] });
    expect(django.claim).toBe("runs");
    expect(django.category).toBe("service");
    expect(django.verified).toBe(true);
    expect(django.entrypoint?.snippet).toContain("execute_from_command_line");
    const flask = await checked(root, { path: "nginx-flask-mysql/backend", manifests: [], languages: ["python"] });
    expect(flask.claim).toBe("runs");
    expect(flask.category).toBe("service");
    expect(flask.verified).toBe(true);
    expect(flask.entrypoint?.line).toBe(4);
    expect(flask.entrypoint?.snippet).toContain("server.run()");
  });

  test("express app.listen at line 55 stays a service", async () => {
    const lines = Array.from({ length: 54 }, () => "const unused = 1;");
    lines.push("app.listen(PORT, () => {");
    lines.push('  console.info("server up");');
    lines.push("});");
    const root = repo({
      "express/package.json": JSON.stringify({ scripts: { start: "node src/main.ts" } }),
      "express/src/main.ts": `${lines.join("\n")}\n`,
    });
    const claim = await checked(root, { path: "express", manifests: ["package.json"], languages: ["node"] });
    expect(claim.claim).toBe("runs");
    expect(claim.category).toBe("service");
    expect(claim.verified).toBe(true);
    expect(claim.entrypoint).toMatchObject({ file: "express/src/main.ts", line: 55 });
  });

  test("supabase og-images serve(handler) at line 4 is a service", async () => {
    const root = repo({
      "supabase/functions/og-images/index.ts":
        "import { serve } from 'https://deno.land/std@0.170.0/http/server.ts'\nimport { handler } from './handler.tsx'\n\nserve(handler)\n",
    });
    const claim = await checked(root, {
      path: "supabase/functions/og-images",
      manifests: [],
      languages: ["node"],
    });
    expect(claim.claim).toBe("runs");
    expect(claim.category).toBe("service");
    expect(claim.verified).toBe(true);
    expect(claim.entrypoint).toMatchObject({ file: "supabase/functions/og-images/index.ts", line: 4 });
  });

  test("hono cors middleware is a verified non-surface", async () => {
    const root = repo({
      "hono/src/middleware/cors/index.ts":
        "export const cors = () => async (c, next) => {\n  await next();\n};\n",
    });
    const claim = await checked(root, {
      path: "hono/src/middleware/cors",
      manifests: [],
      languages: ["node"],
    });
    expect(claim.claim).toBe("does_not_run");
    expect(claim.verified).toBe(true);
  });

  test("a brace inside a Go raw string does not hide ListenAndServe in func main", async () => {
    const source = [
      "package main",
      "func handler() {",
      "fmt.Fprintf(w, `",
      "{                       /  ===-",
      "`)",
      "}",
      "func main() {",
      'log.Fatal(http.ListenAndServe(":80", r))',
      "}",
      "",
    ].join("\n");
    const listen = source.split("\n").findIndex((line) => line.includes("ListenAndServe")) + 1;
    expect(lineIsReachable(source, listen, "main.go")).toBe(true);
    const root = repo({ "nginx-golang/backend/main.go": source, "nginx-golang/backend/go.mod": "module backend\n\ngo 1.18\n" });
    const claim = await checked(root, { path: "nginx-golang/backend", manifests: ["go.mod"], languages: ["go"] });
    expect(claim.claim).toBe("runs");
    expect(claim.category).toBe("service");
    expect(claim.verified).toBe(true);
    expect(claim.entrypoint?.snippet).toContain("ListenAndServe");
  });

  test("gin r.Run inside func main is a service", async () => {
    const root = repo({
      "gin/hello.go": 'package main\n\nfunc main() {\n\tr := gin.Default()\n\tr.Run(":8080")\n}\n',
      "gin/go.mod": "module gin\n\ngo 1.22\n",
    });
    const claim = await checked(root, { path: "gin", manifests: ["go.mod"], languages: ["go"] });
    expect(claim.claim).toBe("runs");
    expect(claim.category).toBe("service");
    expect(claim.verified).toBe(true);
    expect(claim.entrypoint?.snippet).toContain("r.Run");
  });

  test("SpringApplication.run and Spark port() are services", async () => {
    const root = repo({
      "spring/pom.xml": "<project></project>\n",
      "spring/src/main/java/com/company/project/Application.java":
        "package com.company.project;\nimport org.springframework.boot.SpringApplication;\n@SpringBootApplication\npublic class Application {\n    public static void main(String[] args) {\n        SpringApplication.run(Application.class, args);\n    }\n}\n",
      "sparkjava/sparkjava/pom.xml": "<project></project>\n",
      "sparkjava/sparkjava/src/main/java/App.java":
        "public class App {\n    public static void main(String[] args) {\n        port(8080);\n    }\n}\n",
    });
    const spring = await checked(root, { path: "spring", manifests: ["pom.xml"], languages: ["java"] });
    expect(spring.claim).toBe("runs");
    expect(spring.category).toBe("service");
    expect(spring.verified).toBe(true);
    expect(spring.entrypoint?.snippet).toContain("SpringApplication.run");
    const spark = await checked(root, { path: "sparkjava/sparkjava", manifests: ["pom.xml"], languages: ["java"] });
    expect(spark.claim).toBe("runs");
    expect(spark.category).toBe("service");
    expect(spark.verified).toBe(true);
    expect(spark.entrypoint?.snippet).toContain("port(8080)");
  });

  test("actix HttpServer::new inside fn main is a service", async () => {
    const root = repo({
      "backend/Cargo.toml": '[package]\nname = "backend"\nversion = "0.1.0"\n',
      "backend/src/main.rs":
        "use actix_web::{App, HttpServer};\n#[actix_web::main]\nasync fn main() -> std::io::Result<()> {\n    HttpServer::new(|| App::new()).bind(\"127.0.0.1:8000\")?.run().await\n}\n",
    });
    const claim = await checked(root, { path: "backend", manifests: ["Cargo.toml"], languages: ["rust"] });
    expect(claim.claim).toBe("runs");
    expect(claim.category).toBe("service");
    expect(claim.verified).toBe(true);
    expect(claim.entrypoint?.snippet).toContain("HttpServer::new");
  });

  test("hyper Server::bind and a pipe start inside fn main run", async () => {
    const root = repo({
      "wasmedge-mysql-nginx/backend/Cargo.toml": '[package]\nname = "backend"\nversion = "0.1.0"\n',
      "wasmedge-mysql-nginx/backend/src/main.rs":
        "async fn main() -> Result<(), Box<dyn std::error::Error>> {\n    let server = Server::bind(&addr).serve(make_svc);\n    server.await\n}\n",
      "wasmedge-kafka-mysql/etl/Cargo.toml": '[package]\nname = "etl"\nversion = "0.1.0"\n',
      "wasmedge-kafka-mysql/etl/src/main.rs":
        "async fn main() -> anyhow::Result<()> {\n    let mut pipe = Pipe::new(database_uri, kafka_uri).await;\n    pipe.start::<Order>().await?;\n    Ok(())\n}\n",
    });
    const backend = await checked(root, {
      path: "wasmedge-mysql-nginx/backend",
      manifests: ["Cargo.toml"],
      languages: ["rust"],
    });
    expect(backend.claim).toBe("runs");
    expect(backend.category).toBe("service");
    expect(backend.verified).toBe(true);
    expect(backend.entrypoint?.snippet).toContain("Server::bind");
    const etl = await checked(root, {
      path: "wasmedge-kafka-mysql/etl",
      manifests: ["Cargo.toml"],
      languages: ["rust"],
    });
    expect(etl.claim).toBe("runs");
    expect(etl.verified).toBe(true);
    expect(etl.entrypoint?.snippet).toContain("pipe.start");
  });
});
