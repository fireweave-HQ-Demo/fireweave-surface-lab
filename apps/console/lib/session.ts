import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const API = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

export type ShellSession = {
  userName: string;
  role: string;
  clinicName: string;
};

function titleCaseRole(role: string) {
  if (!role) return "Staff";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

async function apiGet(path: string, cookie: string) {
  return fetch(`${API}${path}`, {
    headers: { cookie },
    cache: "no-store",
  });
}

export async function loadShellSession(): Promise<ShellSession> {
  const store = await cookies();
  const cookie = store
    .getAll()
    .map((item) => `${item.name}=${item.value}`)
    .join("; ");
  const [sessionRes, meRes, orgsRes] = await Promise.all([
    apiGet("/api/auth/get-session", cookie),
    apiGet("/api/me", cookie),
    apiGet("/api/auth/organization/list", cookie),
  ]);
  if (!sessionRes.ok) redirect("/login");
  const session = (await sessionRes.json().catch(() => null)) as { user?: { name?: string; email?: string } } | null;
  if (!session?.user) redirect("/login");
  const me = meRes.ok ? ((await meRes.json()) as { role?: string }) : {};
  const list = orgsRes.ok
    ? ((await orgsRes.json().catch(() => null)) as { name?: string }[] | { organizations?: { name?: string }[] } | null)
    : null;
  const rows = Array.isArray(list) ? list : list?.organizations ?? [];
  return {
    userName: session.user.name ?? "",
    role: titleCaseRole(me.role ?? "Staff"),
    clinicName: rows[0]?.name ?? "",
  };
}
