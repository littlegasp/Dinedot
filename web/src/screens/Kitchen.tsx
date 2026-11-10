"use client";
import * as React from "react";
import { AlertTriangle, Check, Clock, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Segmented } from "@/components/ui/primitives";
import { toast } from "@/components/ui/overlay";
import { TicketStatus } from "@/components/ui/status";
import { TICKETS, dish, type Station, type Ticket } from "@/lib/mock";
import { cn } from "@/lib/utils";

const TARGET = 15; // minutes; set per restaurant
const NEXT = { new: "cooking", cooking: "ready", ready: "served" } as const;
const ACTION = { new: "Start cooking", cooking: "Mark ready", ready: "Picked up" } as const;

/** Kitchen display: always dark (glare-free on a wall screen), large type, big tap targets. */
export function KitchenScreen() {
  const [station, setStation] = React.useState<"All" | Station>("All");
  const [tickets, setTickets] = React.useState(TICKETS);
  const [, tick] = React.useState(0);
  React.useEffect(() => { const t = setInterval(() => tick(n => n + 1), 30000); return () => clearInterval(t); }, []);

  const view = tickets
    .map(t => ({ ...t, items: t.items.map((it, idx) => ({ ...it, idx })).filter(i => station === "All" || dish(i.dish).station === station) }))
    .filter(t => t.items.length);
  const bump = (t: Pick<Ticket, "id" | "no" | "status">) => {
    const next = NEXT[t.status];
    if (next === "served") { setTickets(ts => ts.filter(x => x.id !== t.id)); toast(`#${t.no} picked up`); return; }
    setTickets(ts => ts.map(x => (x.id === t.id ? { ...x, status: next } : x)));
  };
  const toggleItem = (tid: string, idx: number) =>
    setTickets(ts => ts.map(t => (t.id !== tid ? t : { ...t, items: t.items.map((it, i) => (i === idx ? { ...it, done: !it.done } : it)) })));

  return (
    <div className="theme-dark min-h-[calc(100dvh-64px)] bg-background px-4 py-5 text-fg lg:px-8">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h1 className="text-[26px] font-extrabold text-fg">Kitchen</h1>
          <p className="text-sm text-fg-2">Target {TARGET} min per ticket · tap a dish when it&apos;s plated</p>
        </div>
        <Segmented size="lg" value={station} onChange={setStation}
          options={(["All", "Tandoor", "Curry", "Bar", "Dessert"] as const).map(s => ({ value: s, label: s }))} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {(["new", "cooking", "ready"] as const).map(col => {
          const list = view.filter(t => t.status === col);
          return (
            <section key={col} aria-label={col} className="grid content-start gap-3">
              <div className="flex items-center gap-2"><TicketStatus status={col} /><span className="num text-sm font-semibold text-fg-2">{list.length}</span></div>
              {list.map(t => {
                const late = t.mins >= TARGET && t.status !== "ready";
                const warn = !late && t.mins >= TARGET * 0.7 && t.status !== "ready";
                return (
                  <article key={t.id} className={cn("overflow-hidden rounded-[var(--radius-lg)] border bg-surface",
                    late ? "border-danger" : warn ? "border-warning" : "border-border")}>
                    <header className={cn("flex items-center gap-2 px-4 py-3", late ? "bg-danger-soft" : warn ? "bg-warning-soft" : "bg-muted")}>
                      <span className="font-display text-2xl font-extrabold text-fg">{t.table}</span>
                      <Badge tone={t.kind === "Takeaway" ? "blue" : "neutral"}>{t.kind}</Badge>
                      <span className={cn("num ml-auto flex items-center gap-1 text-sm font-bold", late ? "text-danger" : warn ? "text-warning" : "text-fg-2")}>
                        {late ? <AlertTriangle className="size-4" aria-hidden /> : <Clock className="size-4" aria-hidden />}
                        {t.mins} min{late && " · late"}
                      </span>
                    </header>
                    <ul className="px-2 py-1">
                      {t.items.map((it, i) => {
                        return (
                          <li key={i}>
                            <button onClick={() => toggleItem(t.id, it.idx)} aria-pressed={!!it.done}
                              className="flex min-h-12 w-full items-center gap-3 rounded-[var(--radius)] px-2 py-2 text-left hover:bg-muted">
                              <span className={cn("grid size-6 shrink-0 place-items-center rounded-md border-2", it.done ? "border-success bg-success text-[#0f1218]" : "border-border-strong")}>
                                {it.done && <Check className="size-4" aria-hidden />}
                              </span>
                              <span className="num w-7 font-display text-xl font-extrabold text-fg">{it.qty}×</span>
                              <span className={cn("flex-1 text-[17px] font-semibold text-fg", it.done && "text-fg-2 line-through")}>
                                {dish(it.dish).name}
                                {(it.mods || it.note) && <span className="block text-[13px] font-medium text-coral-strong no-underline">{[it.mods, it.note].filter(Boolean).join(" · ")}</span>}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    {t.allergy && <p className="mx-4 mb-3 flex items-center gap-2 rounded-[var(--radius-sm)] bg-warning-soft px-3 py-2 text-[13px] font-bold text-warning"><AlertTriangle className="size-4" aria-hidden />{t.allergy}</p>}
                    <footer className="flex gap-2 border-t border-border p-3">
                      <span className="num self-center text-[12px] text-fg-2">#{t.no}</span>
                      {t.status !== "new" && <Button size="icon" variant="ghost" aria-label="Move back a step" className="ml-auto"
                        onClick={() => setTickets(ts => ts.map(x => (x.id === t.id ? { ...x, status: t.status === "ready" ? "cooking" : "new" } : x)))}><Undo2 /></Button>}
                      <Button size="lg" variant={t.status === "ready" ? "success" : "primary"} className={cn("min-w-[150px]", t.status === "new" && "ml-auto")} onClick={() => bump(t)}>{ACTION[t.status]}</Button>
                    </footer>
                  </article>
                );
              })}
              {!list.length && <p className="rounded-[var(--radius-lg)] border border-dashed border-border px-4 py-8 text-center text-sm text-fg-2">Nothing here.</p>}
            </section>
          );
        })}
      </div>
    </div>
  );
}
