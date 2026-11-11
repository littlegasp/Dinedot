"use client";
import * as React from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Download, Pause, Play, Receipt, Star, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/primitives";
import { toast } from "@/components/ui/overlay";
import { TABLE_STATE, tableState, visitLabel, visitOf } from "@/components/ui/status";
import { CloseDayCard, NoticeCard } from "./DayClose";
import { CALL_ICON, CALL_LABEL } from "@/components/shell/AppShell";
import { rpc } from "@/lib/api";
import { minutesSince, useAction, useStaff } from "@/lib/staff";
import type { PayMethod, Report } from "@/lib/types";
import { cn, inr } from "@/lib/utils";

const ist = (d: Date) => new Date(d.getTime() + 330 * 60000).toISOString().slice(0, 10);   // the database counts days in India time
const METHOD: Record<PayMethod, { label: string; cls: string }> = {
  upi: { label: "UPI", cls: "bg-blue" }, card: { label: "Card", cls: "bg-coral" }, cash: { label: "Cash", cls: "bg-success" }, mixed: { label: "Split", cls: "bg-warning" },
};

export function TodayScreen({ go }: { go: (hash: string) => void }) {
  const { live, can } = useStaff();
  const { run, pending } = useAction();
  const [rep, setRep] = React.useState<{ today: Report; last: Report } | null>(null);
  const bills = live?.today.bills ?? 0;

  React.useEffect(() => {
    if (!can("manage")) return;
    const t = ist(new Date()), l = ist(new Date(Date.now() - 7 * 864e5));
    Promise.all([rpc<Report>("owner_report", { p_from: t, p_to: t }), rpc<Report>("owner_report", { p_from: l, p_to: l })])
      .then(([today, last]) => setRep({ today, last })).catch(e => toast((e as Error).message, "error"));
  }, [can, bills]);   // refresh when a bill closes

  if (!live) return <div className="grid gap-4"><div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-28" />)}</div><Skeleton className="h-72" /></div>;

  const t = live.today;
  const avg = t.bills ? t.sales / t.bills : 0;
  const last = rep?.last;
  // compare with last week only once today has a closed bill (a 0 early in the day isn't "down 100%")
  const delta = (now: number, before?: number) => (before && t.bills > 0 ? Math.round(((now - before) / before) * 1000) / 10 : null);
  const KPIS = [
    { label: "Sales today", value: inr(t.sales), d: delta(t.sales, last?.sales), Icon: Wallet },
    { label: "Bills closed", value: String(t.bills), d: delta(t.bills, last?.bills), Icon: Receipt },
    { label: "Average bill", value: inr(avg), d: delta(avg, last && last.bills ? last.sales / last.bills : undefined), Icon: Users },
    { label: "Guest rating", value: t.rating ? String(t.rating) : "–", d: null, note: rep ? `${rep.today.ratings} rating${rep.today.ratings === 1 ? "" : "s"} today` : "", Icon: Star },
  ];
  const hours = Array.from({ length: 24 }, (_, h) => ({ h, n: t.flow[String(h)] ?? 0 })).filter((x, _, a) => {
    const used = a.filter(y => y.n).map(y => y.h); return used.length ? x.h >= Math.min(...used, 11) && x.h <= Math.max(...used, 22) : x.h >= 11 && x.h <= 23;
  });

  const code = (id: string) => live.tables.find(x => x.id === id)?.code ?? "";
  const lateOrders = live.visits.flatMap(v => v.orders.filter(o => (o.status === "new" || o.status === "cooking") && minutesSince(o.created_at) >= 15).map(o => ({ o, table: visitLabel(v, live.tables) })));
  const attention = [
    ...live.calls.map(c => ({ key: c.id, Icon: CALL_ICON[c.kind], tone: "coral" as const, title: `${code(c.table_id)} ${CALL_LABEL[c.kind]}`, body: `waiting ${minutesSince(c.at)} min`,
      act: () => run(() => rpc("staff_call", { p_call: c.id, p_action: "done" }), "Done"), label: "Done" })),
    ...lateOrders.map(({ o, table }) => ({ key: o.id, Icon: AlertTriangle, tone: "warning" as const, title: `Order #${o.no} is running late`, body: `${table} · ${minutesSince(o.created_at)} min in the kitchen`,
      act: () => go("/kitchen"), label: "Open kitchen" })),
  ];
  const states = live.tables.filter(x => x.active).map(x => tableState(visitOf(x, live.visits)));
  const methods = Object.entries(rep?.today.methods ?? {}) as [PayMethod, number][];
  const payTotal = methods.reduce((s, [, v]) => s + Number(v), 0);

  const downloadBills = async () => {
    const d = ist(new Date());
    const rows = await rpc<{ table: string; paid_at: string; status: string; method: string; total: number; tip: number; guests: number; ref: string; by: string; void_reason: string }[]>("staff_bills", { p_from: d, p_to: d });
    const esc = (x: unknown) => `"${String(x ?? "").replace(/"/g, '""')}"`;
    const csv = [["Table", "Paid at", "Status", "Method", "Total", "Tip", "Guests", "Reference", "Closed by", "Reason"].join(","),
      ...rows.map(r => [r.table, r.paid_at ? new Date(r.paid_at).toLocaleString("en-IN") : "", r.status, r.method, r.total, r.tip, r.guests, r.ref, r.by, r.void_reason].map(esc).join(","))].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `bills-${d}.csv`; a.click();
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div className="grid grid-cols-2 gap-3 lg:gap-4 xl:grid-cols-4">
        {KPIS.map(k => (
          <Card key={k.label} className="p-4 lg:p-5">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-fg-2"><k.Icon className="size-4" aria-hidden />{k.label}</div>
            <p className="num mt-2 font-display text-[26px] font-extrabold leading-none text-fg lg:text-[30px]">{k.value}</p>
            <p className="mt-2 flex min-h-4 items-center gap-1 text-[12px] font-semibold">
              {k.d != null ? <span className={cn("flex items-center gap-1", k.d >= 0 ? "text-success" : "text-danger")}>
                {k.d >= 0 ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}{k.d >= 0 ? "Up" : "Down"} {Math.abs(k.d)}%
                <span className="hidden font-normal text-fg-2 sm:inline">vs last week</span></span>
                : <span className="font-normal text-fg-2">{"note" in k ? k.note : t.bills === 0 ? "No bills closed yet" : can("manage") && rep ? "Nothing to compare with last week" : ""}</span>}
            </p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader title="Tables opened by hour" sub={`${t.orders} orders and ${t.guests} guests so far today`} />
          <div className="h-[240px] px-2 pb-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hours} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="h" tickLine={false} axisLine={false} tick={{ fill: "var(--text-secondary)", fontSize: 12 }} tickFormatter={h => `${h % 12 || 12}${h < 12 ? "am" : "pm"}`} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} tick={{ fill: "var(--text-secondary)", fontSize: 12 }} />
                <Tooltip cursor={{ fill: "var(--surface-muted)" }} contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 13 }}
                  formatter={v => [String(v), "Tables opened"]} labelFormatter={h => `${Number(h) % 12 || 12}${Number(h) < 12 ? " am" : " pm"}`} />
                <Bar dataKey="n" fill="var(--coral)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Needs attention" sub="Clears itself when someone handles it" action={attention.length ? <Badge tone="coral">{attention.length}</Badge> : undefined} />
          {attention.length === 0 ? <EmptyState icon={<Star />} title="All calm" body="No calls from tables and nothing late in the kitchen." /> : (
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 px-4 pb-4">
              {attention.slice(0, 6).map(a => (
                <li key={a.key} className="flex items-center gap-3 rounded-[var(--radius)] border border-border p-3">
                  <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", a.tone === "coral" ? "bg-coral-soft text-coral-strong" : "bg-warning-soft text-warning-strong")}><a.Icon className="size-4" aria-hidden /></span>
                  <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-fg">{a.title}</p><p className="truncate text-[12px] text-fg-2">{a.body}</p></div>
                  <Button size="sm" disabled={pending} onClick={a.act}>{a.label}</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="Floor right now" sub={`${states.filter(s => s !== "free").length} of ${states.length} tables in use`}
            action={<Button size="sm" variant="ghost" onClick={() => go("/floor")}>Open floor</Button>} />
          <div className="grid grid-cols-2 gap-2 px-4 pb-4">
            {(["ordered", "food", "bill", "free"] as const).map(s => { const st = TABLE_STATE[s]; return (
              <div key={s} className="rounded-[var(--radius)] border border-border p-3">
                <st.Icon className="size-4 text-fg-2" aria-hidden />
                <p className="num mt-1.5 font-display text-xl font-extrabold text-fg">{states.filter(x => x === s).length}</p>
                <p className="text-[12px] text-fg-2">{st.label}</p>
              </div>
            ); })}
          </div>
        </Card>

        <Card>
          <CardHeader title="Best sellers today" sub="From bills closed today" />
          {!rep ? <div className="grid gap-2 px-5 pb-5">{[0, 1, 2].map(i => <Skeleton key={i} className="h-8" />)}</div>
            : rep.today.top.length === 0 ? <EmptyState icon={<Receipt />} title="No bills yet today" body="Best sellers show up as bills are closed." /> : (
            <ol className="px-5 pb-3">
              {rep.today.top.slice(0, 5).map((d, i) => (
                <li key={d.name} className="flex items-center gap-3 border-t border-border py-2.5 first:border-0">
                  <span className="num w-4 text-[13px] font-bold text-fg-2">{i + 1}</span>
                  <span className="flex-1 text-sm font-semibold text-fg">{d.name}</span>
                  <span className="num text-sm text-fg-2">{d.qty}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card className="flex flex-col">
          <CardHeader title="Money in" sub="By how guests paid" />
          <div className="grid gap-3 px-5">
            {payTotal === 0 ? <p className="text-sm text-fg-2">No payments yet today.</p> : <>
              <div className="flex h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={methods.map(([m, v]) => `${METHOD[m].label} ${Math.round(v / payTotal * 100)}%`).join(", ")}>
                {methods.map(([m, v], i) => <span key={m} style={{ width: `${(v / payTotal) * 100}%` }} className={cn(METHOD[m].cls, i > 0 && "border-l-2 border-surface")} />)}
              </div>
              {methods.map(([m, v]) => (
                <div key={m} className="flex items-center gap-2 text-sm">
                  <span className={cn("size-2.5 rounded-full", METHOD[m].cls)} /><span className="flex-1 text-fg">{METHOD[m].label}</span>
                  <span className="num font-semibold text-fg">{inr(v)}</span><span className="num w-10 text-right text-[12px] text-fg-2">{Math.round((v / payTotal) * 100)}%</span>
                </div>
              ))}
            </>}
          </div>
          <div className="mt-auto flex gap-2 p-5 pt-4">
            <Button className="flex-1" variant={live.settings.accepting ? "secondary" : "primary"} disabled={pending}
              onClick={() => run(() => rpc("owner_save_settings", { p: { accepting_orders: !live.settings.accepting } }), live.settings.accepting ? "QR ordering paused" : "QR ordering back on")}>
              {live.settings.accepting ? <><Pause />Pause QR orders</> : <><Play />Resume QR orders</>}
            </Button>
            <Button size="icon" aria-label="Download today's bills (CSV)" onClick={() => downloadBills().catch(e => toast((e as Error).message, "error"))}><Download /></Button>
          </div>
        </Card>
      </div>

      {can("manage") && (
        <div className="grid gap-5 lg:grid-cols-2">
          <CloseDayCard />
          <NoticeCard />
        </div>
      )}
    </div>
  );
}
