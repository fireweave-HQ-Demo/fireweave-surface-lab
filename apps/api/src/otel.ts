import { trace } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchSpanProcessor, NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { env } from "./env";

const tracer = trace.getTracer("clinic-api");
let provider: NodeTracerProvider | null = null;

export async function startTelemetry() {
  if (!env.otlpEndpoint) return;
  provider = new NodeTracerProvider({
    resource: resourceFromAttributes({ "service.name": "clinic-api" }),
    spanProcessors: [
      new BatchSpanProcessor(new OTLPTraceExporter({ url: `${env.otlpEndpoint}/v1/traces` }), {
        scheduledDelayMillis: 200,
      }),
    ],
  });
  provider.register();
}

export async function recordSpan(name: string, attributes: Record<string, string>) {
  const span = tracer.startSpan(name);
  for (const [key, value] of Object.entries(attributes)) span.setAttribute(key, value);
  span.end();
  if (provider) await provider.forceFlush();
}
