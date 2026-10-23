"use client";

import { Calendar, FileCheck, Inbox, LayoutDashboard, Mic, Settings, Sliders } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCounts } from "../lib/counts";
import { Button } from "./Button";

type Props = {
  clinicName: string;
  userName: string;
  role: string;
};

const today: Array<{ href: string; label: string; icon: LucideIcon; badge?: "inbox" | "pa" }> = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inbox", label: "Inbox", icon: Inbox, badge: "inbox" },
  { href: "/schedule", label: "Schedule", icon: Calendar },
  { href: "/auth", label: "Prior auth", icon: FileCheck, badge: "pa" },
  { href: "/scribe", label: "Scribe", icon: Mic },
];

const setup: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/rules", label: "Rules", icon: Sliders },
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavItem({
  href,
  label,
  icon: Icon,
  current,
  badge,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  current: boolean;
  badge?: number;
}) {
  return (
    <Link href={href} className="nav-item" aria-current={current ? "page" : undefined}>
      <Icon className="nav-icon" size={16} aria-hidden="true" />
      <span>{label}</span>
      {badge ? <span className="badge">{badge}</span> : null}
    </Link>
  );
}

export function Sidebar({ clinicName, userName, role }: Props) {
  const path = usePathname();
  const { counts } = useCounts();
  const active = (href: string) => path === href || path.startsWith(`${href}/`) || (href === "/auth" && path.startsWith("/prior-auth"));

  async function signOut() {
    await fetch("/api/auth/sign-out", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand">Clinic OS</div>
        {clinicName ? <div className="sidebar-clinic">{clinicName}</div> : null}
        <div className="sidebar-user">
          {role || "Staff"}
          {userName ? ` · ${userName}` : ""}
        </div>
      </div>
      <div className="nav-section">
        <div className="nav-label">Today</div>
        {today.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            current={active(item.href)}
            badge={item.badge === "inbox" ? counts.inbox : item.badge === "pa" ? counts.priorAuth : undefined}
          />
        ))}
      </div>
      <div className="nav-section setup">
        <div className="nav-label">Setup</div>
        {setup.map((item) => (
          <NavItem key={item.href} href={item.href} label={item.label} icon={item.icon} current={active(item.href)} />
        ))}
      </div>
      <div className="sidebar-foot">
        <Link className="btn btn-ghost btn-sm" href="/help">
          Help
        </Link>
        <Button variant="ghost" size="sm" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </aside>
  );
}
