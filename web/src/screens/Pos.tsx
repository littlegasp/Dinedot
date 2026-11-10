"use client";
import * as React from "react";
import { Banknote, ChefHat, CreditCard, Minus, Percent, Plus, Printer, Search, ShoppingBag, Smartphone, Trash2, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, Diet, EmptyState, Input, Segmented } from "@/components/ui/primitives";
import { Dialog, toast } from "@/components/ui/overlay";
import { CATEGORIES, MENU, TABLES, type Dish } from "@/lib/mock";
import { billOf, type Line } from "@/lib/bill";
import { cn, inr } from "@/lib/utils";

type Mode = "dine" | "take";
type Tender = { method: "UPI" | "Card" | "Cash"; amount: number };

export function PosScreen() {
  const [mode, setMode] = React.useState<Mode>("dine");
  const [table, setTable] = React.useState("T2");
  const [cat, setCat] = React.useState<string>("All");
  const [q, setQ] = React.useState("");
  const [lines, setLines] = React.useState<Line[]>([
    { id: "l1", dish: "d5", name: "Chicken Karahi", qty: 1, price: 420, mods: "Full" },
    { id: "l2", dish: "d6", name: "Dal Makhani", qty: 1, price: 280 },
    { id: "l3", dish: "d11", name: "Butter Naan", qty: 4, price: 75, mods: "Garlic" },
  ]);
  const [discount, setDiscount] = React.useState(0);
  const [pick, setPick] = React.useState<Dish | null>(null);
  const [pay, setPay] = React.useState(false);
  const [disc, setDisc] = React.useState(false);

  const shown = MENU.filter(d => (cat === "All" || d.cat === cat) && d.name.toLowerCase().includes(q.toLowerCase()));
  const bill = billOf(lines, { discount });
  const add = (d: Dish, size?: { name: string; price: number }, addon?: { name: string; price: number }) => {
    const price = (size?.price ?? d.price) + (addon?.price ?? 0);
    const mods = [size?.name, addon?.name].filter(Boolean).join(", ") || undefined;
    setLines(ls => {
      const hit = ls.find(l => l.dish === d.id && l.mods === mods);
      return hit ? ls.map(l => (l === hit ? { ...l, qty: l.qty + 1 } : l)) : [...ls, { id: crypto.randomUUID(), dish: d.id, name: d.name, qty: 1, price, mods }];
    });
  };
  const tap = (d: Dish) => (d.soldOut ? toast(`${d.name} is sold out`, "error") : d.sizes || d.addons ? setPick(d) : add(d));
  const qty = (id: string, n: number) => setLines(ls => ls.flatMap(l => (l.id !== id ? [l] : l.qty + n <= 0 ? [] : [{ ...l, qty: l.qty + n }])));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
      {/* Menu side */}
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Segmented size="lg" value={mode} onChange={setMode} options={[{ value: "dine", label: <span className="flex items-center gap-1.5"><UtensilsCrossed className="size-4" />Dine-in</span> }, { value: "take", label: <span className="flex items-center gap-1.5"><ShoppingBag className="size-4" />Takeaway</span> }]} />
          {mode === "dine" ? (
            <select aria-label="Table" value={table} onChange={e => setTable(e.target.value)} className="h-12 rounded-[var(--radius)] border border-border bg-surface px-3 text-sm font-semibold text-fg">
              {TABLES.map(t => <option key={t.id} value={t.id}>Table {t.name} · {t.area}</option>)}
            </select>
          ) : <Badge tone="blue" className="h-12 rounded-[var(--radius)] px-3 text-sm">Token #A13</Badge>}
          <div className="relative ml-auto w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-2" aria-hidden />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a dish" className="h-12 pl-9" aria-label="Find a dish" />
          </div>
        </div>
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0" role="tablist" aria-label="Categories">
          {["All", ...CATEGORIES].map(c => (
            <button key={c} role="tab" aria-selected={cat === c} onClick={() => setCat(c)}
              className={cn("h-10 shrink-0 rounded-full border border-border bg-surface px-4 text-sm font-semibold text-fg-2", cat === c && "border-ink bg-ink text-surface")}>{c}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
          {shown.map(d => (
            <button key={d.id} onClick={() => tap(d)} disabled={d.soldOut}
              className="group relative overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface text-left shadow-[var(--shadow-sm)] transition hover:border-border-strong active:scale-[.98] disabled:opacity-55">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={d.photo} alt="" loading="lazy" className="aspect-[16/10] w-full object-cover" />
              {d.soldOut && <Badge className="absolute left-2 top-2 bg-danger text-white">Sold out</Badge>}
              <div className="p-3">
                <div className="flex items-start gap-1.5"><Diet diet={d.diet} className="mt-0.5" /><span className="line-clamp-2 text-sm font-semibold leading-tight text-fg">{d.name}</span></div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="num text-sm font-bold text-fg">{inr(d.sizes?.[0].price ?? d.price)}{d.sizes && <span className="font-normal text-fg-2">+</span>}</span>
                  <span className="grid size-7 place-items-center rounded-full bg-coral text-[#171b24] opacity-90 group-hover:opacity-100"><Plus className="size-4" aria-hidden /></span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Phone: jump to the order */}
      {lines.length > 0 && (
        <button onClick={() => document.getElementById("ticket")?.scrollIntoView({ behavior: "smooth" })}
          className="fixed inset-x-4 bottom-[76px] z-20 flex h-12 items-center gap-3 rounded-[var(--radius-lg)] bg-ink px-4 text-surface shadow-[var(--shadow)] xl:hidden">
          <span className="num text-sm font-semibold">{lines.reduce((s, l) => s + l.qty, 0)} items</span>
          <span className="num ml-auto font-display font-extrabold">{inr(bill.total)} · View order</span>
        </button>
      )}

      {/* Ticket side */}
      <Card id="ticket" className="scroll-mt-20 flex flex-col xl:sticky xl:top-20 xl:max-h-[calc(100dvh-104px)]">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <div className="flex-1">
            <h2 className="text-lg font-extrabold text-fg">{mode === "dine" ? `Table ${table}` : "Takeaway #A13"}</h2>
            <p className="text-[12px] text-fg-2">{mode === "dine" ? "3 guests · Ravi · opened 12 min ago" : "Pickup in 20 min"}</p>
          </div>
          <Button size="iconSm" variant="ghost" aria-label="Clear order" onClick={() => setLines([])}><Trash2 /></Button>
        </div>
        <div className="flex-1 overflow-auto px-5">
          {lines.length === 0 ? <EmptyState icon={<UtensilsCrossed />} title="No items yet" body="Tap a dish to add it to this order." /> : (
            <ul className="divide-y divide-border">
              {lines.map(l => (
                <li key={l.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-fg">{l.name}</p>
                    <p className="num text-[12px] text-fg-2">{l.mods ? `${l.mods} · ` : ""}{inr(l.price)}</p>
                  </div>
                  <div className="flex items-center rounded-[var(--radius)] border border-border">
                    <button aria-label={`One less ${l.name}`} onClick={() => qty(l.id, -1)} className="grid size-9 place-items-center text-fg-2 hover:text-fg"><Minus className="size-4" /></button>
                    <span className="num w-6 text-center text-sm font-bold text-fg">{l.qty}</span>
                    <button aria-label={`One more ${l.name}`} onClick={() => qty(l.id, 1)} className="grid size-9 place-items-center text-fg-2 hover:text-fg"><Plus className="size-4" /></button>
                  </div>
                  <span className="num w-16 text-right text-sm font-semibold text-fg">{inr(l.qty * l.price)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-border px-5 py-4">
          <dl className="grid gap-1.5 text-[13px]">
            <Row k="Items" v={inr(bill.subtotal)} />
            {bill.discount > 0
              ? <Row k={<button className="font-semibold text-blue underline-offset-2 hover:underline" onClick={() => setDisc(true)}>Discount</button>} v={`− ${inr(bill.discount)}`} accent />
              : <div className="flex"><button onClick={() => setDisc(true)} className="flex items-center gap-1 font-semibold text-blue"><Percent className="size-3.5" />Add discount</button></div>}
            <Row k={`Service ${bill.service}%`} v={inr(bill.serviceAmt, { paise: true })} />
            <Row k={`GST ${bill.gst}%`} v={inr(bill.gstAmt, { paise: true })} />
            <Row k="Round off" v={inr(bill.roundOff, { paise: true })} />
          </dl>
          <div className="mt-3 flex items-baseline justify-between border-t border-dashed border-border pt-3">
            <span className="font-display text-base font-bold text-fg">To pay</span>
            <span className="num font-display text-[28px] font-extrabold text-fg">{inr(bill.total)}</span>
          </div>
          <div className="mt-3 grid grid-cols-[auto_1fr_1fr] gap-2">
            <Button size="xl" aria-label="Print bill" onClick={() => toast("Bill sent to the counter printer")}><Printer /></Button>
            <Button size="xl" variant="ink" disabled={!lines.length} onClick={() => toast("Sent to Tandoor and Curry stations")}><ChefHat />Send</Button>
            <Button size="xl" variant="primary" disabled={!lines.length} onClick={() => setPay(true)}>Take payment</Button>
          </div>
        </div>
      </Card>

      {/* Size / add-on picker */}
      <Dialog open={!!pick} onOpenChange={o => !o && setPick(null)} title={pick?.name ?? ""} description="Choose a size or add-on.">
        {pick && <Picker d={pick} onAdd={(s, a) => { add(pick, s, a); setPick(null); }} />}
      </Dialog>

      <DiscountDialog open={disc} onOpenChange={setDisc} subtotal={bill.subtotal} value={discount} onApply={setDiscount} />
      <PayDialog open={pay} onOpenChange={setPay} total={bill.total} onDone={() => { setPay(false); setLines([]); setDiscount(0); }} />
    </div>
  );
}

function Row({ k, v, accent }: { k: React.ReactNode; v: string; accent?: boolean }) {
  return <div className="flex justify-between"><dt className="text-fg-2">{k}</dt><dd className={cn("num font-semibold text-fg", accent && "text-success")}>{v}</dd></div>;
}

function Picker({ d, onAdd }: { d: Dish; onAdd: (s?: { name: string; price: number }, a?: { name: string; price: number }) => void }) {
  const [size, setSize] = React.useState(d.sizes?.[d.sizes.length - 1]);
  const [addon, setAddon] = React.useState<{ name: string; price: number } | undefined>();
  const price = (size?.price ?? d.price) + (addon?.price ?? 0);
  return (
    <div className="grid gap-4">
      {d.sizes && <fieldset><legend className="mb-2 text-[13px] font-semibold text-fg">Size</legend>
        <div className="grid grid-cols-2 gap-2">{d.sizes.map(s => <Choice key={s.name} on={size?.name === s.name} onClick={() => setSize(s)} label={s.name} price={inr(s.price)} />)}</div></fieldset>}
      {d.addons && <fieldset><legend className="mb-2 text-[13px] font-semibold text-fg">Add-on</legend>
        <div className="grid grid-cols-2 gap-2">{d.addons.map(a => <Choice key={a.name} on={addon?.name === a.name} onClick={() => setAddon(addon?.name === a.name ? undefined : a)} label={a.name} price={`+ ${inr(a.price)}`} />)}</div></fieldset>}
      <Button size="xl" variant="primary" onClick={() => onAdd(size, addon)}>Add · {inr(price)}</Button>
    </div>
  );
}
function Choice({ on, onClick, label, price }: { on: boolean; onClick: () => void; label: string; price: string }) {
  return (
    <button aria-pressed={on} onClick={onClick} className={cn("flex h-14 items-center justify-between rounded-[var(--radius)] border border-border px-4 text-sm font-semibold text-fg", on && "border-blue bg-blue-soft ring-1 ring-blue")}>
      {label}<span className="num text-fg-2">{price}</span>
    </button>
  );
}

function DiscountDialog({ open, onOpenChange, subtotal, value, onApply }: { open: boolean; onOpenChange: (o: boolean) => void; subtotal: number; value: number; onApply: (n: number) => void }) {
  const [pct, setPct] = React.useState(10);
  const [reason, setReason] = React.useState("Regular guest");
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Discount" description="Managers can give up to 20%. Every discount is saved in the activity log with its reason.">
      <div className="grid grid-cols-4 gap-2">
        {[5, 10, 15, 20].map(p => <Choice key={p} on={pct === p} onClick={() => setPct(p)} label={`${p}%`} price="" />)}
      </div>
      <label className="mt-4 grid gap-1.5"><span className="text-[13px] font-semibold text-fg">Reason</span>
        <Input value={reason} onChange={e => setReason(e.target.value)} /></label>
      <div className="mt-5 flex items-center gap-2">
        {value > 0 && <Button variant="ghost" onClick={() => { onApply(0); onOpenChange(false); }}>Remove</Button>}
        <span className="num ml-auto text-sm text-fg-2">− {inr(Math.round(subtotal * pct / 100))}</span>
        <Button variant="primary" onClick={() => { onApply(Math.round(subtotal * pct / 100)); onOpenChange(false); }}>Apply</Button>
      </div>
    </Dialog>
  );
}

const METHODS = [{ m: "UPI" as const, Icon: Smartphone }, { m: "Card" as const, Icon: CreditCard }, { m: "Cash" as const, Icon: Banknote }];

function PayDialog({ open, onOpenChange, total, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; total: number; onDone: () => void }) {
  const [tenders, setTenders] = React.useState<Tender[]>([]);
  const [method, setMethod] = React.useState<Tender["method"]>("UPI");
  const paid = tenders.reduce((s, t) => s + t.amount, 0);
  const left = Math.max(total - paid, 0);
  const [amount, setAmount] = React.useState("");
  React.useEffect(() => { if (open) { setTenders([]); setAmount(String(total)); } }, [open, total]);
  React.useEffect(() => { setAmount(String(left)); }, [left]);
  const take = () => { const a = Math.min(Number(amount) || 0, left); if (a > 0) setTenders(t => [...t, { method, amount: a }]); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Take payment" description="Split across UPI, card and cash. Each part is saved as its own payment.">
      <div className="flex items-baseline justify-between rounded-[var(--radius)] bg-muted px-4 py-3">
        <span className="text-sm font-semibold text-fg-2">{left === 0 ? "Fully paid" : "Still to pay"}</span>
        <span className={cn("num font-display text-[28px] font-extrabold", left === 0 ? "text-success" : "text-fg")}>{inr(left)}</span>
      </div>
      {tenders.length > 0 && (
        <ul className="mt-3 grid gap-1.5">{tenders.map((t, i) => (
          <li key={i} className="flex items-center gap-2 text-sm"><Badge tone="success">Paid</Badge><span className="flex-1 text-fg">{t.method}</span><span className="num font-semibold text-fg">{inr(t.amount)}</span>
            <button aria-label="Remove this payment" className="text-fg-2 hover:text-danger" onClick={() => setTenders(ts => ts.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button></li>))}
        </ul>
      )}
      {left > 0 && (
        <div className="mt-4 grid gap-3">
          <div className="grid grid-cols-3 gap-2">
            {METHODS.map(({ m, Icon }) => (
              <button key={m} aria-pressed={method === m} onClick={() => setMethod(m)}
                className={cn("flex h-16 flex-col items-center justify-center gap-1 rounded-[var(--radius)] border border-border text-sm font-semibold text-fg", method === m && "border-blue bg-blue-soft ring-1 ring-blue")}>
                <Icon className="size-5" aria-hidden />{m}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input aria-label="Amount" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value.replace(/\D/g, ""))} className="num h-12 font-display text-lg font-bold" />
            <Button size="lg" variant="blue" onClick={take}>Add {method}</Button>
          </div>
          {method === "UPI" && <p className="text-[12px] text-fg-2">The guest scans the restaurant&apos;s own UPI QR. Tap Add after you see the payment on your phone.</p>}
          {method === "Cash" && (Number(amount) > left
            ? <p className="text-sm font-semibold text-success">Give back {inr(Number(amount) - left)} in change.</p>
            : <p className="text-[12px] text-fg-2">Type what the guest handed over to see the change.</p>)}
        </div>
      )}
      <Button size="xl" variant="primary" className="mt-5 w-full" disabled={left > 0} onClick={() => { toast("Paid. Receipt ready to print or share."); onDone(); }}>
        Mark paid & close bill
      </Button>
    </Dialog>
  );
}
