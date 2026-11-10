"use client";
import * as React from "react";
import { BellRing, Check, Droplets, Plus, Receipt, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, Segmented } from "@/components/ui/primitives";
import { Sheet, toast } from "@/components/ui/overlay";
import { TABLE_STATE, TableStatus } from "@/components/ui/status";
import { TABLES, type Table } from "@/lib/mock";
import { cn, inr, minsAgo } from "@/lib/utils";

const CALL = { waiter: { label: "Called a waiter", Icon: BellRing }, bill: { label: "Wants the bill", Icon: Receipt }, water: { label: "Asked for water", Icon: Droplets } };

export function WaiterScreen({ onOrder }: { onOrder: () => void }) {
  const [tables, setTables] = React.useState(TABLES);
  const [area, setArea] = React.useState<"All" | Table["area"]>("All");
  const [mine, setMine] = React.useState(false);
  const [open, setOpen] = React.useState<Table | null>(null);
  const calls = tables.filter(t => t.call);
  const shown = tables.filter(t => (area === "All" || t.area === area) && (!mine || t.waiter === "Ravi"));
  const clearCall = (id: string) => { setTables(ts => ts.map(t => (t.id === id ? { ...t, call: undefined } : t))); toast(`Table ${id} handled`); };

  return (
    <div className="grid gap-5">
      {calls.length > 0 && (
        <section aria-label="Calls from tables" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {calls.map(t => { const c = CALL[t.call!]; return (
            <div key={t.id} className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-coral/40 bg-coral-soft p-3">
              <span className="grid size-10 place-items-center rounded-full bg-coral text-[#171b24]"><c.Icon className="size-5" aria-hidden /></span>
              <div className="flex-1"><p className="font-display text-base font-extrabold text-fg">{t.name} · {c.label}</p><p className="text-[12px] text-fg-2">{t.waiter} · just now</p></div>
              <Button size="md" variant="ink" onClick={() => clearCall(t.id)}><Check />Done</Button>
            </div>
          ); })}
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={area} onChange={setArea} options={(["All", "Main hall", "Terrace"] as const).map(a => ({ value: a, label: a }))} />
        <button aria-pressed={mine} onClick={() => setMine(m => !m)} className={cn("h-10 rounded-full border border-border bg-surface px-4 text-[13px] font-semibold text-fg-2", mine && "border-blue bg-blue-soft text-blue")}>
          Only my tables
        </button>
        <div className="ml-auto hidden flex-wrap gap-3 text-[12px] text-fg-2 md:flex">
          {(Object.keys(TABLE_STATE) as (keyof typeof TABLE_STATE)[]).map(s => { const st = TABLE_STATE[s]; return <span key={s} className="flex items-center gap-1"><st.Icon className="size-3.5" aria-hidden />{st.label}</span>; })}
        </div>
      </div>

      {(["Main hall", "Terrace"] as const).filter(a => area === "All" || a === area).map(a => (
        <section key={a} aria-label={a}>
          <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wider text-fg-2">{a}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
            {shown.filter(t => t.area === a).map(t => (
              <button key={t.id} onClick={() => setOpen(t)}
                className={cn("relative flex min-h-[132px] flex-col rounded-[var(--radius-lg)] border bg-surface p-4 text-left shadow-[var(--shadow-sm)] transition hover:border-border-strong",
                  t.state === "free" ? "border-dashed border-border-strong" : "border-border", t.call && "border-coral ring-2 ring-coral/30")}>
                <div className="flex items-start justify-between">
                  <span className="font-display text-[26px] font-extrabold leading-none text-fg">{t.name}</span>
                  <span className="flex items-center gap-1 text-[12px] text-fg-2"><Users className="size-3.5" aria-hidden />{t.guests ?? 0}/{t.seats}</span>
                </div>
                <div className="mt-2"><TableStatus state={t.state} /></div>
                <div className="mt-auto flex items-end justify-between pt-3 text-[12px] text-fg-2">
                  <span>{t.mins != null ? minsAgo(t.mins) : t.state === "free" ? "Ready to seat" : "Wipe & reset"}</span>
                  {t.total != null && <span className="num text-sm font-bold text-fg">{inr(t.total)}</span>}
                </div>
                {t.call && <span className="absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full bg-coral text-[#171b24]"><BellRing className="size-3.5" aria-label="Calling" /></span>}
              </button>
            ))}
          </div>
        </section>
      ))}

      <Sheet open={!!open} onOpenChange={o => !o && setOpen(null)} title={open ? `Table ${open.name}` : ""}
        description={open ? `${open.area} · ${open.seats} seats${open.waiter ? ` · ${open.waiter}` : ""}` : undefined}>
        {open && (
          <div className="grid gap-4">
            <div className="flex items-center gap-2"><TableStatus state={open.state} />{open.mins != null && <span className="text-[13px] text-fg-2">for {minsAgo(open.mins)}</span>}</div>
            {open.state === "free" ? (
              <Card className="p-4">
                <p className="mb-3 text-sm font-semibold text-fg">How many guests?</p>
                <div className="grid grid-cols-4 gap-2">{[1, 2, 3, 4, 5, 6, 7, 8].slice(0, open.seats + 2).map(n => (
                  <Button key={n} size="lg" onClick={() => { setTables(ts => ts.map(t => (t.id === open.id ? { ...t, state: "seated", guests: n, mins: 0, waiter: "Ravi" } : t))); setOpen(null); toast(`${n} seated at ${open.name}`); }}>{n}</Button>
                ))}</div>
              </Card>
            ) : (
              <>
                <Card className="divide-y divide-border">
                  {[["Chicken Karahi · Full", 1, "Served"], ["Dal Makhani", 1, "Cooking"], ["Butter Naan · Garlic", 4, "Served"], ["Mint Lemonade · Jug", 1, "New"]].map(([n, q, s]) => (
                    <div key={String(n)} className="flex items-center gap-3 px-4 py-3 text-sm">
                      <span className="num w-6 font-bold text-fg">{q}×</span><span className="flex-1 text-fg">{n}</span>
                      <Badge tone={s === "Served" ? "success" : s === "Cooking" ? "warning" : "coral"}>{s}</Badge>
                    </div>
                  ))}
                  <div className="flex justify-between px-4 py-3 text-sm font-bold"><span className="text-fg">Running total</span><span className="num text-fg">{inr(open.total ?? 0)}</span></div>
                </Card>
                <div className="grid grid-cols-2 gap-2">
                  <Button size="xl" variant="primary" onClick={() => { setOpen(null); onOrder(); }}><Plus />Add items</Button>
                  <Button size="xl" onClick={() => { setOpen(null); toast(`Bill for ${open.name} printed`); }}><Receipt />Print bill</Button>
                </div>
                <p className="text-[12px] text-fg-2">Guests at this table can also order and pay from their phones by scanning the table QR.</p>
              </>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}
