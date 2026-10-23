import { Connection, Client } from "@temporalio/client";
import { env } from "./env";

let client: Client | null = null;

export async function temporal(): Promise<Client> {
  if (client) return client;
  const connection = await Connection.connect({ address: env.temporalAddress });
  client = new Client({ connection });
  return client;
}

export async function signalReview(input: {
  workflowId: string;
  clinicId: string;
  referralId: string;
  sandboxUrl: string;
  payload: { action: string; token?: string };
}) {
  const client = await temporal();
  try {
    await client.workflow.getHandle(input.workflowId).signal("review", input.payload);
    return;
  } catch (error) {
    const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
    if (name !== "WorkflowNotFoundError") throw error;
    if (input.payload.action !== "approve") return;
  }
  try {
    await client.workflow.start("ReferralWriteFlow", {
      taskQueue: "clinic-ts",
      workflowId: `${input.workflowId}-write`,
      args: [
        {
          referralId: input.referralId,
          clinicId: input.clinicId,
          sandboxUrl: input.sandboxUrl,
          token: input.payload.token,
        },
      ],
    });
  } catch (error) {
    const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
    if (name !== "WorkflowExecutionAlreadyStartedError") throw error;
  }
}
