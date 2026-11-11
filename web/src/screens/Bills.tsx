"use client";
import * as React from "react";
import { Download, ScrollText, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, Input, Segmented, Skeleton } from "@/components/ui/primitives";
import { Sheet, toast } from "@/components/ui/overlay";
import { rpc } from "@/lib/api";
import type { BillRow } from "@/lib/types";
import { inr } from "@/lib/utils";

const ist = (d: Date) => new Date(d.getTime() + 330 * 60000).toISOString().slice(0, 10);   // the database counts days in India time
const METHOD: Record<string, string> = { upi: "UPI", card: "Card", cash: "Cash", mixed: "Mixed" };
type Range = "today" | "yesterday" | "week" | "custom";

export function BillsScreen() {
  const [range, setRange] = React.useState<Range>("today");
  const [from, setFrom] = React.useState(ist(new Date()));
  const [to, setTo] = React.useState(ist(new Date()));
  const [rows, setRows] = React.useState<BillRow[] | null>(null);
  const [open, setOpen] = React.useState<BillRow | null>(null);

  React.useEffect(() => {
    const now = new Date(), day = 864e5;
    if (range === "today") { setFrom(ist(now)); setTo(ist(now)); }
    if (range === "yesterday") { setFrom(ist(new Date(+now - day))); setTo(ist(new Date(+now - day))); }
    if (range === "week") { setFrom(ist(new Date(+now - 6 * day))); setTo(ist(now)); }
  }, [range]);
  React.useEffect(() => {
    setRows(null);
    rpc<BillRow[]>("staff_bills", { p_from: from, p_to: to }).then(setRows).catch(e => { toast((e as Error).message, "error"); setRows([]); });
  }, [from, to]);

  const paid = rows?.filter(r => r.status === "paid") ?? [];
  const total = paid.reduce((s, r) => s + Number(r.total), 0);
  const download = () => {
    const esc = (x: unknown) => `"${String(x ?? "").replace(/"/g, '""')}"`;
    const csv = [["Table", "Opened", "Paid at", "Status", "Method", "Total", "Tip", "Guests", "Reference", "Closed by", "Reason", "Rating"].join(","),
      ...(rows ?? []).map(r => [r.table, new Date(r.opened_at).toLocaleString("en-IN"), r.paid_at ? new Date(r.paid_at).toLocaleString("en-IN") : "", r.status,
        r.method ? METHOD[r.method] : "", r.total, r.tip, r.guests, r.ref, r.by, r.void_reason, r.stars].map(esc).join(","))].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `bills-${from}${from !== to ? `-to-${to}` : ""}.csv`; a.click();
  };

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<Range> value={range} onChange={setRange} options={[{ value: "today", label: "Today" }, { value: "yesterday", label: "Yesterday" }, { value: "week", label: "Last 7 days" }, { value: "custom", label: "Pick dates" }]} />
        {range === "custom" && <>
          <Input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} className="w-auto" aria-label="From" />
          <Input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} className="w-auto" aria-label="To" />
        </>}
        <Button className="ml-auto" disabled={!rows?.length} onClick={download}><Download />Download</Button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[["Bills paid", String(paid.length)], ["Money in", inr(total)], ["Cleared", String((rows?.length ?? 0) - paid.length)]].map(([l, v]) => (
          <Card key={l} className="p-4"><p className="text-[13px] font-semibold text-fg-2">{l}</p><p className="num mt-1 font-display text-2xl font-extrabold text-fg">{rows ? v : "–"}</p></Card>
        ))}
      </div>
      {!rows ? <Skeleton className="h-64" /> : rows.length === 0 ? <Card><EmptyState icon={<ScrollText />} title="No bills in these dates" body="Bills appear here as soon as they're paid or cleared." /></Card> : (
        <Card className="divide-y divide-border">
          {rows.map(r => (
            <button key={r.id} onClick={() => setOpen(r)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-muted/50">
              <span className="font-display w-12 text-lg font-extrabold text-fg">{r.table}</span>
              <span className="min-w-0 flex-1 text-[13px] text-fg-2">
                {new Date(r.paid_at ?? r.opened_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                {r.by ? ` · ${r.by}` : ""}{r.ref ? ` · ref ${r.ref}` : ""}
              </span>
              {r.stars && <span className="hidden items-center gap-0.5 text-[13px] text-fg-2 sm:flex"><Star className="size-3.5 fill-coral text-coral" aria-hidden />{r.stars}</span>}
              {r.status === "paid" ? <Badge tone="success">{r.method ? METHOD[r.method] : "Paid"}</Badge> : <Badge tone="danger">Cleared</Badge>}
              <span className="num w-20 text-right text-sm font-bold text-fg">{r.status === "paid" ? inr(r.total) : "–"}</span>
            </button>
          ))}
        </Card>
      )}
      <Sheet open={!!open} onOpenChange={o => !o && setOpen(null)} title={open ? `Table ${open.table}` : ""}
        description={open ? new Date(open.paid_at ?? open.opened_at).toLocaleString("en-IN") : undefined}>
        {open && (
          <div className="grid gap-4 text-sm">
            {open.status === "void" && <p className="rounded-[var(--radius)] bg-danger-soft px-3 py-2 font-semibold text-danger">Cleared without payment: {open.void_reason}</p>}
            <ul className="grid gap-1">{open.bill.lines.map((l, i) => <li key={i} className="flex justify-between text-fg"><span><span className="num">{l.qty}×</span> {l.name}{l.size && ` · ${l.size}`}</span><span className="num">{inr(l.amount)}</span></li>)}</ul>
            <dl className="grid gap-1 border-t border-border pt-3 text-[13px]">
              <Row k="Items" v={inr(open.bill.subtotal, { paise: true })} />
              {open.bill.service > 0 && <Row k={`Service ${open.bill.service_pct}%`} v={inr(open.bill.service, { paise: true })} />}
              <Row k={`GST ${open.bill.gst_pct}%`} v={inr(open.bill.gst, { paise: true })} />
              {open.bill.tip > 0 && <Row k={`Tip ${open.bill.tip_pct}%`} v={inr(open.bill.tip)} />}
              <div className="flex justify-between pt-1 text-base font-extrabold"><dt className="text-fg">Total</dt><dd className="num text-fg">{inr(open.bill.grand)}</dd></div>
            </dl>
            <dl className="grid gap-1 rounded-[var(--radius)] bg-muted p-3 text-[13px]">
              {open.method && <Row k="Paid by" v={METHOD[open.method]} />}
              {open.ref && <Row k="Reference" v={open.ref} />}
              {open.by && <Row k="Closed by" v={open.by} />}
              {open.guests ? <Row k="Guests" v={String(open.guests)} /> : null}
              {open.stars ? <Row k="Guest rating" v={`${open.stars} of 5`} /> : null}
            </dl>
          </div>
        )}
      </Sheet>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-3"><dt className="text-fg-2">{k}</dt><dd className="num text-right font-semibold text-fg">{v}</dd></div>;
}
