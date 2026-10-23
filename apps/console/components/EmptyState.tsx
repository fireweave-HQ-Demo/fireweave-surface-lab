import type { ReactNode } from "react";

export function EmptyState({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <p>{title}</p>
      {action}
    </div>
  );
}
