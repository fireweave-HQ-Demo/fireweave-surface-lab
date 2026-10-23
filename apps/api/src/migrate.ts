import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { env } from "./env";

export async function migrate() {
  const admin = postgres(env.databaseUrlAdmin, { max: 1, onnotice: () => undefined });
  const directory = path.dirname(fileURLToPath(new URL("../../../packages/db/migrations/0001_init.sql", import.meta.url)));
  const files = readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const name of files) {
    await admin.unsafe(readFileSync(path.join(directory, name), "utf8"));
  }
  await admin.end();
}
