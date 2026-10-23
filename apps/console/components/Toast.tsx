"use client";

import { X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { IconButton } from "./Button";

export type ToastItem = {
  id: string;
  tone: "ok" | "error";
  title: string;
  code?: string;
};

type ToastApi = {
  push: (item: Omit<ToastItem, "id">) => void;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastApi>({
  push: () => undefined,
  dismiss: () => undefined,
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const push = useCallback(
    (item: Omit<ToastItem, "id">) => {
      const id = crypto.randomUUID();
      setItems((current) => [...current, { ...item, id }].slice(-4));
      if (item.tone === "ok") window.setTimeout(() => dismiss(id), 4000);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastStack items={items} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function ToastStack({ items, onDismiss }: { items: ToastItem[]; onDismiss: (id: string) => void }) {
  return (
    <div className="toast-stack" aria-live="polite">
      {items.map((item) => (
        <Toast key={item.id} item={item} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: (id: string) => void }) {
  return (
    <div className={`toast ${item.tone}`} role={item.tone === "error" ? "alert" : "status"}>
      <div className="toast-top">
        <div>
          <div>{item.title}</div>
          {item.code ? (
            <button className="code" type="button" onClick={() => void navigator.clipboard.writeText(item.code ?? "")}>
              {item.code}
            </button>
          ) : null}
        </div>
        {item.tone === "error" ? (
          <IconButton variant="ghost" aria-label="Dismiss" onClick={() => onDismiss(item.id)}>
            <X size={14} />
          </IconButton>
        ) : null}
      </div>
      {item.tone === "ok" ? <div className="bar" /> : null}
    </div>
  );
}
