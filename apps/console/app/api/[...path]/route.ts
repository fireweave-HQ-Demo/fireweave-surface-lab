const hop = new Set(["connection", "keep-alive", "transfer-encoding", "host", "content-length"]);

async function proxy(request: Request, path: string[]) {
  const incoming = new URL(request.url);
  const target = `${process.env.API_INTERNAL_URL ?? "http://localhost:4000"}/api/${path.join("/")}${incoming.search}`;
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!hop.has(key.toLowerCase())) headers.set(key, value);
  });
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
  const response = await fetch(target, { method: request.method, headers, body, redirect: "manual" });
  const outgoing = new Headers();
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "set-cookie") outgoing.set(key, value);
  });
  for (const cookie of response.headers.getSetCookie()) outgoing.append("set-cookie", cookie);
  return new Response(response.body, { status: response.status, headers: outgoing });
}

type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, context: Context) {
  return proxy(request, (await context.params).path);
}
export async function POST(request: Request, context: Context) {
  return proxy(request, (await context.params).path);
}
export async function DELETE(request: Request, context: Context) {
  return proxy(request, (await context.params).path);
}
export async function PUT(request: Request, context: Context) {
  return proxy(request, (await context.params).path);
}
