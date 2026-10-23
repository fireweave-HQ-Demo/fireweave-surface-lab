"use client";

import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { IconButton } from "./Button";

export function Drawer({
  title,
  extra,
  children,
  footer,
  narrow,
  onClose,
}: {
  title: string;
  extra?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  narrow?: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="overlay" onClick={onClose} />
      <aside className={`drawer${narrow ? " narrow" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <div>
            <h2>{title}</h2>
            {extra}
          </div>
          <IconButton variant="ghost" aria-label="Close" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </header>
        <div className="body">{children}</div>
        {footer ? <div className="sticky-actions">{footer}</div> : null}
      </aside>
    </>
  );
}
