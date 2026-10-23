import { readFileSync } from "node:fs";
import path from "node:path";

function loadEnv() {
  const raw = readFileSync(path.resolve(".env"), "utf8");
  const values: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const cut = trimmed.indexOf("=");
    if (cut === -1) continue;
    values[trimmed.slice(0, cut)] = trimmed.slice(cut + 1);
  }
  return values;
}

const file = loadEnv();

export const observe = {
  endpoint: file.OO_QUERY_ENDPOINT || file.OO_OTLP_ENDPOINT,
  authorization: file.OO_AUTHORIZATION,
  stream: file.OO_STREAM || "clinic",
};

export async function latestTraces(minutes = 15) {
  const end = Date.now() * 1000;
  const start = end - minutes * 60 * 1_000_000;
  const url = `${observe.endpoint}/${observe.stream}/traces/latest?start_time=${start}&end_time=${end}&from=0&size=50`;
  const res = await fetch(url, { headers: { authorization: observe.authorization } });
  if (!res.ok) throw new Error(`openobserve ${res.status}`);
  return (await res.json()) as { hits?: Array<Record<string, unknown>> };
}

export async function searchTraces(sql: string, minutes = 15) {
  const end = Date.now() * 1000;
  const start = end - minutes * 60 * 1_000_000;
  const res = await fetch(`${observe.endpoint}/_search?type=traces`, {
    method: "POST",
    headers: { authorization: observe.authorization, "content-type": "application/json" },
    body: JSON.stringify({
      query: { sql, start_time: start, end_time: end, from: 0, size: 25 },
    }),
  });
  if (!res.ok) throw new Error(`openobserve search ${res.status} ${await res.text()}`);
  return (await res.json()) as { hits?: Array<Record<string, unknown>> };
}

export async function plantSpan(name: string, attributes: Record<string, string>) {
  const now = BigInt(Date.now()) * 1_000_000n;
  const payload = {
    resourceSpans: [
      {
        resource: { attributes: [{ key: "service.name", value: { stringValue: "clinic-api" } }] },
        scopeSpans: [
          {
            scope: { name: "clinic-e2e" },
            spans: [
              {
                traceId: crypto.randomUUID().replaceAll("-", ""),
                spanId: crypto.randomUUID().replaceAll("-", "").slice(0, 16),
                name,
                kind: 1,
                startTimeUnixNano: now.toString(),
                endTimeUnixNano: (now + 1_000_000n).toString(),
                attributes: Object.entries(attributes).map(([key, value]) => ({
                  key,
                  value: { stringValue: value },
                })),
              },
            ],
          },
        ],
      },
    ],
  };
  const res = await fetch("http://127.0.0.1:4318/v1/traces", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`collector ${res.status}`);
}

export async function waitForTrace(
  match: (hit: Record<string, unknown>) => boolean,
  sql?: string,
  timeout = 45_000,
) {
  const deadline = Date.now() + timeout;
  let last: Record<string, unknown>[] = [];
  while (Date.now() < deadline) {
    const latest = await latestTraces(30).catch(() => ({ hits: [] }));
    const search = sql ? await searchTraces(sql).catch(() => ({ hits: [] })) : { hits: [] };
    last = [...(search.hits ?? []), ...(latest.hits ?? [])];
    if (last.some(match)) return last;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`trace not in OpenObserve: ${JSON.stringify(last).slice(0, 400)}`);
}
