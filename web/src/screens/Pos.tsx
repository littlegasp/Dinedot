"use client";
import * as React from "react";
import { Banknote, ChefHat, CreditCard, HandPlatter, Printer, Layers, Minus, Percent, Plus, Search, ShoppingBag, Smartphone, Trash2, UtensilsCrossed, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, Diet, EmptyState, Field, Input, Segmented, Skeleton } from "@/components/ui/primitives";
import { Dialog, toast } from "@/components/ui/overlay";
import { TableStatus, tableState, visitLabel, visitOf } from "@/components/ui/status";
import { newRequestId, rpc } from "@/lib/api";
import { useAction, useStaff } from "@/lib/staff";
import type { Bill, CartLine, LiveVisit, MenuItem, PayPart, StaffMenu } from "@/lib/types";
import { cn, inr, tipLabel } from "@/lib/utils";
import { ReceiptDialog } from "./ReceiptDialog";
import { celebrate } from "@/lib/motion";
import { enqueue, isOffline, useOutbox } from "@/lib/outbox";

export function PosScreen({ tableId, setTableId, payNow }: { tableId: string | null; setTableId: (id: string) => void; payNow: boolean }) {
  const { live, can, me, reload } = useStaff();
  const { run, pending } = useAction();
  const { jobs, retry } = useOutbox(me?.restaurant_id, (m, ok) => { toast(m, ok ? undefined : "error"); reload(); });
  const [sending, setSending] = React.useState(false);
  const [menu, setMenu] = React.useState<StaffMenu | null>(null);
  const [cat, setCat] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [note, setNote] = React.useState("");
  const [pick, setPick] = React.useState<MenuItem | null>(null);
  const [pay, setPay] = React.useState(false);
  const [disc, setDisc] = React.useState(false);
  const [receiptFor, setReceiptFor] = React.useState<string | null>(null);
  const request = React.useRef<string | null>(null);   // kept across retries of the same send

  const loadMenu = React.useCallback(() => rpc<StaffMenu>("staff_menu").then(setMenu).catch(e => toast((e as Error).message, "error")), []);
  React.useEffect(() => { loadMenu(); }, [loadMenu]);
  React.useEffect(() => { request.current = null; }, [cart, note, tableId]);
  React.useEffect(() => { if (payNow) setPay(true); }, [payNow]);

  if (!live || !menu) return <div className="grid gap-4 xl:grid-cols-[1fr_400px]"><Skeleton className="h-[520px]" /><Skeleton className="h-[520px]" /></div>;

  const tables = live.tables.filter(t => t.active);
  // ?table= holds a table id, "takeaway" for a new token, or the visit id of an open takeaway token
  const tokens = live.visits.filter(v => v.kind === "takeaway");
  const token = tokens.find(v => v.id === tableId);
  const takeaway = tableId === "takeaway" || !!token;
  const table = takeaway ? null : tables.find(t => t.id === tableId) ?? null;
  const visit: LiveVisit | undefined = token ?? (table ? visitOf(table, live.visits) : undefined);
  const name = token ? `Token ${token.token}` : takeaway ? "New takeaway" : table ? `Table ${table.code}` : "";
  const paidTakeaway = token?.status === "paid";
  const activeCats = menu.categories.filter(c => c.active);
  const items = menu.items.filter(i => activeCats.some(c => c.id === i.category_id) && (cat === "all" || i.category_id === cat)
    && i.name.toLowerCase().includes(q.trim().toLowerCase()));
  const cartTotal = cart.reduce((s, l) => s + l.unit * l.qty, 0);
  const count = cart.reduce((s, l) => s + l.qty, 0);

  const add = (i: MenuItem, size?: { name: string; price: number }, addons: { name: string; price: number }[] = []) => {
    const unit = (size?.price ?? i.price) + addons.reduce((s, a) => s + Number(a.price), 0);
    const key = [i.id, size?.name ?? "", ...addons.map(a => a.name).sort()].join("|");
    setCart(c => c.some(l => l.key === key) ? c.map(l => l.key === key ? { ...l, qty: l.qty + 1 } : l)
      : [...c, { key, id: i.id, name: i.name, qty: 1, size: size?.name, addons: addons.map(a => a.name), unit }]);
  };
  const tap = (i: MenuItem) => !i.available ? toast(`${i.name} is sold out`, "error") : (i.sizes.length || i.addons.length) ? setPick(i) : add(i);
  const qty = (key: string, n: number) => setCart(c => c.flatMap(l => l.key !== key ? [l] : l.qty + n <= 0 ? [] : [{ ...l, qty: l.qty + n }]));

  const send = async () => {
    if (!table && !takeaway) return toast("Pick a table first", "error");
    request.current ??= newRequestId();
    const p_items = cart.map(l => ({ id: l.id, qty: l.qty, size: l.size ?? "", addons: l.addons ?? [] }));
    const fn = takeaway ? "staff_takeaway_order" as const : "staff_add_order" as const;
    const args = takeaway ? { p_visit: token?.id ?? null, p_items, p_note: note.trim(), p_request_id: request.current }
                          : { p_table: table!.id, p_items, p_note: note.trim(), p_request_id: request.current };
    const where = takeaway ? (token ? `Token ${token.token}` : "New takeaway") : table!.code;
    setSending(true);
    try {
      const r = await rpc<{ visit_id: string; token?: number }>(fn, args);
      setCart([]); setNote("");
      toast(`Sent to the kitchen · ${takeaway ? `Token ${r.token}` : where}`);
      if (takeaway && !token) setTableId(r.visit_id);
      reload();
    } catch (e) {
      if (isOffline(e) && me?.restaurant_id) {
        // keep it on this device; it goes out by itself when the connection is back (same request id = saved once)
        enqueue({ id: request.current!, fn, args, label: where, restaurant: me.restaurant_id, at: new Date().toISOString() });
        setCart([]); setNote("");
        toast(`No internet. The order for ${where} is saved on this device and will be sent when the connection is back.`);
      } else toast((e as Error).message, "error");
    } finally { setSending(false); }
  };
  const handOver = () => run(async () => {
    for (const o of token!.orders.filter(o => o.status === "ready")) await rpc("staff_order_status", { p_order: o.id, p_status: "served" });
  }, `Token ${token!.token} handed over`);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="min-w-0">
        {/* Tables */}
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0" role="radiogroup" aria-label="Table">
          <button role="radio" aria-checked={tableId === "takeaway"} onClick={() => setTableId("takeaway")}
            className={cn("flex h-12 shrink-0 items-center gap-1.5 rounded-[var(--radius)] border border-dashed border-border-strong bg-surface px-3 text-sm font-bold text-fg",
              tableId === "takeaway" && "border-solid border-ink bg-ink text-surface")}><ShoppingBag className="size-4" aria-hidden />Takeaway</button>
          {tokens.map(v => { const ready = v.orders.some(o => o.status === "ready"); return (
            <button key={v.id} role="radio" aria-checked={v.id === tableId} aria-label={`Token ${v.token}${v.status === "paid" ? ", paid" : ""}${ready ? ", ready" : ""}`} onClick={() => setTableId(v.id)}
              className={cn("flex h-12 shrink-0 items-center gap-2 rounded-[var(--radius)] border border-border bg-surface px-3 text-sm font-bold text-fg",
                v.id === tableId && "border-ink bg-ink text-surface")}>
              #{v.token}<span className={cn("size-2 rounded-full", ready ? "bg-success" : v.status === "paid" ? "bg-blue" : "bg-warning")} aria-hidden />
            </button>
          ); })}
          {tables.map(t => { const st = tableState(visitOf(t, live.visits)); return (
            <button key={t.id} role="radio" aria-checked={t.id === tableId} onClick={() => setTableId(t.id)}
              className={cn("flex h-12 shrink-0 items-center gap-2 rounded-[var(--radius)] border border-border bg-surface px-3 text-sm font-bold text-fg",
                t.id === tableId && "border-ink bg-ink text-surface")}>
              {t.code}<span className={cn("size-2 rounded-full", st === "free" ? "bg-border-strong" : st === "bill" ? "bg-coral" : st === "ordered" ? "bg-warning" : "bg-success")} aria-hidden />
            </button>
          ); })}
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="-mx-4 flex min-w-0 flex-1 gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0" role="tablist" aria-label="Sections">
            {[{ id: "all", name: "All" }, ...activeCats].map(c => (
              <button key={c.id} role="tab" aria-selected={cat === c.id} onClick={() => setCat(c.id)}
                className={cn("h-10 shrink-0 rounded-full border border-border bg-surface px-4 text-sm font-semibold text-fg-2", cat === c.id && "border-ink bg-ink text-surface")}>{c.name}</button>
            ))}
          </div>
          <div className="relative w-full sm:w-60">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-2" aria-hidden />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a dish" className="h-10 pl-9" aria-label="Find a dish" />
          </div>
        </div>
        {items.length === 0 ? <Card><EmptyState icon={<UtensilsCrossed />} title="No dishes here" body="Try another section, or add dishes in Menu." /></Card> : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
            {items.map(i => (
              <button key={i.id} onClick={() => tap(i)} disabled={!i.available}
                className="group relative overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface text-left shadow-[var(--shadow-sm)] transition hover:border-border-strong active:scale-[.98] disabled:opacity-55">
                {i.photo_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={i.photo_url} alt="" loading="lazy" className="aspect-[16/10] w-full object-cover" />
                  : <div className="grid aspect-[16/10] w-full place-items-center bg-muted text-fg-2"><UtensilsCrossed className="size-6" aria-hidden /></div>}
                {!i.available && <Badge className="absolute left-2 top-2 bg-danger text-white">Sold out</Badge>}
                <div className="p-3">
                  <div className="flex items-start gap-1.5"><Diet diet={i.diet} className="mt-0.5" /><span className="line-clamp-2 text-sm font-semibold leading-tight text-fg">{i.name}</span></div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="num text-sm font-bold text-fg">{inr(i.sizes[0]?.price ?? i.price)}{(i.sizes.length > 1) && <span className="font-normal text-fg-2">+</span>}</span>
                    <span className="grid size-7 place-items-center rounded-full bg-coral text-[#171b24]"><Plus className="size-4" aria-hidden /></span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {count > 0 && (
        <button onClick={() => document.getElementById("ticket")?.scrollIntoView({ behavior: "smooth" })}
          className="fixed inset-x-4 bottom-[76px] z-20 flex h-12 items-center gap-3 rounded-[var(--radius-lg)] bg-ink px-4 text-surface shadow-[var(--shadow)] xl:hidden">
          <span className="num text-sm font-semibold">{count} new item{count > 1 ? "s" : ""}</span>
          <span className="num ml-auto font-display font-extrabold">{inr(cartTotal)} · View</span>
        </button>
      )}

      <Card id="ticket" className="flex scroll-mt-20 flex-col xl:sticky xl:top-20 xl:max-h-[calc(100dvh-104px)]">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-extrabold text-fg">{name || "Pick a table"}</h2>
            <p className="text-[12px] text-fg-2">{takeaway
              ? (token ? `Takeaway · ${token.orders.length} order${token.orders.length === 1 ? "" : "s"}${paidTakeaway ? " · paid" : ""}` : "A token number is given when you tap Send")
              : table ? (visit ? `${visit.guests ? `${visit.guests} guests · ` : ""}${visit.orders.length} order${visit.orders.length === 1 ? "" : "s"} so far` : "Free table") : "Choose a table or Takeaway above to start"}</p>
          </div>
          {visit && !takeaway && <TableStatus state={tableState(visit)} />}
          {token && <Badge tone={paidTakeaway ? "blue" : "warning"}><ShoppingBag aria-hidden />{paidTakeaway ? "Paid" : "Takeaway"}</Badge>}
        </div>
        {jobs.length > 0 && (
          <div role="status" className="flex items-center gap-2 border-b border-border bg-warning-soft px-5 py-2 text-[13px] font-semibold text-warning-strong">
            <span className="flex-1">{jobs.length} order{jobs.length > 1 ? "s" : ""} waiting for the connection: {jobs.map(j => j.label).join(", ")}</span>
            <button className="underline underline-offset-2" onClick={() => retry()}>Try now</button>
          </div>
        )}
        <div className="flex-1 overflow-auto px-5">
          {visit && visit.bill.lines.length > 0 && (
            <div className="border-b border-dashed border-border py-3">
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-fg-2">Already ordered</p>
              <ul className="grid gap-1 text-[13px]">
                {visit.bill.lines.map((l, i) => <li key={i} className="flex justify-between text-fg-2"><span><span className="num">{l.qty}×</span> {l.name}{l.size && ` · ${l.size}`}</span><span className="num">{inr(l.amount)}</span></li>)}
              </ul>
            </div>
          )}
          {cart.length === 0 ? <EmptyState icon={<UtensilsCrossed />} title="No new items" body="Tap a dish to add it, then Send to kitchen." /> : (
            <ul className="divide-y divide-border">
              {cart.map(l => (
                <li key={l.key} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-fg">{l.name}</p>
                    <p className="num text-[12px] text-fg-2">{[l.size, ...(l.addons ?? [])].filter(Boolean).join(", ")}{(l.size || l.addons?.length) ? " · " : ""}{inr(l.unit)}</p>
                  </div>
                  <div className="flex items-center rounded-[var(--radius)] border border-border">
                    <button aria-label={`One less ${l.name}`} onClick={() => qty(l.key, -1)} className="grid size-9 place-items-center text-fg-2 hover:text-fg"><Minus className="size-4" /></button>
                    <span className="num w-6 text-center text-sm font-bold text-fg">{l.qty}</span>
                    <button aria-label={`One more ${l.name}`} onClick={() => qty(l.key, 1)} className="grid size-9 place-items-center text-fg-2 hover:text-fg"><Plus className="size-4" /></button>
                  </div>
                  <span className="num w-16 text-right text-sm font-semibold text-fg">{inr(l.unit * l.qty)}</span>
                </li>
              ))}
            </ul>
          )}
          {paidTakeaway && <p className="mt-3 rounded-[var(--radius)] bg-blue-soft px-3 py-2 text-[13px] font-semibold text-fg">Paid. {token!.orders.some(o => o.status === "ready") ? "Ready to hand over." : "Waiting for the kitchen."}</p>}
          {cart.length > 0 && <Input value={note} onChange={e => setNote(e.target.value)} maxLength={300} placeholder="Note for the kitchen (less spicy, no onion…)" className="mb-3" aria-label="Note for the kitchen" />}
        </div>
        <div className="border-t border-border px-5 py-4">
          {visit && (
            <dl className="mb-3 grid gap-1 text-[13px]">
              <Row k="Items" v={inr(visit.bill.subtotal, { paise: true })} />
              {(visit.bill.discount ?? 0) > 0 && <Row k={<span>Discount{visit.bill.discount_kind === "pct" ? ` ${visit.bill.discount_value}%` : ""}<span className="block text-[11px]">{visit.bill.discount_reason}</span></span>}
                v={`− ${inr(visit.bill.discount!, { paise: true })}`} />}
              {visit.bill.service > 0 && <Row k={`Service ${visit.bill.service_pct}%`} v={inr(visit.bill.service, { paise: true })} />}
              <Row k={`GST ${visit.bill.gst_pct}%`} v={inr(visit.bill.gst, { paise: true })} />
              {visit.bill.tip > 0 && <Row k={tipLabel(visit.bill)} v={inr(visit.bill.tip)} />}
            </dl>
          )}
          <div className="flex items-baseline justify-between border-t border-dashed border-border pt-3">
            <span className="font-display text-base font-bold text-fg">{visit ? "Bill" : "New items"}</span>
            <span className="num font-display text-[28px] font-extrabold text-fg">{inr(visit ? visit.bill.grand : cartTotal)}</span>
          </div>
          {cart.length > 0 && visit && <p className="num text-right text-[12px] text-fg-2">+ {inr(cartTotal)} once sent (before tax)</p>}
          {paidTakeaway ? (
            <Button size="xl" variant="success" className="mt-3 w-full" disabled={pending || !token!.orders.some(o => o.status === "ready")} onClick={handOver}><HandPlatter />Handed over</Button>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button size="xl" variant="ink" disabled={!cart.length || (!table && !takeaway) || pending || sending} onClick={send}><ChefHat />Send</Button>
              <Button size="xl" variant="primary" disabled={!visit || pending} onClick={() => setPay(true)}>Take payment</Button>
            </div>
          )}
          <div className="mt-2 flex items-center gap-3">
            {cart.length > 0 && <button className="flex items-center gap-1 text-[12px] font-semibold text-fg-2" onClick={() => setCart([])}><Trash2 className="size-3.5" />Clear new items</button>}
            {visit && visit.bill.subtotal > 0 && (
              <button className="flex items-center gap-1 text-[12px] font-semibold text-fg-2" onClick={() => setReceiptFor(visit.id)}><Printer className="size-3.5" />Print bill</button>)}
            {visit && !paidTakeaway && can("manage") && visit.bill.subtotal > 0 && (
              <button className="ml-auto flex items-center gap-1 text-[12px] font-semibold text-blue" onClick={() => setDisc(true)}><Percent className="size-3.5" />{(visit.bill.discount ?? 0) > 0 ? "Change discount" : "Discount"}</button>)}
          </div>
        </div>
      </Card>

      <Dialog open={!!pick} onOpenChange={o => !o && setPick(null)} title={pick?.name ?? ""} description="Choose a size and any extras.">
        {pick && <Picker i={pick} onAdd={(s, a) => { add(pick, s, a); setPick(null); }} />}
      </Dialog>
      {visit && !paidTakeaway && <PayDialog open={pay} onOpenChange={setPay} visit={visit} label={visitLabel(visit, live.tables)} canEdit={can("floor")} onPaid={setReceiptFor} />}
      <ReceiptDialog open={!!receiptFor} onOpenChange={o => !o && setReceiptFor(null)} visitId={receiptFor} />
      {visit && !paidTakeaway && <DiscountDialog open={disc} onOpenChange={setDisc} visit={visit} limit={live.settings.max_discount_pct} owner={can("own")} />}
    </div>
  );
}

function Row({ k, v }: { k: React.ReactNode; v: string }) {
  return <div className="flex justify-between"><dt className="text-fg-2">{k}</dt><dd className="num font-semibold text-fg">{v}</dd></div>;
}

function Choice({ on, onClick, label, price }: { on: boolean; onClick: () => void; label: string; price?: string }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={cn("flex h-14 items-center justify-between gap-2 rounded-[var(--radius)] border border-border px-4 text-sm font-semibold text-fg", on && "border-blue bg-blue-soft ring-1 ring-blue")}>
      {label}{price && <span className="num text-fg-2">{price}</span>}
    </button>
  );
}

function Picker({ i, onAdd }: { i: MenuItem; onAdd: (s?: { name: string; price: number }, a?: { name: string; price: number }[]) => void }) {
  const [size, setSize] = React.useState(i.sizes[i.sizes.length - 1]);
  const [addons, setAddons] = React.useState<{ name: string; price: number }[]>([]);
  const price = Number(size?.price ?? i.price) + addons.reduce((s, a) => s + Number(a.price), 0);
  return (
    <div className="grid gap-4">
      {i.sizes.length > 0 && <fieldset><legend className="mb-2 text-[13px] font-semibold text-fg">Size</legend>
        <div className="grid grid-cols-2 gap-2">{i.sizes.map(s => <Choice key={s.name} on={size?.name === s.name} onClick={() => setSize(s)} label={s.name} price={inr(s.price)} />)}</div></fieldset>}
      {i.addons.length > 0 && <fieldset><legend className="mb-2 text-[13px] font-semibold text-fg">Extras</legend>
        <div className="grid grid-cols-2 gap-2">{i.addons.map(a => { const on = addons.some(x => x.name === a.name); return (
          <Choice key={a.name} on={on} onClick={() => setAddons(on ? addons.filter(x => x.name !== a.name) : [...addons, a])} label={a.name} price={`+ ${inr(a.price)}`} />); })}</div></fieldset>}
      <Button size="xl" variant="primary" onClick={() => onAdd(size, addons)}>Add · {inr(price)}</Button>
    </div>
  );
}

type Single = "upi" | "card" | "cash";
const METHODS: { m: Single | "split"; label: string; Icon: typeof Smartphone }[] = [
  { m: "upi", label: "UPI / QR", Icon: Smartphone }, { m: "card", label: "Card", Icon: CreditCard },
  { m: "cash", label: "Cash", Icon: Banknote }, { m: "split", label: "Split", Icon: Layers },
];
const LABEL: Record<Single, string> = { upi: "UPI / QR", card: "Card", cash: "Cash" };
const amt = (s: string) => s.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
type Part = { method: Single; amount: string; reference: string };

function PayDialog({ open, onOpenChange, visit, label, canEdit, onPaid }: { open: boolean; onOpenChange: (o: boolean) => void; visit: LiveVisit; label: string; canEdit: boolean; onPaid: (visitId: string) => void }) {
  const { run, pending } = useAction();
  const { live } = useStaff();
  // the same methods and tip choices as the guest's phone (Settings); a method the guest already picked always shows
  const on = live?.settings.pay;
  const methods = METHODS.filter(x => x.m === "split" || !on || !(on.upi || on.card || on.cash) || on[x.m] || visit.pay_choice === x.m);
  const shown = methods.filter(x => x.m !== "split").length > 1 ? methods : methods.filter(x => x.m !== "split");
  const tipChoices = live?.settings.tip_options?.length ? live.settings.tip_options : [0, 5, 10];
  const [tipAmt, setTipAmt] = React.useState<string | null>(null);
  const [method, setMethod] = React.useState<Single | "split">("upi");
  const [ref, setRef] = React.useState("");
  const [given, setGiven] = React.useState("");
  const [parts, setParts] = React.useState<Part[]>([]);
  const b: Bill = visit.bill;
  React.useEffect(() => { if (open) { setMethod((visit.pay_choice || "upi") as Single); setRef(""); setGiven(""); setParts([]); } }, [open, visit.pay_choice]);
  // Split: start with two parts, the first half UPI and the rest cash
  React.useEffect(() => { if (method === "split" && parts.length === 0) {
    const half = Math.ceil(b.grand / 2); setParts([{ method: "upi", amount: String(half), reference: "" }, { method: "cash", amount: String(b.grand - half), reference: "" }]); } }, [method, parts.length, b.grand]);
  const kitchen = visit.kind === "dine_in" && visit.orders.some(o => o.status === "new" || o.status === "cooking");
  const amountTip = (b.tip_amount ?? 0) > 0;
  const update = (p: { p_split?: number; p_tip_pct?: number }) =>
    run(() => rpc("staff_visit_update", { p_visit: visit.id, p_split: p.p_split ?? visit.split, p_tip_pct: p.p_tip_pct ?? visit.tip_pct, p_guests: visit.guests,
      ...(p.p_tip_pct != null ? { p_tip_amount: 0 } : {}) }));
  const partSum = Math.round(parts.reduce((s, p) => s + (Number(p.amount) || 0), 0) * 100) / 100;
  const left = Math.round((b.grand - partSum) * 100) / 100;
  const setPart = (i: number, x: Partial<Part>) => setParts(ps => ps.map((p, j) => j === i ? { ...p, ...x } : p));
  const payload: PayPart[] = method === "split"
    ? parts.map(p => ({ method: p.method, amount: Number(p.amount) || 0, reference: p.method === "cash" ? "" : p.reference.trim() }))
    : [{ method, amount: b.grand, reference: method === "cash" ? "" : ref.trim() }];
  const ready = method !== "split" || (left === 0 && parts.every(p => Number(p.amount) > 0));

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Take payment · ${label}`} description="The total comes from the server. Each payment is saved with its method and reference.">
      <div className="rounded-[var(--radius)] bg-muted px-4 py-3">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold text-fg-2">To pay</span>
          <span className="num font-display text-[30px] font-extrabold text-fg">{inr(b.grand)}</span>
        </div>
        {(b.discount ?? 0) > 0 && <p className="num text-right text-[13px] text-fg-2">includes {inr(b.discount!, { paise: true })} discount</p>}
        {b.split > 1 && <p className="num text-right text-[13px] text-fg-2">{b.split} ways · {inr(b.each)} each</p>}
      </div>
      {visit.pay_choice && (
        <p className="mt-2 rounded-[var(--radius)] bg-blue-soft px-3 py-2 text-[13px] font-semibold text-fg">
          The guest chose {LABEL[visit.pay_choice as Single]}{b.tip > 0 ? ` · tip ${inr(b.tip)}` : ""}{b.split > 1 ? ` · ${b.split} ways` : ""} on their phone.
        </p>
      )}
      {canEdit && visit.kind === "dine_in" && (
        <div className="mt-3 grid grid-cols-2 gap-3 text-[13px]">
          <label className="grid gap-1"><span className="font-semibold text-fg">Split</span>
            <select value={visit.split} disabled={pending} onChange={e => update({ p_split: +e.target.value })} className="h-10 rounded-[var(--radius)] border border-border bg-surface px-2 text-fg">
              {Array.from({ length: 12 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n === 1 ? "One bill" : `${n} ways`}</option>)}
            </select></label>
          <label className="grid gap-1"><span className="font-semibold text-fg">Tip</span>
            <select value={tipAmt != null ? "new" : amountTip ? "amt" : visit.tip_pct} disabled={pending}
              onChange={e => { const v = e.target.value; if (v === "new") setTipAmt(""); else if (v !== "amt") { setTipAmt(null); update({ p_tip_pct: +v }); } }}
              className="h-10 rounded-[var(--radius)] border border-border bg-surface px-2 text-fg">
              {amountTip && <option value="amt">{inr(b.tip)}</option>}
              {(tipChoices.includes(visit.tip_pct) || amountTip ? tipChoices : [...tipChoices, visit.tip_pct].sort((x, y) => x - y)).map(n => <option key={n} value={n}>{n ? `${n}%` : "No tip"}</option>)}
              <option value="new">₹ Amount…</option>
            </select></label>
          {tipAmt != null && (
            <form className="col-span-2 flex gap-2" onSubmit={e => { e.preventDefault(); const a = Math.round(Number(tipAmt) || 0);
                run(() => rpc("staff_visit_update", { p_visit: visit.id, p_split: visit.split, p_tip_pct: 0, p_guests: visit.guests, p_tip_amount: a }).then(() => true), a ? `Tip ${inr(a)} added` : "Tip removed").then(ok => { if (ok) setTipAmt(null); }); }}>
              <Input aria-label="Tip amount" inputMode="numeric" autoFocus placeholder="e.g. 50" value={tipAmt} onChange={e => setTipAmt(e.target.value.replace(/\D/g, "").slice(0, 5))} />
              <Button type="submit" disabled={pending}>Set tip</Button>
            </form>
          )}
        </div>
      )}
      <div className="mt-4 grid gap-2" style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }}>
        {shown.map(({ m, label, Icon }) => (
          <button key={m} aria-pressed={method === m} onClick={() => setMethod(m)}
            className={cn("flex h-16 flex-col items-center justify-center gap-1 rounded-[var(--radius)] border border-border text-sm font-semibold text-fg", method === m && "border-blue bg-blue-soft ring-1 ring-blue")}>
            <Icon className="size-5" aria-hidden />{label}
          </button>
        ))}
      </div>
      {method === "split" ? (
        <div className="mt-3 grid gap-2">
          {parts.map((p, i) => (
            <div key={i} className="grid grid-cols-[96px_minmax(0,1fr)_auto] gap-2 rounded-[var(--radius)] border border-border p-2">
              <select value={p.method} aria-label={`Payment ${i + 1} method`} onChange={e => setPart(i, { method: e.target.value as Single })}
                className="h-10 rounded-[var(--radius)] border border-border bg-surface px-2 text-sm font-semibold text-fg">
                {(Object.keys(LABEL) as Single[]).map(m => <option key={m} value={m}>{LABEL[m]}</option>)}
              </select>
              <Input inputMode="decimal" value={p.amount} aria-label={`Payment ${i + 1} amount`} className="num font-bold" onChange={e => setPart(i, { amount: amt(e.target.value) })} />
              <Button size="icon" variant="ghost" aria-label={`Remove payment ${i + 1}`} disabled={parts.length <= 2} onClick={() => setParts(ps => ps.filter((_, j) => j !== i))}><X /></Button>
              {p.method !== "cash" && <Input className="col-span-3 h-9" value={p.reference} maxLength={60} aria-label={`Payment ${i + 1} reference`}
                placeholder={p.method === "upi" ? "UPI reference (UTR), optional" : "Card slip number, optional"} onChange={e => setPart(i, { reference: e.target.value })} />}
            </div>
          ))}
          <div className="flex items-center gap-2">
            {parts.length < 6 && <Button size="sm" variant="ghost" onClick={() => setParts(ps => [...ps, { method: "card", amount: left > 0 ? String(left) : "", reference: "" }])}><Plus />Add a payment</Button>}
            <span className={cn("num ml-auto text-sm font-semibold", left === 0 ? "text-success" : "text-danger")}>
              {left === 0 ? "Adds up" : left > 0 ? `${inr(left, { paise: true })} still to add` : `${inr(-left, { paise: true })} too much`}</span>
          </div>
        </div>
      ) : method === "cash" ? (
        <div className="mt-3 grid gap-1.5">
          <Input inputMode="numeric" value={given} onChange={e => setGiven(e.target.value.replace(/\D/g, ""))} placeholder="Cash handed over (optional)" aria-label="Cash handed over" className="num h-12 font-display text-lg font-bold" />
          {Number(given) > b.grand && <p className="text-sm font-semibold text-success">Give back {inr(Number(given) - b.grand)} in change.</p>}
          {given && Number(given) < b.grand && <p className="text-sm font-semibold text-danger">{inr(b.grand - Number(given))} still to collect.</p>}
        </div>
      ) : (
        <Input className="mt-3" value={ref} maxLength={60} onChange={e => setRef(e.target.value)}
          placeholder={method === "upi" ? "UPI reference (UTR), optional" : "Card slip number, optional"} aria-label="Payment reference" />
      )}
      {kitchen && <p className="mt-3 rounded-[var(--radius)] bg-warning-soft px-3 py-2 text-[13px] font-semibold text-warning-strong">Some dishes are still with the kitchen. Serve or cancel them before closing the bill.</p>}
      <Button size="xl" variant="primary" className="mt-4 w-full" disabled={pending || kitchen || !ready}
        onClick={async () => { const ok = await run(() => rpc("staff_pay", { p_visit: visit.id, p_parts: payload }).then(() => true),
          visit.kind === "takeaway" ? `Paid · ${label}` : `Paid · table ${label} is free`); if (ok) { onOpenChange(false); celebrate("Paid"); onPaid(visit.id); } }}>
        Mark paid · {inr(b.grand)}
      </Button>
    </Dialog>
  );
}

function DiscountDialog({ open, onOpenChange, visit, limit, owner }: { open: boolean; onOpenChange: (o: boolean) => void; visit: LiveVisit; limit: number; owner: boolean }) {
  const { run, pending } = useAction();
  const b = visit.bill;
  const [kind, setKind] = React.useState<"pct" | "amount">("pct");
  const [value, setValue] = React.useState("");
  const [reason, setReason] = React.useState("");
  React.useEffect(() => { if (open) { setKind(b.discount_kind ?? "pct"); setValue(b.discount_value ? String(b.discount_value) : ""); setReason(b.discount_reason ?? ""); } },
    [open, b.discount_kind, b.discount_value, b.discount_reason]);
  const v = Number(value) || 0;
  const off = kind === "pct" ? Math.round(b.subtotal * v) / 100 : Math.min(v, b.subtotal);
  const over = !owner && (kind === "pct" ? v > limit : off > Math.round(b.subtotal * limit) / 100);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Discount" description={owner ? "Comes off the items before GST. Saved in the activity history with the reason." : `Managers can take up to ${limit}% off. Saved in the activity history with the reason.`}>
      <div className="grid gap-4">
        <Segmented<"pct" | "amount"> value={kind} onChange={setKind} options={[{ value: "pct", label: "Percent" }, { value: "amount", label: "Amount (₹)" }]} />
        <div className="flex flex-wrap gap-2">
          {(kind === "pct" ? [5, 10, 15, 20].filter(x => owner || x <= limit) : [50, 100, 200]).map(x => (
            <button key={x} onClick={() => setValue(String(x))} aria-pressed={v === x}
              className={cn("h-10 rounded-full border border-border px-4 text-sm font-semibold text-fg", v === x && "border-blue bg-blue-soft")}>{kind === "pct" ? `${x}%` : inr(x)}</button>))}
        </div>
        <Field label={kind === "pct" ? "Percent off" : "Amount off (₹)"}>
          <Input inputMode="decimal" value={value} onChange={e => setValue(amt(e.target.value))} className="num" aria-label="Discount value" /></Field>
        <Field label="Reason" hint="For example: regular guest, food was late, staff meal">
          <Input value={reason} maxLength={200} onChange={e => setReason(e.target.value)} /></Field>
        <p className={cn("num text-sm font-semibold", over ? "text-danger" : "text-fg")}>
          {over ? `That's more than ${limit}%. Ask the owner.` : `${inr(off, { paise: true })} off ${inr(b.subtotal, { paise: true })} of items`}</p>
        <Button size="lg" variant="primary" disabled={pending || !v || over || reason.trim().length < 3}
          onClick={async () => { const ok = await run(() => rpc("staff_set_discount", { p_visit: visit.id, p_kind: kind, p_value: v, p_reason: reason.trim() }).then(() => true), "Discount added"); if (ok) onOpenChange(false); }}>
          Give discount</Button>
        {(b.discount ?? 0) > 0 && <Button variant="ghost" disabled={pending}
          onClick={async () => { const ok = await run(() => rpc("staff_set_discount", { p_visit: visit.id, p_kind: "none", p_value: 0, p_reason: "" }).then(() => true), "Discount removed"); if (ok) onOpenChange(false); }}>
          Remove discount</Button>}
      </div>
    </Dialog>
  );
}
