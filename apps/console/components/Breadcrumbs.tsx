import Link from "next/link";

export type Crumb = { href?: string; label: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      {items.map((item, index) => {
        const last = index === items.length - 1;
        return (
          <span key={`${item.label}-${index}`}>
            {index > 0 ? <span aria-hidden="true"> / </span> : null}
            {last || !item.href ? (
              <span className="here">{item.label}</span>
            ) : (
              <Link href={item.href}>{item.label}</Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
