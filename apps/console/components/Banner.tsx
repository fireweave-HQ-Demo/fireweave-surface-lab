import type { ReactNode } from "react";

export function Banner({
  tone = "warn",
  sticky,
  children,
}: {
  tone?: "warn" | "error" | "ok" | "info";
  sticky?: boolean;
  children: ReactNode;
}) {
  const extra = tone === "warn" ? "" : tone;
  return <div className={`banner ${extra}${sticky ? " sticky" : ""}`}>{children}</div>;
}
