import { fileURLToPath } from "node:url";
import { NativeConnection, Worker } from "@temporalio/worker";
import {
  loadPdf,
  markCompleted,
  markFailed,
  persistExtraction,
  recordActivity,
  recordAppointment,
  recordCall,
  reserveSlot,
} from "./activities";
import { env } from "./env";
import { migrate } from "./migrate";
import { retry } from "./wait";

await retry("postgres", () => migrate());
const connection = await retry("temporal", () => NativeConnection.connect({ address: env.temporalAddress }));
const worker = await Worker.create({
  connection,
  workflowsPath: fileURLToPath(new URL("./workflows.js", import.meta.url)),
  activities: {
    loadPdf,
    persistExtraction,
    reserveSlot,
    recordAppointment,
    recordCall,
    recordActivity,
    markCompleted,
    markFailed,
  },
  taskQueue: "clinic-ts",
});
await worker.run();
