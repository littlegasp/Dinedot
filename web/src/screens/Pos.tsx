"use client";
import * as React from "react";
import { Banknote, ChefHat, CreditCard, Layers, Minus, Plus, Search, Smartphone, Trash2, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, Diet, EmptyState, Input, Skeleton } from "@/components/ui/primitives";
import { Dialog, toast } from "@/components/ui/overlay";
import { TableStatus, tableState, visitOf } from "@/components/ui/status";
import { newRequestId, rpc } from "@/lib/api";
import { useAction, useStaff } from "@/lib/staff";
import type { CartLine, LiveVisit, MenuItem, PayMethod, StaffMenu } from "@/lib/types";
import { cn, inr } from "@/lib/utils";

export function PosScreen({ tableId, setTableId, payNow }: { tableId: string | null; setTableId: (id: string) => void; payNow: boolean }) {
  const { live, can } = useStaff();
  const { run, pending } = useAction();
  const [menu, setMenu] = React.useState<StaffMenu | null>(null);
  const [cat, setCat] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [note, setNote] = React.useState("");
  const [pick, setPick] = React.useState<MenuItem | null>(null);
  const [pay, setPay] = React.useState(false);
  const request = React.useRef<string | null>(null);   // kept across retries of the same send

  const loadMenu = React.useCallback(() => rpc<StaffMenu>("staff_menu").then(setMenu).catch(e => toast((e as Error).message, "error")), []);
  React.useEffect(() => { loadMenu(); }, [loadMenu]);
  React.useEffect(() => { request.current = null; }, [cart, note, tableId]);
  React.useEffect(() => { if (payNow) setPay(true); }, [payNow]);

  if (!live || !menu) return <div className="grid gap-4 xl:grid-cols-[1fr_400px]"><Skeleton className="h-[520px]" /><Skeleton className="h-[520px]" /></div>;

  const tables = live.tables.filter(t => t.active);
  const table = tables.find(t => t.id === tableId) ?? null;
  const visit: LiveVisit | undefined = table ? visitOf(table, live.visits) : undefined;
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
    if (!table) return toast("Pick a table first", "error");
    request.current ??= newRequestId();
    const ok = await run(() => rpc("staff_add_order", {
      p_table: table.id, p_note: note.trim(), p_request_id: request.current,
      p_items: cart.map(l => ({ id: l.id, qty: l.qty, size: l.size ?? "", addons: l.addons ?? [] })),
    }).then(() => true), `Sent to the kitchen · ${table.code}`);
    if (ok) { setCart([]); setNote(""); }
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="min-w-0">
        {/* Tables */}
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0" role="radiogroup" aria-label="Table">
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
            <h2 className="text-lg font-extrabold text-fg">{table ? `Table ${table.code}` : "Pick a table"}</h2>
            <p className="text-[12px] text-fg-2">{table ? (visit ? `${visit.guests ? `${visit.guests} guests · ` : ""}${visit.orders.length} order${visit.orders.length === 1 ? "" : "s"} so far` : "Free table") : "Choose a table above to start"}</p>
          </div>
          {visit && <TableStatus state={tableState(visit)} />}
        </div>
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
          {cart.length > 0 && <Input value={note} onChange={e => setNote(e.target.value)} maxLength={300} placeholder="Note for the kitchen (less spicy, no onion…)" className="mb-3" aria-label="Note for the kitchen" />}
        </div>
        <div className="border-t border-border px-5 py-4">
          {visit && (
            <dl className="mb-3 grid gap-1 text-[13px]">
              <Row k="Items" v={inr(visit.bill.subtotal, { paise: true })} />
              {visit.bill.service > 0 && <Row k={`Service ${visit.bill.service_pct}%`} v={inr(visit.bill.service, { paise: true })} />}
              <Row k={`GST ${visit.bill.gst_pct}%`} v={inr(visit.bill.gst, { paise: true })} />
              {visit.bill.tip > 0 && <Row k={`Tip ${visit.bill.tip_pct}%`} v={inr(visit.bill.tip)} />}
            </dl>
          )}
          <div className="flex items-baseline justify-between border-t border-dashed border-border pt-3">
            <span className="font-display text-base font-bold text-fg">{visit ? "Bill" : "New items"}</span>
            <span className="num font-display text-[28px] font-extrabold text-fg">{inr(visit ? visit.bill.grand : cartTotal)}</span>
          </div>
          {cart.length > 0 && visit && <p className="num text-right text-[12px] text-fg-2">+ {inr(cartTotal)} once sent (before tax)</p>}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button size="xl" variant="ink" disabled={!cart.length || !table || pending} onClick={send}><ChefHat />Send</Button>
            <Button size="xl" variant="primary" disabled={!visit || pending} onClick={() => setPay(true)}>Take payment</Button>
          </div>
          {cart.length > 0 && <button className="mt-2 flex items-center gap-1 text-[12px] font-semibold text-fg-2" onClick={() => setCart([])}><Trash2 className="size-3.5" />Clear new items</button>}
        </div>
      </Card>

      <Dialog open={!!pick} onOpenChange={o => !o && setPick(null)} title={pick?.name ?? ""} description="Choose a size and any extras.">
        {pick && <Picker i={pick} onAdd={(s, a) => { add(pick, s, a); setPick(null); }} />}
      </Dialog>
      {visit && <PayDialog open={pay} onOpenChange={setPay} visit={visit} tableCode={table!.code} canEdit={can("floor")} />}
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

const METHODS: { m: PayMethod; label: string; Icon: typeof Smartphone }[] = [
  { m: "upi", label: "UPI", Icon: Smartphone }, { m: "card", label: "Card", Icon: CreditCard },
  { m: "cash", label: "Cash", Icon: Banknote }, { m: "mixed", label: "Mixed", Icon: Layers },
];

function PayDialog({ open, onOpenChange, visit, tableCode, canEdit }: { open: boolean; onOpenChange: (o: boolean) => void; visit: LiveVisit; tableCode: string; canEdit: boolean }) {
  const { run, pending } = useAction();
  const [method, setMethod] = React.useState<PayMethod>("upi");
  const [ref, setRef] = React.useState("");
  const [given, setGiven] = React.useState("");
  React.useEffect(() => { if (open) { setMethod((visit.pay_choice || "upi") as PayMethod); setRef(""); setGiven(""); } }, [open, visit.pay_choice]);
  const b = visit.bill;
  const kitchen = visit.orders.some(o => o.status === "new" || o.status === "cooking");
  const update = (p: { p_split?: number; p_tip_pct?: number }) =>
    run(() => rpc("staff_visit_update", { p_visit: visit.id, p_split: p.p_split ?? visit.split, p_tip_pct: p.p_tip_pct ?? visit.tip_pct, p_guests: visit.guests }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Take payment · ${tableCode}`} description="The total comes from the server. Each payment is saved with its method and reference.">
      <div className="rounded-[var(--radius)] bg-muted px-4 py-3">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold text-fg-2">To pay</span>
          <span className="num font-display text-[30px] font-extrabold text-fg">{inr(b.grand)}</span>
        </div>
        {b.split > 1 && <p className="num text-right text-[13px] text-fg-2">{b.split} ways · {inr(b.each)} each</p>}
      </div>
      {canEdit && (
        <div className="mt-3 grid grid-cols-2 gap-3 text-[13px]">
          <label className="grid gap-1"><span className="font-semibold text-fg">Split</span>
            <select value={visit.split} disabled={pending} onChange={e => update({ p_split: +e.target.value })} className="h-10 rounded-[var(--radius)] border border-border bg-surface px-2 text-fg">
              {Array.from({ length: 12 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n === 1 ? "One bill" : `${n} ways`}</option>)}
            </select></label>
          <label className="grid gap-1"><span className="font-semibold text-fg">Tip</span>
            <select value={visit.tip_pct} disabled={pending} onChange={e => update({ p_tip_pct: +e.target.value })} className="h-10 rounded-[var(--radius)] border border-border bg-surface px-2 text-fg">
              {[0, 5, 10, 15, 20].map(n => <option key={n} value={n}>{n ? `${n}%` : "No tip"}</option>)}
            </select></label>
        </div>
      )}
      <div className="mt-4 grid grid-cols-4 gap-2">
        {METHODS.map(({ m, label, Icon }) => (
          <button key={m} aria-pressed={method === m} onClick={() => setMethod(m)}
            className={cn("flex h-16 flex-col items-center justify-center gap-1 rounded-[var(--radius)] border border-border text-sm font-semibold text-fg", method === m && "border-blue bg-blue-soft ring-1 ring-blue")}>
            <Icon className="size-5" aria-hidden />{label}
          </button>
        ))}
      </div>
      {method === "cash" ? (
        <div className="mt-3 grid gap-1.5">
          <Input inputMode="numeric" value={given} onChange={e => setGiven(e.target.value.replace(/\D/g, ""))} placeholder="Cash handed over (optional)" aria-label="Cash handed over" className="num h-12 font-display text-lg font-bold" />
          {Number(given) > b.grand && <p className="text-sm font-semibold text-success">Give back {inr(Number(given) - b.grand)} in change.</p>}
          {given && Number(given) < b.grand && <p className="text-sm font-semibold text-danger">{inr(b.grand - Number(given))} still to collect.</p>}
        </div>
      ) : (
        <Input className="mt-3" value={ref} maxLength={60} onChange={e => setRef(e.target.value)}
          placeholder={method === "upi" ? "UPI reference (UTR), optional" : method === "card" ? "Card slip number, optional" : "How it was split, e.g. ₹500 cash + rest UPI"} aria-label="Payment reference" />
      )}
      {kitchen && <p className="mt-3 rounded-[var(--radius)] bg-warning-soft px-3 py-2 text-[13px] font-semibold text-warning-strong">Some dishes are still with the kitchen. Serve or cancel them before closing the bill.</p>}
      <Button size="xl" variant="primary" className="mt-4 w-full" disabled={pending || kitchen}
        onClick={async () => { const ok = await run(() => rpc("staff_mark_paid", { p_visit: visit.id, p_method: method, p_reference: method === "cash" ? "" : ref.trim() }).then(() => true), `Paid · table ${tableCode} is free`); if (ok) onOpenChange(false); }}>
        Mark paid · {inr(b.grand)}
      </Button>
    </Dialog>
  );
}
