import * as React from "react";
import { cn } from "@/lib/utils";

/* Card ------------------------------------------------------------------------------- */
export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]", className)} {...p} />;
}
export function CardHeader({ title, sub, action, className }: { title: React.ReactNode; sub?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start gap-3 px-5 pt-4 pb-3", className)}>
      <div className="min-w-0 flex-1">
        <h3 className="text-[15px] font-bold text-fg">{title}</h3>
        {sub && <p className="mt-0.5 text-[13px] text-fg-2">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

/* Badge ------------------------------------------------------------------------------ */
const badgeTone = {
  neutral: "bg-muted text-fg-2",
  coral: "bg-coral-soft text-coral-strong",
  blue: "bg-blue-soft text-blue",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning-strong",
  danger: "bg-danger-soft text-danger",
  ink: "bg-ink text-surface",
};
export function Badge({ tone = "neutral", className, ...p }: React.HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof badgeTone }) {
  return <span className={cn("inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[12px] font-semibold [&_svg]:size-3.5", badgeTone[tone], className)} {...p} />;
}

/* Input ------------------------------------------------------------------------------ */
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn("h-10 w-full rounded-[var(--radius)] border border-border bg-surface px-3 text-sm text-fg placeholder:text-fg-2 " +
    "focus:border-blue", className)} {...p} />
));
Input.displayName = "Input";

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid content-start gap-1.5">
      <span className="text-[13px] font-semibold text-fg">{label}</span>
      {children}
      {hint && <span className="text-[12px] text-fg-2">{hint}</span>}
    </label>
  );
}

/* Kbd -------------------------------------------------------------------------------- */
export const Kbd = ({ children }: { children: React.ReactNode }) => (
  <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1 font-sans text-[11px] font-semibold text-fg-2">{children}</kbd>
);

/* Skeleton / Empty ------------------------------------------------------------------- */
export const Skeleton = ({ className }: { className?: string }) => <div className={cn("animate-pulse rounded-[var(--radius)] bg-muted", className)} />;

export function EmptyState({ icon, title, body, action }: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <div className="mb-1 grid size-11 place-items-center rounded-full bg-muted text-fg-2 [&_svg]:size-5">{icon}</div>
      <p className="font-display text-[15px] font-bold text-fg">{title}</p>
      <p className="max-w-xs text-[13px] text-fg-2">{body}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/* Diet mark (Indian veg / non-veg / egg symbol) + a text label for screen readers --------- */
export function Diet({ diet, className }: { diet: "veg" | "nonveg" | "egg"; className?: string }) {
  const label = diet === "veg" ? "Vegetarian" : diet === "egg" ? "Contains egg" : "Non-vegetarian";
  const color = diet === "veg" ? "text-veg" : diet === "egg" ? "text-egg" : "text-nonveg";
  return (
    <span role="img" aria-label={label} title={label} className={cn("inline-grid size-[15px] shrink-0 place-items-center rounded-[3px] border-[1.6px] border-current", color, className)}>
      {diet === "nonveg"
        ? <span className="size-0 border-x-[4px] border-b-[7px] border-x-transparent border-b-current" />
        : <span className="size-[7px] rounded-full bg-current" />}
    </span>
  );
}

/* Segmented control ------------------------------------------------------------------- */
export function Segmented<T extends string>({ value, onChange, options, className, size = "md" }:
  { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode }[]; className?: string; size?: "md" | "lg" }) {
  return (
    <div role="radiogroup" className={cn("inline-flex rounded-[var(--radius)] border border-border bg-muted p-1", className)}>
      {options.map(o => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cn("rounded-[calc(var(--radius)-3px)] px-3 font-semibold text-fg-2 transition-colors", size === "lg" ? "h-10 text-sm" : "h-8 text-[13px]",
            value === o.value && "bg-surface text-fg shadow-[var(--shadow-sm)]")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* Switch (on / off) with its label; the word is read out, not just the colour ------------- */
export function Switch({ checked, onChange, label, disabled, className }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; className?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50", checked ? "bg-success" : "bg-border-strong", className)}>
      <span className={cn("inline-block size-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[22px]" : "translate-x-0.5")} />
    </button>
  );
}

/* Textarea matching Input --------------------------------------------------------------- */
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn("min-h-20 w-full rounded-[var(--radius)] border border-border bg-surface p-3 text-sm text-fg placeholder:text-fg-2 focus:border-blue", className)} {...p} />
));
Textarea.displayName = "Textarea";
