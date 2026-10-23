import type { ReactNode } from "react";
import { Sidebar } from "../../components/Sidebar";
import { loadShellSession } from "../../lib/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await loadShellSession();
  return (
    <div className="app">
      <Sidebar clinicName={session.clinicName} userName={session.userName} role={session.role} />
      <main className="stage">{children}</main>
    </div>
  );
}
