"use client";
import * as React from "react";
import { ArrowLeft, BellRing, Check, ChefHat, Clock, Flame, Minus, Plus, Receipt, Search, ShoppingBag, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Diet } from "@/components/ui/primitives";
import { Sheet, toast } from "@/components/ui/overlay";
import { CATEGORIES, MENU } from "@/lib/mock";
import { billOf, type Line } from "@/lib/bill";
import { cn, inr } from "@/lib/utils";

/** Guest page (scanned from the table QR). No sign-in, no name, phone or email, ever. */
export function GuestScreen({ onExit }: { onExit: () => void }) {
  const [cart, setCart] = React.useState<Record<string, number>>({});
  const [veg, setVeg] = React.useState(false);
  const [cat, setCat] = React.useState<string>(CATEGORIES[0]);
  const [open, setOpen] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [step, setStep] = React.useState(0);
  const lines: Line[] = Object.entries(cart).map(([id, qty]) => { const d = MENU.find(m => m.id === id)!; return { id, dish: id, name: d.name, qty, price: d.price }; });
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const bill = billOf(lines);
  const set = (id: string, n: number) => setCart(c => { const q = (c[id] ?? 0) + n; const x = { ...c }; if (q <= 0) delete x[id]; else x[id] = q; return x; });

  React.useEffect(() => { if (!sent) return; const t = setInterval(() => setStep(s => Math.min(s + 1, 2)), 2500); return () => clearInterval(t); }, [sent]);

  return (
    <div className="min-h-dvh bg-[#e9ebef] lg:py-8 [:root[data-theme=dark]_&]:bg-[#0a0c10]">
      <button onClick={onExit} className="fixed left-4 top-4 z-40 hidden items-center gap-2 rounded-full bg-surface px-4 py-2 text-sm font-semibold text-fg shadow-[var(--shadow)] lg:flex"><ArrowLeft className="size-4" />Back to staff screens</button>
      <div className="relative mx-auto min-h-dvh max-w-[430px] overflow-hidden bg-background lg:min-h-[860px] lg:rounded-[32px] lg:border lg:border-border lg:shadow-[var(--shadow)]">
        {/* Cover */}
        <div className="relative h-[210px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="img/cover.jpg" alt="" className="absolute inset-0 size-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#171b24]/90 via-[#171b24]/30 to-transparent" />
          <button onClick={onExit} aria-label="Back" className="absolute left-4 top-4 grid size-9 place-items-center rounded-full bg-white/90 text-[#171b24] lg:hidden"><ArrowLeft className="size-4" /></button>
          <div className="absolute inset-x-5 bottom-4 text-white">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-white/80">Table T3 · Main hall</p>
            <h1 className="font-display text-[28px] font-extrabold leading-tight">The Copper Pot</h1>
            <p className="text-[13px] text-white/85">North Indian · Open till 11:30 pm</p>
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-3 gap-2 px-4 pt-4">
          <Quick Icon={BellRing} label="Call waiter" onClick={() => toast("A waiter is on the way")} />
          <Quick Icon={Wifi} label="Wi-Fi" onClick={() => toast("CopperPot-Guest · password chai2026", "info")} />
          <Quick Icon={Receipt} label="Ask for bill" onClick={() => toast("Your bill is on its way")} />
        </div>

        {sent && (
          <div className="mx-4 mt-4 rounded-[var(--radius-lg)] border border-border bg-surface p-4" aria-live="polite">
            <p className="text-[13px] font-semibold text-fg-2">Order #214</p>
            <ol className="mt-3 grid grid-cols-3 gap-2">
              {[{ l: "Received", I: Check }, { l: "Cooking", I: Flame }, { l: "On its way", I: ChefHat }].map((s, i) => (
                <li key={s.l} className="grid justify-items-center gap-1.5 text-center">
                  <span className={cn("grid size-9 place-items-center rounded-full", i <= step ? "bg-coral text-[#171b24]" : "bg-muted text-fg-2")}><s.I className="size-4" aria-hidden /></span>
                  <span className={cn("text-[12px] font-semibold", i <= step ? "text-fg" : "text-fg-2")}>{s.l}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Menu */}
        <div className="sticky top-0 z-10 mt-4 border-b border-border bg-background/95 px-4 pb-3 pt-2 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-2" aria-hidden />
              <input aria-label="Search the menu" placeholder="Search the menu" className="h-10 w-full rounded-full border border-border bg-surface pl-9 pr-3 text-sm text-fg placeholder:text-fg-2" /></div>
            <button role="switch" aria-checked={veg} onClick={() => setVeg(v => !v)} className={cn("flex h-10 items-center gap-2 rounded-full border border-border bg-surface px-3 text-[13px] font-semibold text-fg-2", veg && "border-veg text-veg")}>
              <Diet diet="veg" />Veg only
            </button>
          </div>
          <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
            {CATEGORIES.map(c => <button key={c} onClick={() => setCat(c)} aria-pressed={cat === c}
              className={cn("h-8 shrink-0 rounded-full px-3.5 text-[13px] font-semibold text-fg-2", cat === c ? "bg-ink text-surface" : "bg-muted")}>{c}</button>)}
          </div>
        </div>

        <ul className="divide-y divide-border px-4 pb-32">
          {MENU.filter(d => d.cat === cat && (!veg || d.diet === "veg")).map(d => (
            <li key={d.id} className={cn("flex gap-3 py-4", d.soldOut && "opacity-55")}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5"><Diet diet={d.diet} />{d.best && <Badge tone="coral" className="h-5 px-2 text-[11px]">Bestseller</Badge>}</div>
                <p className="mt-1.5 font-display text-base font-bold text-fg">{d.name}</p>
                <p className="num text-sm font-semibold text-fg">{inr(d.price)}</p>
                <p className="mt-1 line-clamp-2 text-[13px] text-fg-2">{d.desc}</p>
              </div>
              <div className="relative w-[118px] shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={d.photo} alt="" loading="lazy" className="aspect-square w-full rounded-[var(--radius-lg)] object-cover" />
                <div className="absolute inset-x-2 -bottom-3">
                  {d.soldOut ? <span className="block rounded-[var(--radius)] bg-surface py-1.5 text-center text-[12px] font-bold text-fg-2 shadow-[var(--shadow)]">Sold out</span>
                    : cart[d.id] ? (
                      <div className="flex h-9 items-center justify-between rounded-[var(--radius)] bg-coral text-[#171b24] shadow-[var(--shadow)]">
                        <button aria-label={`One less ${d.name}`} className="grid h-full w-9 place-items-center" onClick={() => set(d.id, -1)}><Minus className="size-4" /></button>
                        <span className="num text-sm font-extrabold">{cart[d.id]}</span>
                        <button aria-label={`One more ${d.name}`} className="grid h-full w-9 place-items-center" onClick={() => set(d.id, 1)}><Plus className="size-4" /></button>
                      </div>
                    ) : <button onClick={() => set(d.id, 1)} className="h-9 w-full rounded-[var(--radius)] border border-border bg-surface text-sm font-extrabold text-coral-strong shadow-[var(--shadow)]">ADD</button>}
                </div>
              </div>
            </li>
          ))}
        </ul>

        {count > 0 && (
          <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[430px] p-4 lg:absolute">
            <button onClick={() => setOpen(true)} className="flex h-14 w-full items-center gap-3 rounded-[var(--radius-lg)] bg-ink px-4 text-surface shadow-[var(--shadow)]">
              <ShoppingBag className="size-5" aria-hidden /><span className="num text-sm font-semibold">{count} item{count > 1 ? "s" : ""} · {inr(bill.subtotal)}</span>
              <span className="ml-auto font-display text-[15px] font-extrabold">View order</span>
            </button>
          </div>
        )}

        <Sheet open={open} onOpenChange={setOpen} title="Your order" description="Table T3 · Goes straight to the kitchen">
          <ul className="divide-y divide-border">{lines.map(l => (
            <li key={l.id} className="flex items-center gap-3 py-3">
              <span className="flex-1 text-sm font-semibold text-fg">{l.name}</span>
              <div className="flex items-center rounded-[var(--radius)] border border-border">
                <button aria-label="Less" onClick={() => set(l.id, -1)} className="grid size-9 place-items-center"><Minus className="size-4" /></button>
                <span className="num w-5 text-center text-sm font-bold">{l.qty}</span>
                <button aria-label="More" onClick={() => set(l.id, 1)} className="grid size-9 place-items-center"><Plus className="size-4" /></button>
              </div>
              <span className="num w-14 text-right text-sm font-semibold text-fg">{inr(l.qty * l.price)}</span>
            </li>))}
          </ul>
          <textarea aria-label="Note for the kitchen" placeholder="Note for the kitchen (less spicy, no onion…)" className="mt-3 h-20 w-full rounded-[var(--radius)] border border-border bg-surface p-3 text-sm text-fg placeholder:text-fg-2" />
          <dl className="mt-3 grid gap-1 text-[13px]">
            <div className="flex justify-between"><dt className="text-fg-2">Items</dt><dd className="num text-fg">{inr(bill.subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-fg-2">Service and GST</dt><dd className="num text-fg">{inr(bill.serviceAmt + bill.gstAmt, { paise: true })}</dd></div>
            <div className="flex justify-between border-t border-border pt-2 text-base font-bold"><dt className="text-fg">Estimated total</dt><dd className="num text-fg">{inr(bill.total)}</dd></div>
          </dl>
          <p className="mt-2 flex items-center gap-1.5 text-[12px] text-fg-2"><Clock className="size-3.5" aria-hidden />Usually ready in 15–20 min. Pay at the end by UPI, card or cash.</p>
          <Button size="xl" variant="primary" className="mt-4 w-full" onClick={() => { setOpen(false); setCart({}); setSent(true); setStep(0); toast("Order sent to the kitchen"); }}>Send to kitchen · {inr(bill.total)}</Button>
        </Sheet>
      </div>
    </div>
  );
}

function Quick({ Icon, label, onClick }: { Icon: typeof Wifi; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex h-16 flex-col items-center justify-center gap-1 rounded-[var(--radius-lg)] border border-border bg-surface text-[12px] font-semibold text-fg shadow-[var(--shadow-sm)]">
      <Icon className="size-5 text-coral-strong" aria-hidden />{label}
    </button>
  );
}
