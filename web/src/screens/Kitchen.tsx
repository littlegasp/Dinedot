"use client";
import * as React from "react";
import { AlertTriangle, Clock, Undo2, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Diet, Skeleton } from "@/components/ui/primitives";
import { TicketStatus } from "@/components/ui/status";
import { rpc } from "@/lib/api";
import { minutesSince, useAction, useStaff } from "@/lib/staff";
import type { Order } from "@/lib/types";
import { cn } from "@/lib/utils";

const TARGET = 15;   // minutes per ticket before it shows as late
const NEXT = { new: "cooking", cooking: "ready", ready: "served" } as const;
const BACK = { cooking: "new", ready: "cooking" } as const;
const ACTION = { new: "Start cooking", cooking: "Mark ready", ready: "Picked up" } as const;
type Col = keyof typeof NEXT;

/** Kitchen display: always dark (no glare on a wall screen), big type, big buttons. */
export function KitchenScreen() {
  const { live } = useStaff();
  const { run, pending } = useAction();
  const [, tick] = React.useState(0);
  React.useEffect(() => { const t = setInterval(() => tick(n => n + 1), 20_000); return () => clearInterval(t); }, []);

  const tickets = (live?.visits ?? []).flatMap(v => v.orders.filter(o => o.status in NEXT).map(o => ({ o, table: live!.tables.find(t => t.id === v.table_id)?.code ?? "" })))
    .sort((a, b) => a.o.created_at.localeCompare(b.o.created_at));
  const step = (o: Order, to: string) => run(() => rpc("staff_order_status", { p_order: o.id, p_status: to }));

  return (
    <div className="theme-dark min-h-[calc(100dvh-64px)] bg-background px-4 py-5 text-fg lg:px-8">
      <div className="mb-5">
        <h1 className="text-[26px] font-extrabold text-fg">Kitchen</h1>
        <p className="text-sm text-fg-2">Oldest first · late after {TARGET} min · updates by itself</p>
      </div>
      {!live ? <div className="grid gap-4 md:grid-cols-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-64 opacity-30" />)}</div> : (
        <div className="grid gap-4 md:grid-cols-3">
          {(["new", "cooking", "ready"] as Col[]).map(col => {
            const list = tickets.filter(t => t.o.status === col);
            return (
              <section key={col} aria-label={col} className="grid content-start gap-3">
                <div className="flex items-center gap-2"><TicketStatus status={col} /><span className="num text-sm font-semibold text-fg-2">{list.length}</span></div>
                {list.map(({ o, table }) => {
                  const mins = minutesSince(o.created_at);
                  const late = mins >= TARGET && col !== "ready";
                  const warn = !late && mins >= TARGET * 0.7 && col !== "ready";
                  return (
                    <article key={o.id} className={cn("overflow-hidden rounded-[var(--radius-lg)] border bg-surface", late ? "border-danger" : warn ? "border-warning" : "border-border")}>
                      <header className={cn("flex items-center gap-2 px-4 py-3", late ? "bg-danger-soft" : warn ? "bg-warning-soft" : "bg-muted")}>
                        <span className="font-display text-2xl font-extrabold text-fg">{table}</span>
                        <Badge tone="neutral">{o.source === "guest" ? "QR" : "Staff"}</Badge>
                        <span className={cn("num ml-auto flex items-center gap-1 text-sm font-bold", late ? "text-danger" : warn ? "text-warning" : "text-fg-2")}>
                          {late ? <AlertTriangle className="size-4" aria-hidden /> : <Clock className="size-4" aria-hidden />}{mins} min{late && " · late"}
                        </span>
                      </header>
                      <ul className="px-4 py-2">
                        {o.items.map((it, i) => (
                          <li key={i} className="flex items-start gap-3 py-1.5">
                            <span className="num w-8 shrink-0 font-display text-xl font-extrabold text-fg">{it.qty}×</span>
                            <span className="flex-1 text-[17px] font-semibold leading-snug text-fg">
                              <span className="inline-flex items-center gap-1.5"><Diet diet={it.diet} />{it.name}</span>
                              {(it.size || it.addons.length > 0 || it.note) && (
                                <span className="block text-[13px] font-medium text-coral-strong">{[it.size, ...it.addons, it.note].filter(Boolean).join(" · ")}</span>)}
                            </span>
                          </li>
                        ))}
                      </ul>
                      {o.note && <p className="mx-4 mb-3 flex items-center gap-2 rounded-[var(--radius-sm)] bg-warning-soft px-3 py-2 text-[13px] font-bold text-warning"><AlertTriangle className="size-4 shrink-0" aria-hidden />{o.note}</p>}
                      <footer className="flex items-center gap-2 border-t border-border p-3">
                        <span className="num text-[12px] text-fg-2">#{o.no}</span>
                        {col !== "new" && <Button size="icon" variant="ghost" aria-label="Move back a step" className="ml-auto" disabled={pending} onClick={() => step(o, BACK[col as "cooking" | "ready"])}><Undo2 /></Button>}
                        <Button size="lg" variant={col === "ready" ? "success" : "primary"} disabled={pending} className={cn("min-w-[150px]", col === "new" && "ml-auto")} onClick={() => step(o, NEXT[col])}>{ACTION[col]}</Button>
                      </footer>
                    </article>
                  );
                })}
                {!list.length && <p className="flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-border px-4 py-8 text-center text-sm text-fg-2"><UtensilsCrossed className="size-5" aria-hidden />Nothing here.</p>}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
