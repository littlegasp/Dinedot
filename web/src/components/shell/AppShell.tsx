"use client";
import * as React from "react";
import { Command } from "cmdk";
import { Bell, BellRing, Building2, ChevronsLeft, ChevronsRight, Download, Droplets, LayoutGrid, LifeBuoy, Lock, LogOut, Megaphone, Menu as MenuIcon, Moon, Plus, Receipt, RefreshCw, Search, Share, Smartphone, Sun, Vibrate, WifiOff, X } from "lucide-react";
import { NAV, type Route } from "@/lib/routes";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Kbd, Switch } from "@/components/ui/primitives";
import { Dialog, Sheet, toast } from "@/components/ui/overlay";
import { useStaff, minutesSince, useAction } from "@/lib/staff";
import { rpc } from "@/lib/api";
import { useOutbox } from "@/lib/outbox";
import { Tour } from "./Tour";
import { useAlerts, useAlertSettings, useWakeLock } from "@/lib/alerts";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";
import { buzzOn, installClickFeel, paintBar, switchWithInk } from "@/lib/motion";
import { registerWorker, useInstall } from "@/lib/install";
import { Glide } from "./Glide";
import { PushBox } from "./PushBox";

export { NAV, HOME, type Route } from "@/lib/routes";
export const CALL_LABEL = { waiter: "called a waiter", water: "asked for water", bill: "asked for the bill", help: "needs help" } as const;
export const CALL_ICON = { waiter: BellRing, water: Droplets, bill: Receipt, help: LifeBuoy } as const;

