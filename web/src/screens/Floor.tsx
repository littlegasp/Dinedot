"use client";
import * as React from "react";
import { Check, KeyRound, Plus, Receipt, RefreshCw, ShieldQuestion, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, Input, Segmented, Skeleton } from "@/components/ui/primitives";
import { Dialog, Sheet } from "@/components/ui/overlay";
import { TABLE_STATE, TableStatus, tableState, visitOf } from "@/components/ui/status";
import { CALL_ICON, CALL_LABEL } from "@/components/shell/AppShell";
import { FloorPlan } from "@/components/FloorPlan";
import { areasOf, usePlanView, VIEW_OPTIONS } from "@/screens/Tables";
import { rpc } from "@/lib/api";
import { minutesSince, useAction, useStaff } from "@/lib/staff";
import type { LiveTable, OrderStatus } from "@/lib/types";
import { cn, inr, minsAgo } from "@/lib/utils";

const ORDER_TONE: Record<OrderStatus, "coral" | "warning" | "success" | "neutral"> = { new: "coral", cooking: "warning", ready: "success", served: "neutral", cancelled: "neutral" };
const CALL_SHORT = { waiter: "Waiter!", water: "Water!", bill: "Bill!", help: "Help!" } as const;
const ORDER_WORD: Record<OrderStatus, string> = { new: "New", cooking: "Cooking", ready: "Ready to serve", served: "Served", cancelled: "Cancelled" };

