import { Connection, Client } from "@temporalio/client";
import { env } from "./env";

let client: Client | null = null;

export async function temporal(): Promise<Client> {
  if (client) return client;
  const connection = await Connection.connect({ address: env.temporalAddress });
  client = new Client({ connection });
  return client;
}

export async function signalReview(workflowId: string, payload: { action: string; token?: string }) {
  const handle = (await temporal()).workflow.getHandle(workflowId);
  await handle.signal("review", payload);
}
