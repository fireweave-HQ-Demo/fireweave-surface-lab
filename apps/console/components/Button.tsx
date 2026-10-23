"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-ghost" | "outline";
export type ButtonSize = "sm" | "md" | "lg";

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", extra = "") {
  return ["btn", `btn-${variant}`, `btn-${size}`, extra].filter(Boolean).join(" ");
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  leftIcon,
  rightIcon,
  className,
  disabled,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const busy = Boolean(loading || disabled);
  return (
    <button
      type={type}
      className={buttonClass(variant, size, className)}
      disabled={busy}
      aria-disabled={busy || undefined}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className={`spin${size === "sm" ? " sm" : ""}`} aria-hidden="true" /> : leftIcon}
      {loading ? null : children}
      {loading ? null : rightIcon}
    </button>
  );
}

type IconButtonProps = Omit<ButtonProps, "leftIcon" | "rightIcon" | "children"> & {
  "aria-label": string;
  children: ReactNode;
};

export function IconButton({ children, size = "sm", className, ...rest }: IconButtonProps) {
  return (
    <Button size={size} className={["btn-icon", className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </Button>
  );
}
