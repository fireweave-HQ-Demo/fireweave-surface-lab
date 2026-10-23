import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { schema } from "@clinic/db";
import { env } from "./env";

const queryClient = postgres(env.databaseUrl, { max: 10 });
export const db = drizzle(queryClient, { schema });

export async function withClinic<T>(clinicId: string, fn: (tx: typeof db) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.clinic_id', ${clinicId}, true)`);
    return fn(tx as unknown as typeof db);
  });
}
