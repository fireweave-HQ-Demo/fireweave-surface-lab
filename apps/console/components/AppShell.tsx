"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useCounts } from "../lib/counts";
import { TickProvider } from "../lib/tick";
import { Sidebar } from "./Sidebar";
import { ToastProvider } from "./Toast";

type SessionUser = { name?: string; email?: string };

function titleCaseRole(role: string) {
  if (!role) return "Staff";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { counts } = useCounts();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [clinicName, setClinicName] = useState("");
  const [role, setRole] = useState("Staff");

  useEffect(() => {
    if (path === "/login" || path === "/signup") return;
    let stop = false;
    void (async () => {
      const res = await fetch("/api/auth/get-session");
      if (!res.ok) {
        window.location.href = "/login";
        return;
      }
      const body = (await res.json().catch(() => null)) as { user?: SessionUser } | null;
      if (!body?.user) {
        window.location.href = "/login";
        return;
      }
      if (!stop) setUser(body.user);
      const me = await fetch("/api/me");
      if (me.ok) {
        const staff = (await me.json()) as { role?: string };
        if (!stop && staff.role) setRole(titleCaseRole(staff.role));
      }
      const orgs = await fetch("/api/auth/organization/list");
      if (orgs.ok) {
        const list = (await orgs.json().catch(() => null)) as { name?: string }[] | { organizations?: { name?: string }[] } | null;
        const rows = Array.isArray(list) ? list : list?.organizations ?? [];
        const name = rows[0]?.name ?? "";
        if (!stop && name) setClinicName(name);
      }
    })();
    return () => {
      stop = true;
    };
  }, [path]);

  async function signOut() {
    await fetch("/api/auth/sign-out", { method: "POST" });
    window.location.href = "/login";
  }

  if (path === "/login" || path === "/signup") {
    return (
      <TickProvider>
        <ToastProvider>{children}</ToastProvider>
      </TickProvider>
    );
  }

  return (
    <TickProvider>
    <ToastProvider>
      <div className="app">
        <Sidebar
          path={path}
          inboxCount={counts.inbox}
          paCount={counts.priorAuth}
          clinicName={clinicName}
          userName={user?.name ?? ""}
          role={role}
          onSignOut={() => void signOut()}
        />
        <main className="stage">{children}</main>
      </div>
    </ToastProvider>
    </TickProvider>
  );
}
