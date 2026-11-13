"use client";
import * as React from "react";
import qrcode from "qrcode-generator";
import { BellRing, Check, ChefHat, Clock, Droplets, Flame, Minus, Plus, Receipt, Search, ShoppingBag, Smartphone, Star, UtensilsCrossed, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Diet } from "@/components/ui/primitives";
import { Dialog, Sheet, toast, Toaster } from "@/components/ui/overlay";
import { newRequestId, rpc } from "@/lib/api";
import type { CartLine, GuestMenu, GuestState } from "@/lib/types";
import { cn, inr, tipLabel } from "@/lib/utils";
import { ReceiptDialog } from "./ReceiptDialog";

type Item = GuestMenu["items"][number];
const read = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : d; } catch { return d; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

/** Guest page, opened from the table's QR. No sign-in and no name, phone or email, ever. */
export function GuestScreen() {
  const [token, setToken] = React.useState<string | null>(null);
  const [menu, setMenu] = React.useState<GuestMenu | null>(null);
  const [state, setState] = React.useState<GuestState | null>(null);
  const [fatal, setFatal] = React.useState("");
  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [veg, setVeg] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [cat, setCat] = React.useState("");
  const [pick, setPick] = React.useState<Item | null>(null);
  const [basket, setBasket] = React.useState(false);
  const [billOpen, setBillOpen] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const request = React.useRef<string | null>(null);
  const cartKey = token ? `dineos.cart.${token}` : "";

  React.useEffect(() => { setToken(new URLSearchParams(location.search).get("k")); }, []);
  React.useEffect(() => {
    if (token === null) return;
    if (!token) { setFatal("This page opens from the QR code on your table."); return; }
    rpc<GuestMenu>("guest_menu", { p_token: token }).then(m => { setMenu(m); setCat(m.categories[0]?.id ?? ""); document.title = m.place.name; })
      .catch(e => setFatal((e as Error).message));
    setCart(read<CartLine[]>(`dineos.cart.${token}`, []));
  }, [token]);
  const poll = React.useCallback(() => token ? rpc<GuestState>("guest_state", { p_token: token }).then(setState).catch(() => {}) : Promise.resolve(), [token]);
  React.useEffect(() => {
    if (!menu) return;
    poll(); const t = setInterval(() => { if (document.visibilityState === "visible") poll(); }, 5000);
    return () => clearInterval(t);
  }, [menu, poll]);
  React.useEffect(() => { if (cartKey) write(cartKey, cart); request.current = null; }, [cart, cartKey]);

  if (fatal) return <Center><UtensilsCrossed className="mx-auto mb-3 size-8 text-fg-2" /><p className="font-display text-lg font-bold text-fg">{fatal}</p></Center>;
  if (!menu) return <Center><p className="text-sm text-fg-2">Opening the menu…</p></Center>;

  const p = menu.place;
  const visit = state?.visit ?? null;
  const count = cart.reduce((s, l) => s + l.qty, 0);
  const cartTotal = cart.reduce((s, l) => s + l.unit * l.qty, 0);
  const shown = menu.items.filter(i => (!veg || i.diet === "veg") && (q.trim() ? i.name.toLowerCase().includes(q.trim().toLowerCase()) : i.cat === cat));
  const inCart = (id: string) => cart.filter(l => l.id === id).reduce((s, l) => s + l.qty, 0);

  const add = (i: Item, size?: { name: string; price: number }, addons: { name: string; price: number }[] = []) => {
    const unit = Number(size?.price ?? i.price) + addons.reduce((s, a) => s + Number(a.price), 0);
    const key = [i.id, size?.name ?? "", ...addons.map(a => a.name).sort()].join("|");
    setCart(c => c.some(l => l.key === key) ? c.map(l => l.key === key ? { ...l, qty: l.qty + 1 } : l)
      : [...c, { key, id: i.id, name: i.name, qty: 1, size: size?.name, addons: addons.map(a => a.name), unit }]);
  };
  const tap = (i: Item) => (i.sizes.length || i.addons.length) ? setPick(i) : add(i);
  const less = (id: string) => setCart(c => { const l = [...c].reverse().find(x => x.id === id); return !l ? c : c.flatMap(x => x !== l ? [x] : x.qty > 1 ? [{ ...x, qty: x.qty - 1 }] : []); });
  const qty = (key: string, n: number) => setCart(c => c.flatMap(l => l.key !== key ? [l] : l.qty + n <= 0 ? [] : [{ ...l, qty: l.qty + n }]));

  const send = async () => {
    setBusy(true); request.current ??= newRequestId();
    try {
      await rpc("guest_order", { p_token: token, p_note: note.trim(), p_request_id: request.current,
        p_items: cart.map(l => ({ id: l.id, qty: l.qty, size: l.size ?? "", addons: l.addons ?? [] })) });
      setCart([]); setNote(""); setBasket(false); toast("Order sent to the kitchen"); poll();
    } catch (e) { toast((e as Error).message, "error"); }   // the same request id is reused if they tap Send again
    finally { setBusy(false); }
  };
  const call = async (kind: "waiter" | "water") => {
    try { const r = await rpc<{ already: boolean }>("guest_call", { p_token: token, p_kind: kind });
      toast(r.already ? "Already asked. Someone is on the way." : kind === "water" ? "Water is on its way" : "A waiter is on the way"); poll(); }
    catch (e) { toast((e as Error).message, "error"); }
  };

  return (
    <div className="min-h-dvh bg-background" style={{ ["--coral" as string]: p.accent || undefined }}>
      <div className="relative mx-auto min-h-dvh max-w-[480px] bg-background">
        <div className="relative h-[200px] bg-ink">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {p.cover && <img src={p.cover} alt="" className="absolute inset-0 size-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-t from-[#171b24]/90 via-[#171b24]/35 to-transparent" />
          <div className="absolute inset-x-5 bottom-4 text-white">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-white/80">{menu.table.name}</p>
            <h1 className="font-display text-[28px] font-extrabold leading-tight">{p.name}</h1>
            {p.tagline && <p className="text-[13px] text-white/85">{p.tagline}</p>}
          </div>
        </div>

        {!p.accepting && <p className="mx-4 mt-4 rounded-[var(--radius)] bg-warning-soft px-4 py-3 text-sm font-semibold text-warning-strong">{p.closed_message}</p>}
        {p.welcome && <p className="mx-4 mt-4 text-sm text-fg-2">{p.welcome}</p>}

        <div className="grid grid-cols-3 gap-2 px-4 pt-4">
          <Quick Icon={BellRing} label="Call waiter" onClick={() => call("waiter")} />
          <Quick Icon={Droplets} label="Water" onClick={() => call("water")} />
          <Quick Icon={Receipt} label="Bill" onClick={() => visit ? setBillOpen(true) : toast("Order something first", "info")} />
        </div>
        {visit?.wifi && (
          <div className="mx-4 mt-2 flex items-center gap-3 rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-[13px] text-fg">
            <Wifi className="size-4 shrink-0 text-coral-strong" aria-hidden />
            <div className="min-w-0"><p className="truncate">Wi-Fi <b>{visit.wifi.name}</b></p>
              {visit.wifi.password && <p className="truncate text-fg-2">Password <b className="select-all text-fg">{visit.wifi.password}</b></p>}</div>
          </div>
        )}

        {visit && visit.orders.length > 0 && <Tracker visit={visit} />}
        {!visit && state?.last_paid && <Review token={token!} paid={state.last_paid} reviewUrl={p.review_url} onDone={poll} />}

        <div className="sticky top-0 z-10 mt-4 border-b border-border bg-background/95 px-4 pb-3 pt-2 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-2" aria-hidden />
              <input aria-label="Search the menu" value={q} onChange={e => setQ(e.target.value)} placeholder="Search the menu" className="h-10 w-full rounded-full border border-border bg-surface pl-9 pr-3 text-sm text-fg placeholder:text-fg-2" /></div>
            <button role="switch" aria-checked={veg} onClick={() => setVeg(v => !v)} className={cn("flex h-10 items-center gap-2 rounded-full border border-border bg-surface px-3 text-[13px] font-semibold text-fg-2", veg && "border-veg text-veg")}>
              <Diet diet="veg" />Veg only
            </button>
          </div>
          {!q.trim() && (
            <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
              {menu.categories.map(c => <button key={c.id} onClick={() => setCat(c.id)} aria-pressed={cat === c.id}
                className={cn("h-8 shrink-0 rounded-full px-3.5 text-[13px] font-semibold text-fg-2", cat === c.id ? "bg-ink text-surface" : "bg-muted")}>{c.name}</button>)}
            </div>
          )}
        </div>

        <ul className="divide-y divide-border px-4 pb-32">
          {shown.length === 0 && <li className="py-10 text-center text-sm text-fg-2">Nothing matches.</li>}
          {shown.map(i => (
            <li key={i.id} className={cn("flex gap-3 py-4", !i.available && "opacity-55")}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5"><Diet diet={i.diet} />{i.best && <Badge tone="coral" className="h-5 px-2 text-[11px]">Bestseller</Badge>}
                  {!!i.spice && <span className="text-[11px] text-danger" aria-label={`Spice ${i.spice} of 5`}>{"🌶".repeat(Math.min(i.spice, 3))}</span>}</div>
                <p className="mt-1.5 font-display text-base font-bold text-fg">{i.name}</p>
                <p className="num text-sm font-semibold text-fg">{inr(i.sizes[0]?.price ?? i.price)}{i.sizes.length > 1 && <span className="font-normal text-fg-2"> onwards</span>}</p>
                {i.desc && <p className="mt-1 line-clamp-2 text-[13px] text-fg-2">{i.desc}</p>}
                {i.allergens.length > 0 && <p className="mt-1 text-[12px] text-fg-2">Contains: {i.allergens.join(", ")}</p>}
              </div>
              <div className="relative w-[118px] shrink-0">
                {i.photo
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={i.photo} alt="" loading="lazy" className="aspect-square w-full rounded-[var(--radius-lg)] object-cover" />
                  : <div className="aspect-square w-full rounded-[var(--radius-lg)] bg-muted" />}
                <div className="absolute inset-x-2 -bottom-3">
                  {!i.available ? <span className="block rounded-[var(--radius)] bg-surface py-1.5 text-center text-[12px] font-bold text-fg-2 shadow-[var(--shadow)]">Sold out</span>
                    : inCart(i.id) ? (
                      <div className="flex h-9 items-center justify-between rounded-[var(--radius)] bg-coral text-[#171b24] shadow-[var(--shadow)]">
                        <button aria-label={`One less ${i.name}`} className="grid h-full w-9 place-items-center" onClick={() => less(i.id)}><Minus className="size-4" /></button>
                        <span className="num text-sm font-extrabold">{inCart(i.id)}</span>
                        <button aria-label={`One more ${i.name}`} className="grid h-full w-9 place-items-center" onClick={() => tap(i)}><Plus className="size-4" /></button>
                      </div>
                    ) : <button onClick={() => tap(i)} disabled={!p.accepting} className="h-9 w-full rounded-[var(--radius)] border border-border bg-surface text-sm font-extrabold text-coral-strong shadow-[var(--shadow)] disabled:opacity-60">ADD</button>}
                </div>
              </div>
            </li>
          ))}
        </ul>

        {count > 0 && (
          <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[480px] p-4">
            <button onClick={() => setBasket(true)} className="flex h-14 w-full items-center gap-3 rounded-[var(--radius-lg)] bg-ink px-4 text-surface shadow-[var(--shadow)]">
              <ShoppingBag className="size-5" aria-hidden /><span className="num text-sm font-semibold">{count} item{count > 1 ? "s" : ""} · {inr(cartTotal)}</span>
              <span className="ml-auto font-display text-[15px] font-extrabold">View order</span>
            </button>
          </div>
        )}

        <Sheet open={basket} onOpenChange={setBasket} title="Your order" description={`${menu.table.name} · goes straight to the kitchen`}>
          <ul className="divide-y divide-border">{cart.map(l => (
            <li key={l.key} className="flex items-center gap-3 py-3">
              <span className="min-w-0 flex-1 text-sm font-semibold text-fg">{l.name}
                {(l.size || l.addons?.length) ? <span className="block text-[12px] font-normal text-fg-2">{[l.size, ...(l.addons ?? [])].filter(Boolean).join(", ")}</span> : null}</span>
              <div className="flex items-center rounded-[var(--radius)] border border-border">
                <button aria-label={`One less ${l.name}`} onClick={() => qty(l.key, -1)} className="grid size-9 place-items-center"><Minus className="size-4" /></button>
                <span className="num w-5 text-center text-sm font-bold">{l.qty}</span>
                <button aria-label={`One more ${l.name}`} onClick={() => qty(l.key, 1)} className="grid size-9 place-items-center"><Plus className="size-4" /></button>
              </div>
              <span className="num w-16 text-right text-sm font-semibold text-fg">{inr(l.qty * l.unit)}</span>
            </li>))}
          </ul>
          <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={300} aria-label="Note for the kitchen" placeholder="Note for the kitchen (less spicy, no onion, allergies…)" className="mt-3 h-20 w-full rounded-[var(--radius)] border border-border bg-surface p-3 text-sm text-fg placeholder:text-fg-2" />
          <div className="mt-3 flex justify-between text-base font-bold"><span className="text-fg">Items</span><span className="num text-fg">{inr(cartTotal)}</span></div>
          <p className="mt-1 flex items-center gap-1.5 text-[12px] text-fg-2"><Clock className="size-3.5" aria-hidden />GST{p.service_pct ? " and service" : ""} are added on the bill. Pay at the end.</p>
          <Button size="xl" variant="primary" className="mt-4 w-full" disabled={busy || !p.accepting} onClick={send}>{busy ? "Sending…" : "Send to kitchen"}</Button>
        </Sheet>

        <Dialog open={!!pick} onOpenChange={o => !o && setPick(null)} title={pick?.name ?? ""} description="Choose a size and any extras.">
          {pick && <Picker i={pick} onAdd={(s, a) => { add(pick, s, a); setPick(null); }} />}
        </Dialog>

        {visit && <BillSheet open={billOpen} onOpenChange={setBillOpen} token={token!} menu={menu} visit={visit} onDone={poll} />}
      </div>
      <Toaster />
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-dvh place-items-center bg-background px-6 text-center"><div>{children}</div></div>;
}
function Quick({ Icon, label, onClick }: { Icon: typeof Wifi; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex h-16 flex-col items-center justify-center gap-1 rounded-[var(--radius-lg)] border border-border bg-surface text-[12px] font-semibold text-fg shadow-[var(--shadow-sm)]">
      <Icon className="size-5 text-coral-strong" aria-hidden />{label}
    </button>
  );
}

function Tracker({ visit }: { visit: NonNullable<GuestState["visit"]> }) {
  const steps = [{ l: "Received", I: Check }, { l: "Cooking", I: Flame }, { l: "Ready", I: ChefHat }];
  const at = { new: 0, cooking: 1, ready: 2, served: 3, cancelled: -1 } as const;
  return (
    <div className="mx-4 mt-4 grid gap-3" aria-live="polite">
      {visit.orders.filter(o => o.status !== "served").slice(-3).map(o => (
        <div key={o.id} className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
          <p className="text-[13px] font-semibold text-fg-2">Order #{o.no} · {o.items.map(i => `${i.qty}× ${i.name}`).join(", ")}</p>
          {o.status === "cancelled" ? <p className="mt-2 text-sm font-semibold text-danger">Cancelled{o.cancel_reason ? `: ${o.cancel_reason}` : ""}</p> : (
            <ol className="mt-3 grid grid-cols-3 gap-2">
              {steps.map((s, i) => (
                <li key={s.l} className="grid justify-items-center gap-1.5 text-center">
                  <span className={cn("grid size-9 place-items-center rounded-full", i <= at[o.status] ? "bg-coral text-[#171b24]" : "bg-muted text-fg-2")}><s.I className="size-4" aria-hidden /></span>
                  <span className={cn("text-[12px] font-semibold", i <= at[o.status] ? "text-fg" : "text-fg-2")}>{s.l}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      ))}
      {visit.orders.every(o => o.status === "served") && <p className="rounded-[var(--radius)] bg-success-soft px-4 py-3 text-sm font-semibold text-success">Everything has been served. Enjoy!</p>}
    </div>
  );
}

function Picker({ i, onAdd }: { i: Item; onAdd: (s?: { name: string; price: number }, a?: { name: string; price: number }[]) => void }) {
  const [size, setSize] = React.useState(i.sizes[i.sizes.length - 1]);
  const [addons, setAddons] = React.useState<{ name: string; price: number }[]>([]);
  const price = Number(size?.price ?? i.price) + addons.reduce((s, a) => s + Number(a.price), 0);
  const Opt = ({ on, onClick, label, price: pr }: { on: boolean; onClick: () => void; label: string; price: string }) => (
    <button type="button" aria-pressed={on} onClick={onClick} className={cn("flex h-14 items-center justify-between rounded-[var(--radius)] border border-border px-4 text-sm font-semibold text-fg", on && "border-blue bg-blue-soft ring-1 ring-blue")}>
      {label}<span className="num text-fg-2">{pr}</span></button>
  );
  return (
    <div className="grid gap-4">
      {i.sizes.length > 0 && <fieldset><legend className="mb-2 text-[13px] font-semibold text-fg">Size</legend>
        <div className="grid grid-cols-2 gap-2">{i.sizes.map(s => <Opt key={s.name} on={size?.name === s.name} onClick={() => setSize(s)} label={s.name} price={inr(s.price)} />)}</div></fieldset>}
      {i.addons.length > 0 && <fieldset><legend className="mb-2 text-[13px] font-semibold text-fg">Extras</legend>
        <div className="grid grid-cols-2 gap-2">{i.addons.map(a => { const on = addons.some(x => x.name === a.name); return (
          <Opt key={a.name} on={on} onClick={() => setAddons(on ? addons.filter(x => x.name !== a.name) : [...addons, a])} label={a.name} price={`+ ${inr(a.price)}`} />); })}</div></fieldset>}
      <Button size="xl" variant="primary" onClick={() => onAdd(size, addons)}>Add · {inr(price)}</Button>
    </div>
  );
}

function BillSheet({ open, onOpenChange, token, menu, visit, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; token: string; menu: GuestMenu; visit: NonNullable<GuestState["visit"]>; onDone: () => void }) {
  const p = menu.place;
  const b = visit.bill;
  const asked = visit.status === "bill";
  const [split, setSplit] = React.useState(visit.split);
  // the tip: one of the restaurant's % choices, or an amount the guest types
  const [tip, setTip] = React.useState<number | "amount">((b.tip_amount ?? 0) > 0 ? "amount" : visit.tip_pct);
  const [tipAmt, setTipAmt] = React.useState((b.tip_amount ?? 0) > 0 ? String(Math.round(b.tip_amount!)) : "");
  const [pay, setPay] = React.useState(visit.pay_choice || (p.pay.upi ? "upi" : p.pay.cash ? "cash" : "card"));
  const [busy, setBusy] = React.useState(false);
  // What the bill will be with these choices, before asking (the server works out the real one:
  // tip % of the items after any discount, rounded; split rounded up)
  const net = b.subtotal - (b.discount ?? 0);
  const tipNow = asked ? b.tip : tip === "amount" ? Math.max(0, Math.round(Number(tipAmt) || 0)) : Math.round(net * tip / 100);
  const grandNow = asked ? b.grand : b.total + tipNow;
  const splitNow = asked ? b.split : split;
  const eachNow = asked ? b.each : Math.ceil(grandNow / splitNow);
  const tipWord = asked ? tipLabel(b) : tip === "amount" || !tip ? "Tip" : `Tip ${tip}%`;
  const tooBig = tip === "amount" && tipNow > b.total;
  const payNow = splitNow > 1 ? eachNow : grandNow;
  const upiLink = visit.upi ? `upi://pay?${new URLSearchParams({ pa: visit.upi.id, pn: visit.upi.name, am: String(payNow), cu: "INR", tn: `${menu.table.name} bill` })}` : "";
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Your bill" description={menu.table.name}>
      <ul className="grid gap-1 text-sm">{b.lines.map((l, i) => <li key={i} className="flex justify-between text-fg"><span><span className="num">{l.qty}×</span> {l.name}{l.size && ` · ${l.size}`}</span><span className="num">{inr(l.amount)}</span></li>)}</ul>
      <dl className="mt-3 grid gap-1 border-t border-border pt-3 text-[13px]" aria-live="polite">
        <div className="flex justify-between"><dt className="text-fg-2">Items</dt><dd className="num text-fg">{inr(b.subtotal, { paise: true })}</dd></div>
        {(b.discount ?? 0) > 0 && <div className="flex justify-between"><dt className="text-fg-2">Discount{b.discount_kind === "pct" ? ` ${b.discount_value}%` : ""}</dt><dd className="num text-success">−{inr(b.discount!, { paise: true })}</dd></div>}
        {b.service > 0 && <div className="flex justify-between"><dt className="text-fg-2">Service {b.service_pct}%</dt><dd className="num text-fg">{inr(b.service, { paise: true })}</dd></div>}
        <div className="flex justify-between"><dt className="text-fg-2">GST {b.gst_pct}%</dt><dd className="num text-fg">{inr(b.gst, { paise: true })}</dd></div>
        {tipNow > 0 && <div className="flex justify-between"><dt className="text-fg-2">{tipWord}</dt><dd className="num text-fg">{inr(tipNow)}</dd></div>}
        <div className="flex justify-between pt-1 text-lg font-extrabold"><dt className="text-fg">Total</dt><dd className="num text-fg" data-testid="bill-total">{inr(grandNow)}</dd></div>
        {splitNow > 1 && <div className="flex justify-between font-semibold"><dt className="text-fg-2">{splitNow} ways</dt><dd className="num text-fg">{inr(eachNow)} each</dd></div>}
      </dl>
      {!asked ? (
        <div className="mt-4 grid gap-4">
          <fieldset><legend className="mb-2 text-[13px] font-semibold text-fg">Split the bill</legend>
            <div className="flex flex-wrap gap-2">{[1, 2, 3, 4, 5, 6].map(n => <Pill key={n} on={split === n} onClick={() => setSplit(n)}>{n === 1 ? "No" : n}</Pill>)}</div></fieldset>
          {p.tips.some(t => t > 0) && <fieldset><legend className="mb-2 text-[13px] font-semibold text-fg">Add a tip for the team?</legend>
            <div className="flex flex-wrap gap-2">
              {p.tips.map(t => <Pill key={t} on={tip === t} onClick={() => setTip(t)}>{t ? `${t}%` : "No tip"}</Pill>)}
              <Pill on={tip === "amount"} onClick={() => setTip("amount")}>₹ Amount</Pill>
            </div>
            {tip === "amount" && (
              <label className="mt-2 flex h-11 items-center gap-2 rounded-[var(--radius)] border border-border bg-surface px-3 focus-within:ring-2 focus-within:ring-[var(--focus)]">
                <span className="font-semibold text-fg-2">₹</span>
                <input aria-label="Tip amount" inputMode="numeric" autoFocus value={tipAmt} placeholder="e.g. 50"
                  onChange={e => setTipAmt(e.target.value.replace(/\D/g, "").slice(0, 5))} className="num min-w-0 flex-1 bg-transparent text-[16px] text-fg outline-none" />
              </label>)}
            {tooBig && <p className="mt-1 text-[12px] font-semibold text-danger">The tip can&apos;t be more than the bill.</p>}
          </fieldset>}
          <fieldset><legend className="mb-2 text-[13px] font-semibold text-fg">How will you pay?</legend>
            <div className="flex flex-wrap gap-2">{(["upi", "card", "cash"] as const).filter(m => p.pay[m]).map(m => <Pill key={m} on={pay === m} onClick={() => setPay(m)}>{m === "upi" ? "UPI / QR" : m === "card" ? "Card" : "Cash"}</Pill>)}</div></fieldset>
          <Button size="xl" variant="primary" disabled={busy || tooBig} onClick={async () => {
            setBusy(true);
            try {
              await rpc("guest_bill", { p_token: token, p_split: split, p_tip_pct: tip === "amount" ? 0 : tip, p_pay: pay, p_tip_amount: tip === "amount" ? tipNow : 0 });
              toast("Your bill is on its way"); onDone();
            } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); } }}>Ask for the bill · {inr(payNow)}{splitNow > 1 ? " each" : ""}</Button>
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          <p className="rounded-[var(--radius)] bg-success-soft px-4 py-3 text-sm font-semibold text-success">A waiter is bringing your bill.</p>
          {visit.pay_choice === "upi" && upiLink && (<>
            <a href={upiLink} className="flex h-14 items-center justify-center gap-2 rounded-[var(--radius-lg)] bg-coral text-base font-bold text-[#171b24]">
              <Smartphone className="size-5" aria-hidden />Pay {inr(payNow)} by UPI
            </a>
            <p className="text-[12px] text-fg-2">Opens your UPI app (GPay, PhonePe, Paytm…) with the amount filled in, paid straight to {visit.upi!.name}. Show the waiter the payment screen.</p>
            <div className="grid justify-items-center gap-2 rounded-[var(--radius-lg)] border border-border p-4">
              <UpiQr text={upiLink} />
              <p className="text-center text-[12px] text-fg-2">Paying from another phone? Scan this with any UPI app. {inr(payNow)} is already filled in.</p>
            </div>
          </>)}
        </div>
      )}
    </Sheet>
  );
}

/** The UPI payment as a QR code (amount included), for paying from another phone. */
function UpiQr({ text }: { text: string }) {
  const svg = React.useMemo(() => { const q = qrcode(0, "M"); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 3, scalable: true }); }, [text]);
  return <div role="img" aria-label="UPI QR code with the amount" className="size-48 rounded-[var(--radius)] bg-white [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-pressed={on} onClick={onClick} className={cn("h-10 min-w-12 rounded-full border border-border bg-surface px-3 text-sm font-semibold text-fg", on && "border-ink bg-ink text-surface")}>{children}</button>;
}

function BillLink({ paid }: { paid: NonNullable<GuestState["last_paid"]> }) {
  const [open, setOpen] = React.useState(false);
  if (!paid.receipt) return null;
  return <>
    <button className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-blue" onClick={() => setOpen(true)}><Receipt className="size-4" aria-hidden />View or share your bill</button>
    <ReceiptDialog open={open} onOpenChange={setOpen} receipt={paid.receipt} canPrint={false} />
  </>;
}

function Review({ token, paid, reviewUrl, onDone }: { token: string; paid: NonNullable<GuestState["last_paid"]>; reviewUrl: string; onDone: () => void }) {
  const [stars, setStars] = React.useState(0);
  const [comment, setComment] = React.useState("");
  const [done, setDone] = React.useState(paid.reviewed);
  if (done) return (
    <div className="mx-4 mt-4 rounded-[var(--radius-lg)] border border-border bg-surface p-4 text-center">
      <p className="font-display text-base font-bold text-fg">Thank you!</p>
      {reviewUrl && stars >= 4 && <a href={reviewUrl} target="_blank" rel="noopener" className="mt-2 inline-block text-sm font-semibold text-blue">Share it on Google too</a>}
      <div><BillLink paid={paid} /></div>
    </div>
  );
  return (
    <div className="mx-4 mt-4 rounded-[var(--radius-lg)] border border-border bg-surface p-4">
      <p className="font-display text-base font-bold text-fg">Thanks for visiting. How was it?</p>
      <p className="text-[12px] text-fg-2">Paid {inr(paid.total)}. Your rating is anonymous.</p>
      <BillLink paid={paid} />
      <div className="mt-3 flex gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map(n => <button key={n} role="radio" aria-checked={stars === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => setStars(n)}>
          <Star className={cn("size-8", n <= stars ? "fill-coral text-coral" : "text-border-strong")} /></button>)}
      </div>
      {stars > 0 && <>
        <textarea value={comment} onChange={e => setComment(e.target.value)} maxLength={600} placeholder="Anything we should know? (optional)" aria-label="Comment"
          className="mt-3 h-16 w-full rounded-[var(--radius)] border border-border bg-surface p-3 text-sm text-fg placeholder:text-fg-2" />
        <Button className="mt-2 w-full" variant="primary" onClick={async () => {
          try { await rpc("guest_review", { p_token: token, p_visit: paid.id, p_stars: stars, p_comment: comment.trim() }); setDone(true); onDone(); }
          catch (e) { toast((e as Error).message, "error"); } }}>Send</Button>
      </>}
    </div>
  );
}
