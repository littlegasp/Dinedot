"use client";
import * as React from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, BellRing, Download, Lock, Receipt, Star, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader } from "@/components/ui/primitives";
import { Dialog, toast } from "@/components/ui/overlay";
import { TABLE_STATE } from "@/components/ui/status";
import { HOURLY, PAY_MIX, TABLES, TOP_DISHES, dish } from "@/lib/mock";
import { cn, inr } from "@/lib/utils";

const KPIS = [
  { label: "Sales today", value: inr(71900), delta: +12.4, note: "vs last Tuesday", Icon: Wallet },
  { label: "Bills closed", value: "86", delta: +6.2, note: "vs last Tuesday", Icon: Receipt },
  { label: "Average bill", value: inr(836), delta: +5.8, note: "per table", Icon: Users },
  { label: "Guest rating", value: "4.6", delta: -0.1, note: "38 reviews today", Icon: Star },
];

export function OwnerScreen() {
  const [close, setClose] = React.useState(false);
  const occupied = TABLES.filter(t => t.state !== "free" && t.state !== "cleaning").length;
  const payTotal = PAY_MIX.reduce((s, p) => s + p.v, 0);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 lg:gap-4">
        {KPIS.map(k => (
          <Card key={k.label} className="p-4 lg:p-5">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-fg-2"><k.Icon className="size-4" aria-hidden />{k.label}</div>
            <p className="num mt-2 font-display text-[26px] font-extrabold leading-none text-fg lg:text-[30px]">{k.value}</p>
            <p className={cn("mt-2 flex items-center gap-1 text-[12px] font-semibold", k.delta >= 0 ? "text-success" : "text-danger")}>
              {k.delta >= 0 ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}
              {k.delta >= 0 ? "Up" : "Down"} {Math.abs(k.delta)}{k.label === "Guest rating" ? "" : "%"}
              <span className="hidden font-normal text-fg-2 sm:inline">{k.note}</span>
            </p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* Hourly sales */}
        <Card>
          <CardHeader title="Sales by hour" sub="Today against the same day last week"
            action={<div className="flex gap-3 text-[12px] text-fg-2"><Legend c="var(--coral)" l="Today" /><Legend c="var(--border-strong)" l="Last Tuesday" dashed /></div>} />
          <div className="h-[260px] px-2 pb-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={HOURLY} margin={{ left: 8, right: 16, top: 8, bottom: 0 }}>
                <defs><linearGradient id="g" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--coral)" stopOpacity={0.28} /><stop offset="100%" stopColor="var(--coral)" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="h" tickLine={false} axisLine={false} tick={{ fill: "var(--text-secondary)", fontSize: 12 }} tickFormatter={h => `${+h > 12 ? +h - 12 : h}${+h >= 12 ? "pm" : "am"}`} />
                <YAxis tickLine={false} axisLine={false} width={44} tick={{ fill: "var(--text-secondary)", fontSize: 12 }} tickFormatter={v => `₹${v / 1000}k`} />
                <Tooltip cursor={{ stroke: "var(--border-strong)" }} contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 13 }}
                  formatter={(v, n) => [inr(Number(v)), n === "today" ? "Today" : "Last Tuesday"]} labelFormatter={h => `${h}:00`} />
                <Area dataKey="last" type="monotone" stroke="var(--border-strong)" strokeDasharray="4 4" fill="none" strokeWidth={2} isAnimationActive={false} />
                <Area dataKey="today" type="monotone" stroke="var(--coral)" fill="url(#g)" strokeWidth={2.5} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Needs attention */}
        <Card>
          <CardHeader title="Needs attention" sub="Clears itself when someone handles it" action={<Badge tone="coral">3</Badge>} />
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 px-4 pb-4">
            <Attention Icon={Receipt} tone="coral" title="T4 asked for the bill" body="Meera · 5 guests · waiting 1 min" />
            <Attention Icon={BellRing} tone="coral" title="T7 called a waiter" body="Ravi · waiting 2 min" />
            <Attention Icon={AlertTriangle} tone="warning" title="Ticket #207 is running late" body="T3 · 19 min in the kitchen (target 15)" />
          </ul>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Floor now */}
        <Card>
          <CardHeader title="Floor right now" sub={`${occupied} of ${TABLES.length} tables in use`} />
          <div className="grid grid-cols-3 gap-2 px-4 pb-4">
            {(["seated", "ordered", "food", "bill", "cleaning", "free"] as const).map(s => {
              const st = TABLE_STATE[s]; const n = TABLES.filter(t => t.state === s).length;
              return (
                <div key={s} className="rounded-[var(--radius)] border border-border p-3">
                  <st.Icon className="size-4 text-fg-2" aria-hidden />
                  <p className="num mt-1.5 font-display text-xl font-extrabold text-fg">{n}</p>
                  <p className="text-[12px] text-fg-2">{st.label}</p>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Top dishes */}
        <Card>
          <CardHeader title="Best sellers today" sub="By plates sent from the kitchen" />
          <ol className="px-4 pb-3">
            {TOP_DISHES.slice(0, 4).map((t, i) => {
              const d = dish(t.id);
              return (
                <li key={t.id} className="flex items-center gap-3 border-t border-border py-2.5 first:border-0">
                  <span className="num w-4 text-[13px] font-bold text-fg-2">{i + 1}</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={d.photo} alt="" className="size-10 rounded-[var(--radius-sm)] object-cover" />
                  <span className="flex-1 text-sm font-semibold text-fg">{d.name}</span>
                  <span className="num text-sm text-fg-2">{t.qty}</span>
                </li>
              );
            })}
          </ol>
        </Card>

        {/* Payment mix + close */}
        <Card className="flex flex-col">
          <CardHeader title="Money in" sub="Split by how guests paid" />
          <div className="grid gap-3 px-5">
            <div className="flex h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label="UPI 67%, card 24%, cash 9%">
              {PAY_MIX.map((p, i) => <span key={p.m} style={{ width: `${(p.v / payTotal) * 100}%` }} className={cn(i === 0 ? "bg-blue" : i === 1 ? "bg-coral" : "bg-success", i > 0 && "border-l-2 border-surface")} />)}
            </div>
            {PAY_MIX.map((p, i) => (
              <div key={p.m} className="flex items-center gap-2 text-sm">
                <span className={cn("size-2.5 rounded-full", i === 0 ? "bg-blue" : i === 1 ? "bg-coral" : "bg-success")} />
                <span className="flex-1 text-fg">{p.m}</span>
                <span className="num font-semibold text-fg">{inr(p.v)}</span>
                <span className="num w-10 text-right text-[12px] text-fg-2">{Math.round((p.v / payTotal) * 100)}%</span>
              </div>
            ))}
          </div>
          <div className="mt-auto flex gap-2 p-5 pt-4">
            <Button variant="primary" className="flex-1" onClick={() => setClose(true)}><Lock />Close the day</Button>
            <Button size="icon" aria-label="Download today's sales"><Download /></Button>
          </div>
        </Card>
      </div>

      <Dialog open={close} onOpenChange={setClose} title="Close the day" description="Count the cash drawer, then lock today's sales. Bills can't be changed after this.">
        <div className="grid gap-2 text-sm">
          {[["Opening cash", 2000], ["Cash sales", 6300], ["Paid out (vegetables)", -850]].map(([l, v]) => (
            <div key={l} className="flex justify-between"><span className="text-fg-2">{l}</span><span className="num font-semibold text-fg">{inr(Number(v))}</span></div>
          ))}
          <div className="flex justify-between border-t border-border pt-2 font-bold"><span className="text-fg">Cash expected in drawer</span><span className="num text-fg">{inr(7450)}</span></div>
          <label className="mt-2 grid gap-1.5"><span className="text-[13px] font-semibold text-fg">Cash counted</span>
            <input defaultValue="7,450" inputMode="numeric" className="num h-12 rounded-[var(--radius)] border border-border bg-surface px-3 font-display text-lg font-bold text-fg" />
          </label>
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-success">Matches. No difference.</p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setClose(false)}>Not yet</Button>
          <Button variant="primary" onClick={() => { setClose(false); toast("Day closed. Summary sent to the owner's email."); }}><Lock />Lock today</Button>
        </div>
      </Dialog>
    </div>
  );
}

function Legend({ c, l, dashed }: { c: string; l: string; dashed?: boolean }) {
  return <span className="flex items-center gap-1.5"><span className={cn("h-0.5 w-4", dashed && "border-t-2 border-dashed bg-transparent")} style={dashed ? { borderColor: c } : { background: c, height: 3 }} />{l}</span>;
}

function Attention({ Icon, tone, title, body }: { Icon: typeof Receipt; tone: "coral" | "warning"; title: string; body: string }) {
  return (
    <li className="flex items-center gap-3 rounded-[var(--radius)] border border-border p-3">
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", tone === "coral" ? "bg-coral-soft text-coral-strong" : "bg-warning-soft text-warning-strong")}><Icon className="size-4" aria-hidden /></span>
      <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-fg">{title}</p><p className="truncate text-[12px] text-fg-2">{body}</p></div>
      <Button size="sm" onClick={() => toast(`${title.split(" ")[0]} handled`)}>Handle</Button>
    </li>
  );
}
