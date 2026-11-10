"use client";
import * as React from "react";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Centered dialog (confirmations, payments). Focus is trapped and Esc closes. */
export function Dialog({ open, onOpenChange, title, description, children, className }:
  { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-[rgba(15,18,24,.45)] data-[state=open]:animate-[fade_.15s]" />
        <D.Content className={cn("fixed left-1/2 top-1/2 z-50 w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 " +
          "max-h-[calc(100dvh-32px)] overflow-auto rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-[var(--shadow)]", className)}>
          <div className="mb-4 flex items-start gap-3">
            <div className="flex-1">
              <D.Title className="font-display text-lg font-bold text-fg">{title}</D.Title>
              {description ? <D.Description className="mt-1 text-[13px] text-fg-2">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
            </div>
            <D.Close className="grid size-8 place-items-center rounded-[var(--radius-sm)] text-fg-2 hover:bg-muted" aria-label="Close"><X className="size-4" /></D.Close>
          </div>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** Side sheet (table details, order details). Right on desktop, bottom on phones. */
export function Sheet({ open, onOpenChange, title, description, children }:
  { open: boolean; onOpenChange: (o: boolean) => void; title: React.ReactNode; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-[rgba(15,18,24,.4)]" />
        <D.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-auto rounded-t-[18px] border border-border bg-surface p-5 shadow-[var(--shadow)]
          sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[440px] sm:rounded-none sm:rounded-l-[18px]">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border sm:hidden" />
          <div className="mb-4 flex items-start gap-3">
            <div className="flex-1">
              <D.Title className="font-display text-xl font-extrabold text-fg">{title}</D.Title>
              {description ? <D.Description className="mt-1 text-[13px] text-fg-2">{description}</D.Description> : <D.Description className="sr-only">Details</D.Description>}
            </div>
            <D.Close className="grid size-9 place-items-center rounded-[var(--radius)] border border-border text-fg-2 hover:bg-muted" aria-label="Close"><X className="size-4" /></D.Close>
          </div>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/* Toasts: tiny store, announced to screen readers ------------------------------------- */
type Toast = { id: number; text: string; tone: "ok" | "error" | "info" };
const listeners = new Set<(t: Toast[]) => void>();
let toasts: Toast[] = [];
export function toast(text: string, tone: Toast["tone"] = "ok") {
  const t = { id: Date.now() + Math.random(), text, tone };
  toasts = [...toasts, t]; listeners.forEach(l => l(toasts));
  setTimeout(() => { toasts = toasts.filter(x => x.id !== t.id); listeners.forEach(l => l(toasts)); }, 3200);
}
export function Toaster() {
  const [list, setList] = React.useState<Toast[]>([]);
  React.useEffect(() => { listeners.add(setList); return () => { listeners.delete(setList); }; }, []);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4">
      {list.map(t => (
        <div key={t.id} className={cn("pointer-events-auto rounded-[var(--radius)] px-4 py-2.5 text-sm font-semibold shadow-[var(--shadow)]",
          t.tone === "error" ? "bg-danger text-white" : t.tone === "info" ? "bg-blue text-white" : "bg-ink text-surface")}>{t.text}</div>
      ))}
    </div>
  );
}