export function FloorScreen({ openPos }: { openPos: (tableId: string, pay?: boolean) => void }) {
  const { live, can } = useStaff();
  const { run, pending } = useAction();
  const [area, setArea] = React.useState("All");
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [voiding, setVoiding] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [view, setView] = usePlanView();

  if (!live) return <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-[132px]" />)}</div>;
  const tables = live.tables.filter(t => t.active);
  if (!tables.length) return <Card><EmptyState icon={<Users />} title="No tables yet" body="Add tables and print their QR codes from Tables & QR." /></Card>;

  const areaList = areasOf(live.areas, tables).filter(a => tables.some(t => t.area === a.name));   // rooms with tables
  const areas = areaList.map(a => a.name);
  const code = (id: string) => live.tables.find(t => t.id === id)?.code ?? "";
  const open = openId ? tables.find(t => t.id === openId) : undefined;
  const ov = open ? visitOf(open, live.visits) : undefined;

  const waiting = live.visits.filter(v => v.approved === false && v.table_id);
  const decide = (v: (typeof waiting)[number], ok: boolean) =>
    run(() => rpc("staff_accept_table", { p_visit: v.id, p_ok: ok }), ok ? `${code(v.table_id!)} accepted: sent to the kitchen` : `${code(v.table_id!)} turned down`);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      {waiting.length > 0 && (
        <section aria-label="Tables waiting for your OK" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {waiting.map(v => (
            <div key={v.id} className="grid gap-3 rounded-[var(--radius-lg)] border border-warning bg-warning-soft p-3">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-warning text-[#171b24]"><ShieldQuestion className="size-5" aria-hidden /></span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-base font-extrabold text-fg">{code(v.table_id!)} wants to order</p>
                  <p className="text-[12px] text-fg-2">{minsAgo(minutesSince(v.opened_at))} · {v.orders.flatMap(o => o.items).map(i => `${i.qty}× ${i.name}`).join(", ")}</p>
                  <p className="mt-1 text-[12px] font-semibold text-warning-strong">Glance at the table: is someone sitting there?</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="danger" disabled={pending} onClick={() => decide(v, false)}><X />Deny</Button>
                <Button variant="success" disabled={pending} onClick={() => decide(v, true)}><Check />Accept</Button>
              </div>
            </div>
          ))}
        </section>
      )}

      {live.calls.length > 0 && (
        <section aria-label="Calls from tables" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {live.calls.map(c => { const I = CALL_ICON[c.kind]; return (
            <div key={c.id} className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-coral/40 bg-coral-soft p-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-coral text-[#171b24]"><I className="size-5" aria-hidden /></span>
              <div className="min-w-0 flex-1"><p className="font-display text-base font-extrabold text-fg">{code(c.table_id)} {CALL_LABEL[c.kind]}</p>
                <p className="text-[12px] text-fg-2">{minsAgo(minutesSince(c.at))}{c.seen_by ? ` · ${c.seen_by} saw it` : ""}</p></div>
              <Button variant="ink" disabled={pending} onClick={() => run(() => rpc("staff_call", { p_call: c.id, p_action: "done" }), `${code(c.table_id)} handled`)}><Check />Done</Button>
            </div>
          ); })}
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {areas.length > 1 && <Segmented value={area} onChange={setArea} options={["All", ...areas].map(a => ({ value: a, label: a }))} />}
        <Segmented className="order-last ml-auto md:order-none" value={view} onChange={setView} options={VIEW_OPTIONS} />
        <div className="hidden flex-wrap gap-3 text-[12px] text-fg-2 lg:flex">
          {(Object.keys(TABLE_STATE) as (keyof typeof TABLE_STATE)[]).map(s => { const st = TABLE_STATE[s]; return <span key={s} className="flex items-center gap-1"><st.Icon className="size-3.5" aria-hidden />{st.label}</span>; })}
        </div>
      </div>

      {areas.filter(a => area === "All" || a === area).map(a => (
        <section key={a} aria-label={a} className="min-w-0">
          {areas.length > 1 && view === "cards" && <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wider text-fg-2">{a}</h2>}
          {view === "plan" ? (
            <FloorPlan area={a} room={areaList.find(x => x.name === a)?.shape} marks={areaList.find(x => x.name === a)?.marks} tables={tables.filter(t => t.area === a)} onOpen={t => setOpenId(t.id)} info={t => {
              const v = visitOf(t, live.visits), st = tableState(v), call = live.calls.find(c => c.table_id === t.id);
              if (v?.approved === false) return { state: "ordered", word: "Needs OK", ping: true, sub: minsAgo(minutesSince(v.opened_at)) };
              return { state: st, word: call ? CALL_SHORT[call.kind] : TABLE_STATE[st].label, ping: !!call,
                sub: v ? minsAgo(minutesSince(v.opened_at)) : undefined };
            }} />
          ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
            {tables.filter(t => t.area === a).map(t => <TableCard key={t.id} t={t} onOpen={() => setOpenId(t.id)} />)}
          </div>
          )}
        </section>
      ))}

      <Sheet open={!!open} onOpenChange={o => !o && setOpenId(null)} title={open ? `Table ${open.code}` : ""}
        description={open ? `${open.area} · ${open.seats} seats${ov?.guests ? ` · ${ov.guests} guests` : ""}` : undefined}>
        {open && (!ov ? (
          <div className="grid gap-4">
            <TableStatus state="free" />
            <p className="text-sm text-fg-2">Guests can order by scanning the table&apos;s QR code, or you can take their order here.</p>
            <Button size="xl" variant="primary" onClick={() => { setOpenId(null); openPos(open.id); }}><Plus />Take an order</Button>
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="flex items-center gap-2"><TableStatus state={tableState(ov)} /><span className="text-[13px] text-fg-2">open {minsAgo(minutesSince(ov.opened_at))}</span></div>
            {ov.approved === false && (
              <div className="grid gap-2 rounded-[var(--radius)] bg-warning-soft p-3">
                <p className="text-sm font-semibold text-warning-strong">This table&apos;s first order is waiting for your OK. Accept it if someone is sitting here.</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="danger" disabled={pending} onClick={() => decide(ov, false)}><X />Deny</Button>
                  <Button variant="success" disabled={pending} onClick={() => decide(ov, true)}><Check />Accept</Button>
                </div>
              </div>
            )}
            {live.settings.approve_tables && ov.join_code && (
              <div className="flex items-center gap-3 rounded-[var(--radius)] border border-border px-3 py-2">
                <KeyRound className="size-4 shrink-0 text-fg-2" aria-hidden />
                <span className="text-[13px] text-fg-2">Table code</span>
                <span className="num font-display text-xl font-extrabold tracking-[.2em] text-fg" aria-label={`Table code ${ov.join_code.split("").join(" ")}`}>{ov.join_code}</span>
                <Button size="sm" variant="ghost" className="ml-auto" disabled={pending}
                  onClick={() => run(() => rpc("staff_new_join_code", { p_visit: ov.id }), "New table code made")}><RefreshCw />New code</Button>
              </div>
            )}
            <Card className="divide-y divide-border">
              {ov.orders.map(o => (
                <div key={o.id} className="px-4 py-3">
                  <div className="mb-1.5 flex items-center gap-2 text-[12px] text-fg-2">
                    <span className="num font-semibold">#{o.no}</span>· {minsAgo(minutesSince(o.created_at))} · {o.source === "guest" ? "QR" : "Staff"}
                    <Badge tone={ORDER_TONE[o.status]} className="ml-auto">{ORDER_WORD[o.status]}</Badge>
                  </div>
                  <ul className={cn("grid gap-0.5 text-sm text-fg", o.status === "cancelled" && "text-fg-2 line-through")}>
                    {o.items.map((it, i) => <li key={i}><span className="num font-bold">{it.qty}×</span> {it.name}{it.size && ` · ${it.size}`}</li>)}
                  </ul>
                  <div className="mt-2 flex gap-2">
                    {o.status === "ready" && <Button size="sm" variant="success" disabled={pending} onClick={() => run(() => rpc("staff_order_status", { p_order: o.id, p_status: "served" }), "Served")}><Check />Served</Button>}
                    {o.status === "new" && <Button size="sm" variant="danger" disabled={pending} onClick={() => run(() => rpc("staff_order_status", { p_order: o.id, p_status: "cancelled", p_reason: "Cancelled at the table" }), `#${o.no} cancelled`)}><X />Cancel</Button>}
                  </div>
                </div>
              ))}
              <div className="flex justify-between px-4 py-3 text-sm font-bold"><span className="text-fg">Bill so far</span><span className="num text-fg">{inr(ov.bill.grand)}</span></div>
            </Card>
            <div className="grid grid-cols-2 gap-2">
              <Button size="xl" onClick={() => { setOpenId(null); openPos(open.id); }}><Plus />Add items</Button>
              <Button size="xl" variant="primary" onClick={() => { setOpenId(null); openPos(open.id, true); }}><Receipt />Bill & pay</Button>
            </div>
            {can("manage") && <button className="text-left text-[13px] font-semibold text-danger" onClick={() => { setReason(""); setVoiding(true); }}>Clear table without payment…</button>}
          </div>
        ))}
      </Sheet>

      <Dialog open={voiding} onOpenChange={setVoiding} title={`Clear table ${open?.code ?? ""}`} description="For walk-outs, test orders or a table where everything was cancelled. Dishes still in the kitchen are cancelled. Saved in the activity log with your reason.">
        <Input autoFocus value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason, e.g. guests left without paying" />
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setVoiding(false)}>Keep it</Button>
          <Button variant="danger" disabled={pending || reason.trim().length < 3} onClick={async () => {
            const ok = await run(() => rpc("staff_void_visit", { p_visit: ov!.id, p_reason: reason.trim() }).then(() => true), "Table cleared");
            if (ok) { setVoiding(false); setOpenId(null); } }}>Clear table</Button>
        </div>
      </Dialog>
    </div>
  );

  function TableCard({ t, onOpen }: { t: LiveTable; onOpen: () => void }) {
    const v = visitOf(t, live!.visits);
    const st = tableState(v);
    const call = live!.calls.find(c => c.table_id === t.id);
    return (
      <button onClick={onOpen}
        className={cn("relative flex min-h-[132px] flex-col rounded-[var(--radius-lg)] border bg-surface p-4 text-left shadow-[var(--shadow-sm)] transition hover:border-border-strong",
          st === "free" ? "border-dashed border-border-strong" : "border-border", call && "border-coral ring-2 ring-coral/30")}>
        <div className="flex items-start justify-between">
          <span className="font-display text-[26px] font-extrabold leading-none text-fg">{t.code}</span>
          <span className="flex items-center gap-1 text-[12px] text-fg-2"><Users className="size-3.5" aria-hidden />{v?.guests ?? 0}/{t.seats}</span>
        </div>
        <div className="mt-2"><TableStatus state={st} /></div>
        <div className="mt-auto flex items-end justify-between pt-3 text-[12px] text-fg-2">
          <span>{v ? minsAgo(minutesSince(v.opened_at)) : "Ready to seat"}</span>
          {v && <span className="num text-sm font-bold text-fg">{inr(v.bill.grand)}</span>}
        </div>
        {call && <span className="absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full bg-coral text-[#171b24]" aria-label={`Table ${t.code} ${CALL_LABEL[call.kind]}`}><BellDot /></span>}
      </button>
    );
  }
}

const BellDot = () => <span className="size-2 rounded-full bg-[#171b24]" />;
