"use client";
/* Close the day (cash count) and the team notice — both live on Today for owner and manager. */
import * as React from "react";
import { Lock, LockOpen, Megaphone, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader, Field, Input, Skeleton, Textarea } from "@/components/ui/primitives";
import { Dialog, toast } from "@/components/ui/overlay";
import { rpc } from "@/lib/api";
import { useAction, useStaff } from "@/lib/staff";
import type { DaySummary } from "@/lib/types";
import { cn, inr } from "@/lib/utils";

const money = (s: string) => s.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
const dayName = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

export function CloseDayCard() {
  const { live, can } = useStaff();
  const [open, setOpen] = React.useState(false);
  const [sum, setSum] = React.useState<DaySummary | null>(null);
  const closed = !!live?.settings.day_closed;
  const bills = live?.today.bills ?? 0;
  const load = React.useCallback(() => rpc<DaySummary>("staff_day_summary", {}).then(setSum).catch(e => toast((e as Error).message, "error")), []);
  React.useEffect(() => { load(); }, [load, closed, bills]);

  return (
    <Card className="flex flex-col">
      <CardHeader title="Close the day" sub="Count the cash drawer and lock today's sales"
        action={closed ? <Badge tone="success"><Lock aria-hidden />Closed</Badge> : undefined} />
      {!sum ? <div className="grid gap-2 px-5 pb-5"><Skeleton className="h-8" /><Skeleton className="h-8" /></div> : (
        <div className="grid gap-3 px-5 pb-5">
          <dl className="grid grid-cols-3 gap-2 text-center">
            {(["cash", "upi", "card"] as const).map(m => (
              <div key={m} className="rounded-[var(--radius)] border border-border p-2.5">
                <dt className="text-[12px] text-fg-2">{m === "upi" ? "UPI" : m === "card" ? "Card" : "Cash"}</dt>
                <dd className="num font-display text-base font-extrabold text-fg">{inr(sum.methods[m])}</dd>
              </div>
            ))}
          </dl>
          {sum.closed ? (
            <p className="text-[13px] text-fg-2">Closed by {sum.closed.closed_by_name || "someone"} at {new Date(sum.closed.closed_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}.
              {" "}Cash counted {inr(sum.closed.counted)} · <Diff d={sum.closed.difference} /></p>
          ) : sum.open > 0 ? (
            <p className="text-[13px] text-fg-2">{sum.open} bill{sum.open > 1 ? "s are" : " is"} still open. Close {sum.open > 1 ? "them" : "it"} before closing the day.</p>
          ) : <p className="text-[13px] text-fg-2">{sum.bills} bill{sum.bills === 1 ? "" : "s"} today{sum.discounts > 0 ? ` · ${inr(sum.discounts)} in discounts` : ""}.</p>}
          <Button className="mt-auto" variant={sum.closed ? "secondary" : "ink"} onClick={() => setOpen(true)} disabled={!sum.closed && !can("manage")}>
            {sum.closed ? <><Wallet />See the count</> : <><Lock />Close the day</>}
          </Button>
          {sum.recent.filter(c => c.day !== sum.day).length > 0 && (
            <details className="text-[13px]">
              <summary className="cursor-pointer font-semibold text-fg-2">Earlier days</summary>
              <ul className="mt-2 grid gap-1">
                {sum.recent.filter(c => c.day !== sum.day).map(c => (
                  <li key={c.id} className="flex justify-between gap-2"><span className="text-fg">{dayName(c.day)}</span>
                    <span className="num text-fg-2">{inr(c.sales)} · <Diff d={c.difference} /></span></li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      {sum && <CloseDayDialog open={open} onOpenChange={setOpen} sum={sum} onDone={load} />}
    </Card>
  );
}

function Diff({ d }: { d: number }) {
  return <span className={cn("font-semibold", d === 0 ? "text-success" : d > 0 ? "text-blue" : "text-danger")}>
    {d === 0 ? "matches" : d > 0 ? `${inr(d, { paise: d % 1 !== 0 })} extra` : `${inr(-d, { paise: d % 1 !== 0 })} short`}</span>;
}

function CloseDayDialog({ open, onOpenChange, sum, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; sum: DaySummary; onDone: () => void }) {
  const { can } = useStaff();
  const { run, pending } = useAction();
  const [opening, setOpening] = React.useState("");
  const [paidOut, setPaidOut] = React.useState("");
  const [counted, setCounted] = React.useState("");
  const [note, setNote] = React.useState("");
  const [reason, setReason] = React.useState("");
  React.useEffect(() => { if (open) { setOpening(""); setPaidOut(""); setCounted(""); setNote(""); setReason(""); } }, [open]);
  const c = sum.closed;
  const expected = Math.round(((Number(opening) || 0) + sum.methods.cash - (Number(paidOut) || 0)) * 100) / 100;
  const diff = counted === "" ? null : Math.round((Number(counted) - expected) * 100) / 100;

  if (c) return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`${dayName(c.day)} is closed`} description="The numbers saved when the day was closed.">
      <dl className="grid gap-1.5 text-[13px]">
        <Line k="Opening cash" v={inr(c.opening_cash, { paise: true })} />
        <Line k="Cash taken" v={`+ ${inr(c.cash_sales, { paise: true })}`} />
        <Line k="Paid out" v={`− ${inr(c.paid_out, { paise: true })}`} />
        <Line k="Expected in the drawer" v={inr(c.expected, { paise: true })} strong />
        <Line k="Counted" v={inr(c.counted, { paise: true })} strong />
        <div className="flex justify-between"><dt className="text-fg-2">Difference</dt><dd className="num"><Diff d={c.difference} /></dd></div>
        <div className="mt-2 border-t border-border pt-2" />
        <Line k="UPI" v={inr(c.upi_sales, { paise: true })} /><Line k="Card" v={inr(c.card_sales, { paise: true })} />
        <Line k={`Sales (${c.bills} bills)`} v={inr(c.sales, { paise: true })} />
        {c.discounts > 0 && <Line k="Discounts given" v={inr(c.discounts, { paise: true })} />}
        {c.note && <p className="mt-1 rounded-[var(--radius-sm)] bg-muted px-3 py-2 text-fg">{c.note}</p>}
      </dl>
      {can("own") && (
        <div className="mt-4 grid gap-2 border-t border-border pt-4">
          <Field label="Reopen the day" hint="Only if a bill came in after closing, or the count was wrong. The old numbers stay in the activity history.">
            <Input value={reason} onChange={e => setReason(e.target.value)} maxLength={120} placeholder="Why (for example: late table)" />
          </Field>
          <Button disabled={pending || reason.trim().length < 3} onClick={async () => {
            const ok = await run(() => rpc("owner_reopen_day", { p_day: c.day, p_reason: reason.trim() }).then(() => true), "Day reopened");
            if (ok) { onDone(); onOpenChange(false); } }}><LockOpen />Reopen day</Button>
        </div>
      )}
    </Dialog>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Close ${dayName(sum.day)}`} description="Count the cash in the drawer. Once closed, no more orders or payments can be taken today.">
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Opening cash (₹)" hint="In the drawer this morning">
            <Input inputMode="decimal" value={opening} onChange={e => setOpening(money(e.target.value))} className="num" placeholder="0" />
          </Field>
          <Field label="Paid out (₹)" hint="Cash taken out for buying things">
            <Input inputMode="decimal" value={paidOut} onChange={e => setPaidOut(money(e.target.value))} className="num" placeholder="0" />
          </Field>
        </div>
        <dl className="grid gap-1 rounded-[var(--radius)] bg-muted px-4 py-3 text-[13px]">
          <Line k="Cash taken today" v={inr(sum.methods.cash, { paise: true })} />
          <Line k="Expected in the drawer" v={inr(expected, { paise: true })} strong />
        </dl>
        <Field label="Cash counted (₹)">
          <Input inputMode="decimal" value={counted} onChange={e => setCounted(money(e.target.value))} className="num h-12 font-display text-lg font-bold" placeholder="Count the drawer" aria-label="Cash counted" />
        </Field>
        {diff !== null && <p className="text-sm">Difference: <Diff d={diff} /></p>}
        <Field label="Note (optional)"><Textarea value={note} onChange={e => setNote(e.target.value)} maxLength={300} className="min-h-16" placeholder="Anything the owner should know" /></Field>
        {sum.open > 0 && <p className="rounded-[var(--radius)] bg-warning-soft px-3 py-2 text-[13px] font-semibold text-warning-strong">{sum.open} bill{sum.open > 1 ? "s are" : " is"} still open. Take payment or clear {sum.open > 1 ? "them" : "it"} first.</p>}
        <Button size="xl" variant="primary" disabled={pending || counted === "" || sum.open > 0} onClick={async () => {
          const ok = await run(() => rpc("staff_close_day", { p_day: sum.day, p_opening: Number(opening) || 0, p_paid_out: Number(paidOut) || 0, p_counted: Number(counted), p_note: note.trim() }).then(() => true), "Day closed");
          if (ok) { onDone(); onOpenChange(false); } }}><Lock />Close the day</Button>
      </div>
    </Dialog>
  );
}

function Line({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return <div className="flex justify-between"><dt className="text-fg-2">{k}</dt><dd className={cn("num text-fg", strong && "font-bold")}>{v}</dd></div>;
}

export function NoticeCard() {
  const { live } = useStaff();
  const { run, pending } = useAction();
  const cur = live?.settings.notice?.text ?? "";
  const [text, setText] = React.useState(cur);
  React.useEffect(() => { setText(cur); }, [cur]);
  return (
    <Card className="flex flex-col">
      <CardHeader title="Team notice" sub="Shown at the top of every staff screen" />
      <div className="grid flex-1 gap-2 px-5 pb-5">
        <Textarea value={text} onChange={e => setText(e.target.value)} maxLength={300} aria-label="Team notice" className="min-h-20"
          placeholder="For example: Biryani is off tonight. Staff meal at 4 pm." />
        <div className="mt-auto flex items-center gap-2">
          <span className="num mr-auto text-[12px] text-fg-2">{text.length}/300</span>
          {cur && <Button variant="ghost" disabled={pending} onClick={() => run(() => rpc("staff_set_notice", { p_text: "" }), "Notice taken down")}>Take down</Button>}
          <Button variant="ink" disabled={pending || text.trim() === cur || !text.trim()} onClick={() => run(() => rpc("staff_set_notice", { p_text: text }), "Notice posted")}>
            <Megaphone />{cur ? "Update" : "Post"}</Button>
        </div>
      </div>
    </Card>
  );
}
