"use client";
import * as React from "react";
import { AlertTriangle, Check, Clock, ShoppingBag, Undo2, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Diet, Skeleton } from "@/components/ui/primitives";
import { TicketStatus, visitLabel } from "@/components/ui/status";
import { Swipe } from "@/components/ui/Swipe";
import { rpc } from "@/lib/api";
import { minutesSince, useAction, useStaff } from "@/lib/staff";
import type { Order } from "@/lib/types";
import { cn } from "@/lib/utils";

const TARGET = 15;   // minutes per ticket before it shows as late
const NEXT = { new: "cooking", cooking: "ready", ready: "served" } as const;
const BACK = { cooking: "new", ready: "cooking" } as const;
const ACTION = { new: "Start cooking", cooking: "Mark ready", ready: "Picked up" } as const;
type Col = keyof typeof NEXT;

const STATION_KEY = "dineos.station";   // each kitchen screen remembers its own station
const readStation = () => { try { return localStorage.getItem(STATION_KEY) ?? ""; } catch { return ""; } };

/** Kitchen display: follows the Day / Night look like every other screen; big type, big buttons.
    A station screen shows only its own dishes; any dish can be ticked off on its own. */
export function KitchenScreen() {
  const { live } = useStaff();
  const { run, pending } = useAction();
  const [, tick] = React.useState(0);
  const [station, setStation] = React.useState("");
  React.useEffect(() => { setStation(readStation()); }, []);
  React.useEffect(() => { const t = setInterval(() => tick(n => n + 1), 20_000); return () => clearInterval(t); }, []);
  const stations = live?.settings.stations ?? [];
  const here = station && stations.includes(station) ? station : "";
  const pickStation = (s: string) => { setStation(s); try { localStorage.setItem(STATION_KEY, s); } catch { /* private window */ } };

  const tickets = (live?.visits ?? []).flatMap(v => v.orders.filter(o => o.status in NEXT)
      .map(o => ({ o, table: visitLabel(v, live!.tables), takeaway: v.kind === "takeaway", paid: v.status === "paid",
                   mine: here ? o.items.filter(i => i.station === here) : o.items })))
    .filter(t => t.mine.length > 0)
    .sort((a, b) => a.o.created_at.localeCompare(b.o.created_at));
  const step = (o: Order, to: string) => run(() => rpc("staff_order_status", { p_order: o.id, p_status: to }));
  const tickItem = (id: number, done: boolean) => run(() => rpc("staff_item_done", { p_item: id, p_done: done }));

  return (
    <div className="min-h-[calc(100dvh-64px)] bg-background px-4 py-5 text-fg lg:px-8">
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-[26px] font-extrabold text-fg">Kitchen{here && <span className="text-fg-2"> · {here}</span>}</h1>
          <p className="text-sm text-fg-2">Oldest first · late after {TARGET} min · tap a dish when it&apos;s done</p>
        </div>
        {stations.length > 0 && (
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Station">
            {["", ...stations].map(s => (
              <button key={s || "all"} role="radio" aria-checked={here === s} onClick={() => pickStation(s)}
                className={cn("h-11 rounded-full border border-border bg-surface px-4 text-sm font-bold text-fg-2", here === s && "border-coral bg-coral text-[#171b24]")}>
                {s || "All stations"}
              </button>
            ))}
          </div>
        )}
      </div>
      {!live ? <div className="grid gap-4 md:grid-cols-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-64 opacity-30" />)}</div> : (
        <div className="grid gap-4 md:grid-cols-3">
          {(["new", "cooking", "ready"] as Col[]).map(col => {
            const list = tickets.filter(t => t.o.status === col);
            return (
              <section key={col} aria-label={col} className="grid content-start gap-3">
                <div className="flex items-center gap-2"><TicketStatus status={col} /><span className="num text-sm font-semibold text-fg-2">{list.length}</span></div>
                {list.map(({ o, table, takeaway, paid, mine }) => {
                  const mins = minutesSince(o.created_at);
                  const late = mins >= TARGET && col !== "ready";
                  const warn = !late && mins >= TARGET * 0.7 && col !== "ready";
                  return (
                    <Swipe key={o.id} label={ACTION[col]} disabled={pending} onSwipe={() => step(o, NEXT[col])}>
                    <article className={cn("rise overflow-hidden rounded-[var(--radius-lg)] border bg-surface", late ? "border-danger" : warn ? "border-warning" : "border-border")}>
                      <header className={cn("flex items-center gap-2 px-4 py-3", late ? "bg-danger-soft" : warn ? "bg-warning-soft" : "bg-muted")}>
                        <span className="font-display text-2xl font-extrabold text-fg">{table}</span>
                        {takeaway ? <Badge tone="coral"><ShoppingBag aria-hidden />Takeaway{paid && " · paid"}</Badge> : <Badge tone="neutral">{o.source === "guest" ? "QR" : "Staff"}</Badge>}
                        <span className={cn("num ml-auto flex items-center gap-1 text-sm font-bold", late ? "text-danger" : warn ? "text-warning" : "text-fg-2")}>
                          {late ? <AlertTriangle className="size-4" aria-hidden /> : <Clock className="size-4" aria-hidden />}{mins} min{late && " · late"}
                        </span>
                      </header>
                      <ul className="px-2 py-1.5">
                        {mine.map(it => (
                          <li key={it.id}>
                            <button aria-pressed={it.done} disabled={pending || col !== "cooking"} onClick={() => tickItem(it.id, !it.done)}
                              aria-label={`${it.qty} ${it.name}${it.done ? ", done" : ""}`} title={col === "new" ? "Tap Start cooking first" : undefined}
                              className="flex w-full items-start gap-3 rounded-[var(--radius)] px-2 py-2 text-left hover:bg-muted disabled:cursor-default disabled:hover:bg-transparent">
                              <span className="num w-8 shrink-0 font-display text-xl font-extrabold text-fg">{it.qty}×</span>
                              <span className={cn("flex-1 text-[17px] font-semibold leading-snug text-fg", it.done && col !== "ready" && "text-fg-2 line-through decoration-2")}>
                                <span className="inline-flex items-center gap-1.5"><Diet diet={it.diet} />{it.name}</span>
                                {(it.size || it.addons.length > 0 || it.note) && (
                                  <span className="block text-[13px] font-medium text-coral-strong no-underline">{[it.size, ...it.addons, it.note].filter(Boolean).join(" · ")}</span>)}
                                {!here && it.station && stations.length > 0 && <span className="block text-[12px] font-medium text-fg-2 no-underline">{it.station}</span>}
                              </span>
                              {col === "cooking" && <span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border-2", it.done ? "border-success bg-success text-[#0d1a12]" : "border-border-strong")} aria-hidden>
                                {it.done && <Check className="size-4" strokeWidth={3} />}</span>}
                            </button>
                          </li>
                        ))}
                        {mine.length < o.items.length && <li className="px-2 pb-1 text-[13px] text-fg-2">+ {o.items.length - mine.length} dish{o.items.length - mine.length > 1 ? "es" : ""} for other stations</li>}
                      </ul>
                      {o.note && <p className="mx-4 mb-3 flex items-center gap-2 rounded-[var(--radius-sm)] bg-warning-soft px-3 py-2 text-[13px] font-bold text-warning"><AlertTriangle className="size-4 shrink-0" aria-hidden />{o.note}</p>}
                      <footer className="flex items-center gap-2 border-t border-border p-3">
                        <span className="num text-[12px] text-fg-2">#{o.no}</span>
                        {col !== "new" && <Button size="icon" variant="ghost" aria-label="Move back a step" className="ml-auto" disabled={pending} onClick={() => step(o, BACK[col as "cooking" | "ready"])}><Undo2 /></Button>}
                        <Button size="lg" variant={col === "ready" ? "success" : "primary"} disabled={pending} className={cn("min-w-[150px]", col === "new" && "ml-auto")} onClick={() => step(o, NEXT[col])}>{ACTION[col]}</Button>
                      </footer>
                    </article>
                    </Swipe>
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
