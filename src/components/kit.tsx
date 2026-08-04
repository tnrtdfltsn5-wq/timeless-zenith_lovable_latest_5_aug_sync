import { type ReactNode, useEffect, useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function useHydrated() {
  const [h, setH] = useState(false);
  useEffect(() => setH(true), []);
  return h;
}

export function Card({
  children,
  className,
  glow,
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <div
      className={cn(
        "surface-card rise p-4 transition-shadow duration-300",
        glow && "glow-ring",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
      <h2 className="truncate text-base font-bold">{children}</h2>
      {right}
    </div>
  );
}

export function Progress({
  value,
  className,
  tone = "primary",
}: {
  value: number;
  className?: string;
  tone?: "primary" | "success" | "warning";
}) {
  const v = Math.max(0, Math.min(100, value || 0));
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-secondary", className)}>
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500 ease-out",
          tone === "primary" && "gradient-fill",
          tone === "success" && "bg-success",
          tone === "warning" && "bg-warning",
        )}
        style={{ width: `${v}%` }}
      />
    </div>
  );
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "success" | "danger" | "warning" | "outline";
  size?: "sm" | "md" | "lg";
};

export function Btn({ variant = "primary", size = "md", className, ...props }: BtnProps) {
  return (
    <button
      {...props}
      className={cn(
        "press inline-flex items-center justify-center gap-2 rounded-xl font-semibold disabled:pointer-events-none disabled:opacity-40",
        size === "sm" && "px-3 py-1.5 text-xs",
        size === "md" && "px-4 py-2.5 text-sm",
        size === "lg" && "px-5 py-3.5 text-base",
        variant === "primary" && "gradient-fill text-primary-foreground shadow-[var(--shadow-soft)]",
        variant === "ghost" && "bg-secondary text-secondary-foreground hover:bg-accent",
        variant === "outline" && "border border-border bg-transparent hover:bg-secondary",
        variant === "success" && "bg-success text-success-foreground",
        variant === "danger" && "bg-destructive text-destructive-foreground",
        variant === "warning" && "bg-warning text-warning-foreground",
        className,
      )}
    />
  );
}

export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-input bg-surface-2 px-3 py-2.5 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/25";

export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "primary" | "success";
}) {
  return (
    <div className="surface-card p-3">
      <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 font-display text-xl font-extrabold",
          tone === "primary" && "gradient-text",
          tone === "success" && "text-success",
        )}
      >
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

export function Pill({
  active,
  children,
  onClick,
  className,
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "press rounded-full px-3 py-1.5 text-xs font-semibold",
        active
          ? "gradient-fill text-primary-foreground"
          : "bg-secondary text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/40 p-3 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="rise max-h-[80vh] w-full max-w-md overflow-y-auto rounded-3xl border border-border bg-popover p-5 shadow-[var(--shadow-soft)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-lg font-extrabold">{title}</h3>
        {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

/**
 * Number field that behaves properly on mobile: you can clear it completely,
 * type a new value (including 0 or a negative one when allowed) and it only
 * commits a valid number back to the store.
 */
export function NumInput({
  value,
  onChange,
  min,
  max,
  step,
  allowNegative,
  placeholder,
  className,
  suffix,
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  allowNegative?: boolean;
  placeholder?: string;
  className?: string;
  suffix?: string;
}) {
  const [text, setText] = useState(value === null || value === undefined ? "" : String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (focused) return;
    setText(value === null || value === undefined ? "" : String(value));
  }, [value, focused]);

  function commit(raw: string) {
    const t = raw.trim();
    if (t === "" || t === "-" || t === "." || t === "-.") {
      onChange(null);
      return;
    }
    let n = Number(t);
    if (!Number.isFinite(n)) return;
    if (!allowNegative && n < 0) n = Math.abs(n);
    if (min !== undefined && n < min) n = min;
    if (max !== undefined && n > max) n = max;
    onChange(n);
  }

  return (
    <span className="relative block">
      <input
        type="text"
        inputMode={allowNegative ? "text" : "decimal"}
        value={text}
        placeholder={placeholder}
        onFocus={(e) => {
          setFocused(true);
          e.currentTarget.select();
        }}
        onBlur={(e) => {
          setFocused(false);
          commit(e.currentTarget.value);
          const t = e.currentTarget.value.trim();
          setText(t === "" ? "" : String(Number(t) || 0));
        }}
        onChange={(e) => {
          const v = e.target.value;
          if (!/^-?\d*\.?\d*$/.test(v)) return;
          setText(v);
          commit(v);
        }}
        step={step}
        className={cn(inputClass, "text-foreground", suffix && "pr-9", className)}
      />
      {suffix ? (
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[11px] font-semibold text-muted-foreground">
          {suffix}
        </span>
      ) : null}
    </span>
  );
}

/** Date picker that always *displays* dd/mm/yyyy while using the native picker. */
export function DateInput({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const hydratedNow = useHydrated();
  const label = (() => {
    if (!value) return "—";
    const [y, m, d] = value.split("-");
    return `${d}/${m}/${y}`;
  })();
  return (
    <span className={cn("relative inline-flex items-center", className)}>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full opacity-0"
        aria-label="Pick a date"
      />
      <span className="pointer-events-none inline-flex w-full items-center justify-between gap-2 rounded-xl border border-input bg-surface-2 px-3 py-2 text-sm font-semibold">
        <span className="tabular-nums">{hydratedNow ? label : "—"}</span>
        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
      </span>
    </span>
  );
}
