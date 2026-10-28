"use client";

import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { AlertIcon, CheckIcon } from "../icons";

type ButtonKind = "primary" | "secondary" | "danger" | "ghost";

const BUTTON_STYLES: Record<ButtonKind, string> = {
  primary:
    "bg-brand-600 text-on-accent font-semibold hover:bg-brand-700 border border-transparent",
  secondary:
    "border border-line bg-surface text-ink-2 hover:bg-surface-2",
  danger: "bg-red-600 text-white font-semibold hover:bg-red-700 border border-transparent",
  ghost:
    "border border-transparent text-ink-2 hover:bg-surface-2 hover:text-ink",
};

export function Button({
  kind = "secondary",
  size = "md",
  loading = false,
  icon,
  children,
  className = "",
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  kind?: ButtonKind;
  size?: "sm" | "md";
  loading?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-60 ${
        size === "sm" ? "px-2.5 py-1 text-[13px]" : "px-3.5 py-2 text-sm"
      } ${BUTTON_STYLES[kind]} ${className}`}
      {...props}
    >
      {loading ? (
        <span className="size-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current" aria-hidden="true" />
      ) : (
        icon
      )}
      {children}
    </button>
  );
}

export const inputClass =
  "block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm transition placeholder:text-muted focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15 disabled:opacity-60";

export function Field({
  label,
  hint,
  htmlFor,
  children,
  className = "",
}: {
  label: ReactNode;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition disabled:opacity-50 ${
        checked ? "bg-brand-600" : "bg-line"
      }`}
    >
      <span
        className={`inline-block size-4 rounded-full shadow transition-transform ${checked ? "bg-on-accent" : "bg-ink-2"} ${checked ? "translate-x-4.5" : "translate-x-0.5"}`}
      />
    </button>
  );
}

type AlertKind = "error" | "warning" | "info" | "success";
const ALERT_STYLES: Record<AlertKind, string> = {
  error: "border-red-400/40 bg-red-500/10 text-red-800",
  warning: "border-amber-400/40 bg-amber-500/10 text-amber-900",
  info: "border-sky-200 bg-sky-50 text-sky-900",
  success: "border-emerald-400/40 bg-emerald-500/10 text-emerald-900",
};

export function Alert({ kind = "info", children }: { kind?: AlertKind; children: ReactNode }) {
  return (
    <div
      role={kind === "error" ? "alert" : undefined}
      className={`flex gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm ${ALERT_STYLES[kind]}`}
    >
      {kind === "success" ? (
        <CheckIcon className="mt-0.5 size-4 shrink-0" />
      ) : (
        <AlertIcon className="mt-0.5 size-4 shrink-0" />
      )}
      <div className="min-w-0 flex-1 break-words [&_code]:rounded [&_code]:bg-black/5 [&_code]:px-1">
        {children}
      </div>
    </div>
  );
}

type BadgeColor = "slate" | "green" | "red" | "brand" | "amber";
const BADGE_STYLES: Record<BadgeColor, string> = {
  slate: "bg-surface-2 text-ink-2",
  green: "bg-emerald-500/15 text-emerald-700",
  red: "bg-red-500/15 text-red-700",
  brand: "bg-brand-100 text-brand-800",
  amber: "bg-amber-500/15 text-amber-900",
};

export function Badge({ color = "slate", children }: { color?: BadgeColor; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${BADGE_STYLES[color]}`}>
      {children}
    </span>
  );
}

export function Card({
  title,
  subtitle,
  actions,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-surface">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 className="font-display text-xl">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

/** Accessible modal dialog: focus is moved inside, Escape closes, the page behind is inert. */
export function Modal({
  title,
  onClose,
  children,
  footer,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={`m-auto max-h-[92dvh] w-[calc(100%-2rem)] overflow-hidden rounded-lg border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-bg/50 backdrop:backdrop-blur-sm ${
        wide ? "max-w-2xl" : "max-w-md"
      }`}
    >
      <div className="flex max-h-[92dvh] flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 id={titleId} className="text-base font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3.5">
            {footer}
          </footer>
        )}
      </div>
    </dialog>
  );
}

export function formatAgo(ts: number | null): string {
  if (!ts) return "Never";
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function formatMs(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}
