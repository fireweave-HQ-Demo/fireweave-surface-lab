import type { ReactNode } from "react";
import { Breadcrumbs, type Crumb } from "./Breadcrumbs";

export function Page({ wide, children }: { wide?: boolean; children: ReactNode }) {
  return <div className={wide ? "stage-wide" : "stage-inner"}>{children}</div>;
}

export function PageHeader({
  crumbs,
  title,
  subtitle,
  actions,
}: {
  crumbs?: Crumb[];
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div>
        {crumbs?.length ? <Breadcrumbs items={crumbs} /> : null}
        <h1>{title}</h1>
        {subtitle ? <div className="page-sub">{subtitle}</div> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}