/** Day/night: the new look spreads like ink from the button you tapped. Each device remembers its own choice. */
export function useTheme() {
  const [theme, setTheme] = React.useState<"light" | "dark">("light");
  React.useEffect(() => { setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light"); }, []);
  const toggle = (e?: React.MouseEvent<HTMLElement>) => {
    const t = theme === "dark" ? "light" : "dark";
    const r = e?.currentTarget.getBoundingClientRect();
    switchWithInk(() => { document.documentElement.dataset.theme = t; setTheme(t); paintBar(); },
      r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : undefined);
    try { localStorage.setItem("dineos.theme", t); } catch {}
  };
  return { theme, toggle };
}

/** Desktop side menu can fold to icons only; remembered per device. */
function useFold() {
  const [folded, setFolded] = React.useState(false);
  React.useEffect(() => { setFolded(document.documentElement.dataset.menu === "folded"); }, []);
  const flip = () => {
    const f = !folded; setFolded(f);
    if (f) document.documentElement.dataset.menu = "folded"; else delete document.documentElement.dataset.menu;
    try { localStorage.setItem("dineos.menu", f ? "folded" : "open"); } catch {}
  };
  return { folded, flip };
}

/** The team notice, until this person hides it on this device (a new notice shows again). */
function NoticeBar() {
  const { live } = useStaff();
  const n = live?.settings.notice;
  const [hidden, setHidden] = React.useState<string | null>(null);
  React.useEffect(() => { try { setHidden(localStorage.getItem("dineos.notice.hidden")); } catch { /* private window */ } }, []);
  if (!n || hidden === n.at) return null;
  return (
    <div role="status" className="flex items-start gap-3 bg-blue-soft px-4 py-2.5 text-[13px] text-fg lg:px-8">
      <Megaphone className="mt-0.5 size-4 shrink-0 text-blue" aria-hidden />
      <p className="flex-1"><b>Team notice{n.by ? ` from ${n.by}` : ""}:</b> {n.text}</p>
      <button aria-label="Hide the notice" className="grid size-6 place-items-center rounded text-fg-2 hover:text-fg"
        onClick={() => { setHidden(n.at); try { localStorage.setItem("dineos.notice.hidden", n.at); } catch { /* private window */ } }}><X className="size-4" /></button>
    </div>
  );
}

/** Shows a bar when a newer version of the app has been published (checks every 5 min). */
function useNewVersion() {
  const [stale, setStale] = React.useState(false);
  React.useEffect(() => {
    const mine = process.env.NEXT_PUBLIC_BUILD;
    if (!mine) return;
    const check = () => fetch(`version.json?t=${Date.now()}`, { cache: "no-store" }).then(r => r.ok ? r.json() : null)
      .then(j => { if (j?.build && j.build !== mine) setStale(true); }).catch(() => {});
    const t = setInterval(check, 5 * 60_000); return () => clearInterval(t);
  }, []);
  return stale;
}

export function AppShell({ route, go, children, title, sub, actions, bleed }: {
  route: Route; go: (r: Route) => void; children: React.ReactNode;
  title: string; sub?: React.ReactNode; actions?: React.ReactNode; bleed?: boolean;
}) {
  const { me, live, role, restaurants, demo, offline, signOut, reloadMe, reload } = useStaff();
  const outbox = useOutbox(route === "pos" ? null : me?.restaurant_id, (m, ok) => { toast(m, ok ? "ok" : "error"); reload(); });   // the POS runs its own
  const { run } = useAction();
  const { theme, toggle } = useTheme();
  const { folded, flip } = useFold();
  const inst = useInstall();
  const [howInstall, setHowInstall] = React.useState(false);
  const [buzz, setBuzz] = React.useState(true);
  React.useEffect(() => { setBuzz(buzzOn()); registerWorker(); return installClickFeel(); }, []);
  const [cmd, setCmd] = React.useState(false);
  const [bell, setBell] = React.useState(false);
  useAlerts(live, role, route === "kitchen");
  useWakeLock(route === "kitchen");
  const alerts = useAlertSettings();
  const stale = useNewVersion();
  const nav = NAV.filter(n => role && n.roles.includes(role));
  const [moreOpen, setMoreOpen] = React.useState(false);
  // Phone tab bar: the main screens, a raised + for a new order (POS) in the middle, and More
  const centre = nav.find(n => n.route === "pos");
  const primary = nav.filter(n => n.group === "service" && n.route !== "pos").slice(0, centre ? 3 : 4);
  const more = nav.filter(n => !primary.includes(n) && n !== centre);
  const tabs: (typeof nav[number] | "centre")[] = centre ? [...primary.slice(0, 2), "centre", ...primary.slice(2)] : primary;
  const calls = live?.calls ?? [];
  const tableName = (id: string) => live?.tables.find(t => t.id === id)?.code ?? "";
  const newOrders = live?.visits.flatMap(v => v.orders).filter(o => o.status === "new").length ?? 0;

  React.useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setCmd(o => !o); } };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, []);

  const switchTo = async (id: string) => {
    try { await rpc("staff_switch_restaurant", { p_restaurant: id }); await reloadMe(); toast("Switched restaurant"); }
    catch (e) { toast((e as Error).message, "error"); }
  };

  return (
    <div className={cn("min-h-dvh transition-[padding] duration-300", folded ? "lg:pl-[84px]" : "lg:pl-[248px]")}>
      <aside className={cn("fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-border bg-surface transition-[width] duration-300 lg:flex", folded ? "w-[84px]" : "w-[248px]")}>
        <div className={cn("flex h-16 items-center", folded ? "justify-center" : "px-5")}><Logo compact={folded} /></div>
        <div className={cn("px-3 pb-3", folded && "hidden")}>
          <div className="rounded-[var(--radius)] border border-border bg-muted/60 p-3">
            <p className="truncate text-[13px] font-bold text-fg">{live?.settings.name ?? me?.restaurant ?? ""}</p>
            <p className="text-[12px] text-fg-2">
              {live ? (live.settings.accepting ? "Taking orders" : "Ordering paused") : "Loading…"}{demo && " · Demo"}
            </p>
            {restaurants.length > 1 && (
              <select aria-label="Restaurant" value={me?.restaurant_id ?? ""} onChange={e => switchTo(e.target.value)}
                className="mt-2 h-8 w-full rounded-[var(--radius-sm)] border border-border bg-surface px-2 text-[13px] font-semibold text-fg">
                {restaurants.filter(r => r.active).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            )}
          </div>
        </div>
        <nav aria-label="Main" className="relative flex-1 space-y-0.5 overflow-auto px-3 pb-3">
          <Glide selector='[aria-current="page"]' watch={`${route}${folded}`} className="rounded-[var(--radius)] bg-ink" />
          {(["service", "manage", "help"] as const).map(g => {
            const items = nav.filter(n => n.group === g);
            if (!items.length) return null;
            return (
              <div key={g} className="pt-1">
                {g !== "service" && (folded ? <div className="mx-3 my-3 border-t border-border" /> : <p className="px-3 pb-1 pt-4 text-[11px] font-bold uppercase tracking-wider text-fg-2">{g === "manage" ? "Manage" : "Support"}</p>)}
                {items.map(n => (
                  <button key={n.route} onClick={() => go(n.route)} aria-current={route === n.route ? "page" : undefined} title={folded ? n.label : undefined}
                    aria-label={folded ? n.label : undefined}
                    className={cn("relative z-[1] flex h-10 w-full items-center gap-3 rounded-[var(--radius)] px-3 text-sm font-semibold text-fg-2 transition-colors hover:text-fg",
                      folded && "justify-center px-0", route === n.route ? "text-surface hover:text-surface" : "hover:bg-muted")}>
                    <n.Icon className="size-[18px] shrink-0" aria-hidden />{!folded && n.label}
                    {n.route === "kitchen" && newOrders > 0 && <span className={cn("rounded-full bg-coral px-1.5 text-[11px] font-bold text-[#171b24]", folded ? "absolute right-2 top-0.5" : "ml-auto")} aria-label={`${newOrders} new`}>{newOrders}</span>}
                  </button>
                ))}
              </div>
            );
          })}
          {demo && !folded && (
            <a href="t.html?k=demo-T3" target="_blank" rel="noopener" className="flex h-10 w-full items-center gap-3 rounded-[var(--radius)] px-3 text-sm font-semibold text-fg-2 hover:bg-muted hover:text-fg">
              <Smartphone className="size-[18px]" aria-hidden />Guest QR page (T3)
            </a>
          )}
        </nav>
        <div className="space-y-1 border-t border-border p-3">
          {inst.state === "prompt" && (
            <button onClick={inst.install} title="Install app" className={cn("flex h-10 w-full items-center gap-3 rounded-[var(--radius)] px-3 text-sm font-semibold text-blue hover:bg-blue-soft", folded && "justify-center px-0")}>
              <Download className="size-[18px]" aria-hidden />{!folded && "Install app"}</button>
          )}
          <button onClick={flip} aria-label={folded ? "Open the menu" : "Fold the menu"} title={folded ? "Open the menu" : "Fold the menu"}
            className={cn("flex h-9 w-full items-center gap-3 rounded-[var(--radius)] px-3 text-[13px] font-semibold text-fg-2 hover:bg-muted", folded && "justify-center px-0")}>
            {folded ? <ChevronsRight className="size-[18px]" aria-hidden /> : <><ChevronsLeft className="size-[18px]" aria-hidden />Fold menu</>}
          </button>
          <div className={cn("flex items-center gap-2.5 px-1 pt-1", folded && "justify-center px-0")}>
            <div className="grid size-9 shrink-0 place-items-center rounded-full bg-blue-soft text-[13px] font-bold text-blue" title={me?.name}>{(me?.name ?? "?")[0]}</div>
            {!folded && <>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-fg">{me?.name}</p><p className="text-[12px] capitalize text-fg-2">{role}</p></div>
              <Button size="iconSm" variant="ghost" aria-label="Sign out" onClick={signOut}><LogOut /></Button>
            </>}
          </div>
        </div>
      </aside>

      {stale && (
        <div className="flex items-center gap-3 bg-ink px-4 py-2 text-[13px] text-surface lg:px-8">
          <RefreshCw className="size-4 shrink-0" aria-hidden />
          <span className="flex-1">A new version of {BRAND.name} is ready. Open bills are saved and won&apos;t be lost.</span>
          <button className="font-bold underline underline-offset-2" onClick={() => location.reload()}>Refresh now</button>
        </div>
      )}
      {offline && (
        <div role="status" className="flex items-center gap-2 bg-warning-soft px-4 py-2 text-[13px] font-semibold text-warning-strong lg:px-8">
          <WifiOff className="size-4" aria-hidden />No internet. The screen will catch up as soon as the connection is back.
          {outbox.jobs.length > 0 && ` ${outbox.jobs.length} order${outbox.jobs.length > 1 ? "s" : ""} saved on this device will be sent then.`}
        </div>
      )}
      {live?.settings.day_closed && (
        <div role="status" className="flex items-center gap-2 bg-muted px-4 py-2 text-[13px] font-semibold text-fg lg:px-8">
          <Lock className="size-4" aria-hidden />Today has been closed. No more orders or payments until the owner reopens it on Today.
        </div>
      )}
      <NoticeBar />

      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/85 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-md lg:px-8"
        style={{ minHeight: "calc(64px + env(safe-area-inset-top))" }}>
        <div className="lg:hidden"><Logo compact /></div>
        <button onClick={() => setCmd(true)} className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[var(--radius)] border border-border bg-surface px-3 text-sm text-fg-2 shadow-[var(--shadow-sm)] hover:border-border-strong sm:max-w-sm">
          <Search className="size-4 shrink-0" aria-hidden /><span className="truncate">Search tables, dishes, screens</span>
          <span className="ml-auto hidden gap-1 sm:flex"><Kbd>Ctrl</Kbd><Kbd>K</Kbd></span>
        </button>
        <div className="ml-auto flex items-center gap-1.5">
          {live && (live.settings.accepting
            ? <span className="hidden items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-[12px] font-semibold text-success md:inline-flex"><span className="size-2 rounded-full bg-success" />Live</span>
            : <span className="hidden items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 text-[12px] font-semibold text-warning-strong md:inline-flex">Ordering paused</span>)}
          <Button size="icon" variant="ghost" aria-label={theme === "dark" ? "Use light theme" : "Use dark theme"} onClick={e => toggle(e)}>{theme === "dark" ? <Sun /> : <Moon />}</Button>
          <Button size="icon" variant="ghost" aria-label={`Calls from tables, ${calls.length}`} onClick={() => setBell(true)} className="relative">
            <Bell />{calls.length > 0 && <span className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-coral px-1 text-[10px] font-bold text-[#171b24] ring-2 ring-background">{calls.length}</span>}
          </Button>

        </div>
      </header>

      <main className={cn("pb-[calc(112px+env(safe-area-inset-bottom))] lg:pb-10", !bleed && "px-4 pt-6 lg:px-8")}>
        {!bleed && (
          <div className="mb-6 flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-[26px] font-extrabold leading-tight text-fg lg:text-[30px]">{title}</h1>
              {sub && <p className="mt-1 text-sm text-fg-2">{sub}</p>}
            </div>
            {actions}
          </div>
        )}
        {me && <div className={cn(bleed && "px-4 pt-5 lg:px-8")}><Tour user={me.id} route={route} /></div>}
        <div key={route} className="page-in">{children}</div>
      </main>

      {/* Phones: a floating tab bar. The highlight glides to the screen you're on; the raised + opens a new order. */}
      <nav aria-label="Main" className="fixed inset-x-3 bottom-[calc(10px+env(safe-area-inset-bottom))] z-30 lg:hidden">
        <div className="relative flex items-end rounded-[22px] border border-border bg-surface/90 px-1.5 py-1.5 shadow-[0_18px_40px_-18px_rgba(15,18,24,.55)] backdrop-blur-xl">
          <Glide selector='[data-tab-on="1"] > span' watch={`${route}${moreOpen}`} className="rounded-full bg-coral-soft" />
          {tabs.map(t => {
            if (t === "centre") return (
              <button key="centre" onClick={() => go("pos")} aria-label="New order (POS)" aria-current={route === "pos" ? "page" : undefined} data-buzz
                className="relative z-[1] -mt-7 flex flex-1 flex-col items-center gap-1 text-[11px] font-bold text-fg">
                <span className={cn("grid size-14 place-items-center rounded-full bg-coral text-[#171b24] shadow-[0_10px_22px_-8px_rgba(201,74,44,.9)] ring-4 ring-background transition-transform active:scale-90",
                  route === "pos" && "bg-coral-strong text-white")}><Plus className="size-7" strokeWidth={2.6} aria-hidden /></span>
                POS
              </button>
            );
            const on = route === t.route;
            const badge = t.route === "kitchen" ? newOrders : t.route === "floor" ? calls.length : 0;
            return (
              <button key={t.route} onClick={() => go(t.route)} aria-current={on ? "page" : undefined} data-tab-on={on ? "1" : undefined}
                className={cn("relative z-[1] flex h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold text-fg-2 transition-colors", on && "text-coral-strong")}>
                <span className="relative grid h-8 w-12 place-items-center rounded-full transition-transform active:scale-90">
                  <t.Icon className="size-[22px]" aria-hidden />
                  {badge > 0 && <span className="absolute -right-0.5 -top-1 grid min-w-[18px] place-items-center rounded-full bg-coral px-1 text-[10px] font-bold leading-[18px] text-[#171b24] ring-2 ring-surface">{badge}</span>}
                </span>
                {t.short}
              </button>
            );
          })}
          {more.length > 0 && (
            <button onClick={() => setMoreOpen(true)} aria-current={more.some(n => n.route === route) ? "page" : undefined} aria-expanded={moreOpen}
              data-tab-on={more.some(n => n.route === route) || moreOpen ? "1" : undefined}
              className={cn("relative z-[1] flex h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold text-fg-2", (more.some(n => n.route === route) || moreOpen) && "text-coral-strong")}>
              <span className="grid h-8 w-12 place-items-center rounded-full transition-transform active:scale-90"><MenuIcon className="size-[22px]" aria-hidden /></span>
              More
            </button>
          )}
        </div>
      </nav>
      <Sheet open={moreOpen} onOpenChange={setMoreOpen} title="More" description={live?.settings.name}>
        <div className="grid grid-cols-3 gap-2">
          {more.map(n => (
            <button key={n.route} onClick={() => { setMoreOpen(false); go(n.route); }}
              className={cn("flex h-20 flex-col items-center justify-center gap-1.5 rounded-[var(--radius-lg)] border border-border bg-surface text-[13px] font-semibold text-fg", route === n.route && "border-ink")}>
              <n.Icon className="size-5 text-fg-2" aria-hidden />{n.short}
            </button>
          ))}
        </div>
        {restaurants.length > 1 && (
          <select aria-label="Restaurant" value={me?.restaurant_id ?? ""} onChange={e => switchTo(e.target.value)}
            className="mt-4 h-11 w-full rounded-[var(--radius)] border border-border bg-surface px-3 text-sm font-semibold text-fg">
            {restaurants.filter(r => r.active).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        )}
        <div className="mt-4 divide-y divide-border rounded-[var(--radius-lg)] border border-border">
          <button onClick={e => toggle(e)} className="flex min-h-12 w-full items-center gap-3 px-4 text-left text-[15px] font-semibold text-fg">
            {theme === "dark" ? <Sun className="size-5 text-fg-2" aria-hidden /> : <Moon className="size-5 text-fg-2" aria-hidden />}{theme === "dark" ? "Day look" : "Night look"}</button>
          <label className="flex min-h-12 items-center gap-3 px-4 text-[15px] font-semibold text-fg">
            <Vibrate className="size-5 text-fg-2" aria-hidden /><span className="flex-1">Vibrate on taps <span className="block text-[12px] font-normal text-fg-2">Android phones</span></span>
            <Switch checked={buzz} onChange={v => { setBuzz(v); try { localStorage.setItem("dineos.buzz", v ? "on" : "off"); } catch {} }} label="Vibrate on taps" />
          </label>
          {inst.state === "prompt" && <button onClick={inst.install} className="flex min-h-12 w-full items-center gap-3 px-4 text-left text-[15px] font-semibold text-blue"><Download className="size-5" aria-hidden />Install app</button>}
          {inst.state === "ios" && <button onClick={() => setHowInstall(true)} className="flex min-h-12 w-full items-center gap-3 px-4 text-left text-[15px] font-semibold text-blue"><Download className="size-5" aria-hidden />Add to Home Screen</button>}
        </div>
        <Button className="mt-4 w-full" onClick={signOut}><LogOut />Sign out · {me?.name}</Button>
      </Sheet>

      <Dialog open={howInstall} onOpenChange={setHowInstall} title="Add to Home Screen" description={`${BRAND.name} then opens full screen like an app, and can send phone alerts.`}>
        <ol className="grid gap-3 text-[15px] text-fg">
          <li className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-blue-soft text-[13px] font-bold text-blue">1</span><span>In Safari, tap the <b>Share</b> button <Share className="inline size-4 align-[-2px]" aria-label="Share icon" /> at the bottom.</span></li>
          <li className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-blue-soft text-[13px] font-bold text-blue">2</span><span>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</span></li>
          <li className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-blue-soft text-[13px] font-bold text-blue">3</span><span>Open <b>{BRAND.name}</b> from your Home Screen and sign in once.</span></li>
        </ol>
      </Dialog>

      <Dialog open={bell} onOpenChange={setBell} title="Calls from tables" description="Guests asking for a waiter, water or the bill. Done clears it for everyone.">
        {calls.length === 0 ? <p className="py-6 text-center text-sm text-fg-2">No one is waiting.</p> : (
          <ul className="divide-y divide-border">
            {calls.map(c => { const I = CALL_ICON[c.kind]; return (
              <li key={c.id} className="flex items-center gap-3 py-3">
                <span className="grid size-8 place-items-center rounded-full bg-coral-soft text-coral-strong"><I className="size-4" aria-hidden /></span>
                <span className="flex-1 text-sm text-fg"><b>{tableName(c.table_id)}</b> {CALL_LABEL[c.kind]}<span className="block text-[12px] text-fg-2">{minutesSince(c.at)} min ago{c.seen_by ? ` · ${c.seen_by} saw it` : ""}</span></span>
                {role !== "kitchen" && <Button size="sm" onClick={() => run(() => rpc("staff_call", { p_call: c.id, p_action: "done" }), "Done")}>Done</Button>}
              </li>
            ); })}
          </ul>
        )}
        <div className="mt-4 grid gap-2 border-t border-border pt-4">
          <p className="text-[13px] font-semibold text-fg">Alerts on this device</p>
          <label className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-border p-3">
            <span><span className="block text-sm font-semibold text-fg">Sound</span>
              <span className="text-[12px] text-fg-2">{role === "kitchen" ? "A chime for every new order." : "A chime when a table calls or food is ready to serve."}</span></span>
            <Switch checked={alerts.sound} onChange={alerts.setSound} label="Sound alerts" />
          </label>
          <PushBox role={role} onIosHelp={() => { setBell(false); setHowInstall(true); }} />
          {alerts.perm !== "unsupported" && (
            <div className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-border p-3">
              <span><span className="block text-sm font-semibold text-fg">Notifications</span>
                <span className="text-[12px] text-fg-2">{alerts.perm === "granted" ? `On. You'll get one while ${BRAND.name} is open in the background.` : alerts.perm === "denied" ? "Blocked in this browser's site settings." : `Show a notification while ${BRAND.name} is in the background.`}</span></span>
              {alerts.perm === "default" && <Button size="sm" onClick={alerts.askNotify}>Turn on</Button>}
            </div>
          )}
        </div>
      </Dialog>

      <Dialog open={cmd} onOpenChange={setCmd} title="Search" className="p-0 [&>div:first-child]:hidden">
        <Command label="Search" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-fg-2">
          <div className="flex items-center gap-2 border-b border-border px-4">
            <Search className="size-4 text-fg-2" aria-hidden />
            <Command.Input autoFocus placeholder="Type a table or screen" className="h-14 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-2" />
            <Kbd>Esc</Kbd>
          </div>
          <Command.List className="max-h-[360px] overflow-auto p-2">
            <Command.Empty className="px-3 py-6 text-center text-sm text-fg-2">Nothing found.</Command.Empty>
            <Command.Group heading="Go to">
              {nav.map(n => <CmdItem key={n.route} onSelect={() => { go(n.route); setCmd(false); }}><n.Icon className="size-4" />{n.label}</CmdItem>)}
            </Command.Group>
            {role !== "kitchen" && (
              <Command.Group heading="Tables">
                {(live?.tables ?? []).filter(t => t.active).map(t => {
                  const v = live?.visits.find(x => x.table_id === t.id && x.status !== "paid");
                  return <CmdItem key={t.id} onSelect={() => { location.hash = `/pos?table=${t.id}`; setCmd(false); }}>
                    <LayoutGrid className="size-4" />Table {t.code}<span className="ml-auto text-[12px] text-fg-2">{v ? (v.status === "bill" ? "Bill asked" : "In use") : "Free"}</span></CmdItem>;
                })}
              </Command.Group>
            )}
            {restaurants.length > 1 && (
              <Command.Group heading="Restaurants">
                {restaurants.filter(r => r.active && !r.current).map(r => <CmdItem key={r.id} onSelect={() => { switchTo(r.id); setCmd(false); }}><Building2 className="size-4" />{r.name}</CmdItem>)}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </Dialog>
    </div>
  );
}

function CmdItem({ children, onSelect }: { children: React.ReactNode; onSelect: () => void }) {
  return (
    <Command.Item onSelect={onSelect} className="flex h-10 cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] px-3 text-sm text-fg data-[selected=true]:bg-muted [&_svg]:text-fg-2">
      {children}
    </Command.Item>
  );
}
