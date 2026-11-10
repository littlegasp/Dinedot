"use client";
import * as React from "react";
import { Command } from "cmdk";
import { Bell, ChefHat, CircleHelp, LayoutDashboard, LayoutGrid, Megaphone, Moon, QrCode, Receipt, RefreshCw, Search, Settings, Smartphone, Sun, UtensilsCrossed, WifiOff, X } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/overlay";
import { NOTIFICATIONS, MENU, TABLES } from "@/lib/mock";
import { cn } from "@/lib/utils";

export type Route = "owner" | "pos" | "kds" | "waiter" | "guest" | "design";
export type Role = "Owner" | "Manager" | "Cashier" | "Waiter" | "Kitchen";

export const NAV: { route: Route; label: string; short: string; Icon: typeof Bell; roles: Role[] }[] = [
  { route: "owner", label: "Today", short: "Today", Icon: LayoutDashboard, roles: ["Owner", "Manager"] },
  { route: "pos", label: "POS & billing", short: "POS", Icon: Receipt, roles: ["Owner", "Manager", "Cashier"] },
  { route: "waiter", label: "Floor", short: "Floor", Icon: LayoutGrid, roles: ["Owner", "Manager", "Cashier", "Waiter"] },
  { route: "kds", label: "Kitchen", short: "Kitchen", Icon: ChefHat, roles: ["Owner", "Manager", "Kitchen"] },
  { route: "guest", label: "Guest QR page", short: "Guest", Icon: Smartphone, roles: ["Owner", "Manager"] },
];
const LATER = [
  { label: "Menu", Icon: UtensilsCrossed }, { label: "Tables & QR", Icon: QrCode },
  { label: "Settings", Icon: Settings }, { label: "Help", Icon: CircleHelp },
];

export function useTheme() {
  const [theme, setTheme] = React.useState<"light" | "dark">("light");
  React.useEffect(() => { setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light"); }, []);
  const toggle = () => {
    const t = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = t; setTheme(t);
    try { localStorage.setItem("dineos.theme", t); } catch {}
  };
  return { theme, toggle };
}

export function AppShell({ route, go, role, setRole, children, title, sub, actions, bleed }: {
  route: Route; go: (r: Route) => void; role: Role; setRole: (r: Role) => void; children: React.ReactNode;
  title: string; sub?: React.ReactNode; actions?: React.ReactNode; bleed?: boolean;
}) {
  const { theme, toggle } = useTheme();
  const [cmd, setCmd] = React.useState(false);
  const [bell, setBell] = React.useState(false);
  const [notice, setNotice] = React.useState(true);
  const [update, setUpdate] = React.useState(true);
  const nav = NAV.filter(n => n.roles.includes(role));

  React.useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setCmd(o => !o); } };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, []);

  return (
    <div className="min-h-dvh lg:pl-[248px]">
      {/* Sidebar ---------------------------------------------------------------- */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-border bg-surface lg:flex">
        <div className="flex h-16 items-center px-5"><Logo /></div>
        <div className="px-3 pb-3">
          <div className="rounded-[var(--radius)] border border-border bg-muted/60 p-3">
            <p className="text-[13px] font-bold text-fg">The Copper Pot</p>
            <p className="text-[12px] text-fg-2">Bandra West · Open till 11:30 pm</p>
          </div>
        </div>
        <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-auto px-3">
          {nav.map(n => (
            <button key={n.route} onClick={() => go(n.route)} aria-current={route === n.route ? "page" : undefined}
              className={cn("flex h-10 w-full items-center gap-3 rounded-[var(--radius)] px-3 text-sm font-semibold text-fg-2 hover:bg-muted hover:text-fg",
                route === n.route && "bg-ink text-surface hover:bg-ink hover:text-surface")}>
              <n.Icon className="size-[18px]" aria-hidden />{n.label}
              {n.route === "kds" && <span className="ml-auto rounded-full bg-coral px-1.5 text-[11px] font-bold text-[#171b24]">2</span>}
            </button>
          ))}
          <p className="px-3 pb-1 pt-5 text-[11px] font-bold uppercase tracking-wider text-fg-2">Coming in the build</p>
          {LATER.map(l => (
            <div key={l.label} className="flex h-9 items-center gap-3 px-3 text-sm text-fg-2/70"><l.Icon className="size-[18px]" aria-hidden />{l.label}</div>
          ))}
        </nav>
        <div className="border-t border-border p-3">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-fg-2" htmlFor="role">Preview as</label>
          <select id="role" value={role} onChange={e => setRole(e.target.value as Role)}
            className="mt-1.5 h-9 w-full rounded-[var(--radius-sm)] border border-border bg-surface px-2 text-sm font-semibold text-fg">
            {(["Owner", "Manager", "Cashier", "Waiter", "Kitchen"] as Role[]).map(r => <option key={r}>{r}</option>)}
          </select>
        </div>
      </aside>

      {/* Update bar + team notice (house features) ------------------------------- */}
      {update && (
        <div className="flex items-center gap-3 bg-ink px-4 py-2 text-[13px] text-surface lg:px-8">
          <RefreshCw className="size-4 shrink-0" aria-hidden />
          <span className="flex-1">A new version of DineOS is ready. Your open bills are safe.</span>
          <button className="font-bold underline underline-offset-2" onClick={() => setUpdate(false)}>Refresh now</button>
          <button aria-label="Dismiss" onClick={() => setUpdate(false)}><X className="size-4" /></button>
        </div>
      )}

      {/* Top bar ---------------------------------------------------------------- */}
      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur-sm lg:px-8">
        <div className="lg:hidden"><Logo compact /></div>
        <button onClick={() => setCmd(true)} className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[var(--radius)] border border-border bg-surface px-3 text-sm text-fg-2 shadow-[var(--shadow-sm)] hover:border-border-strong sm:max-w-sm">
          <Search className="size-4 shrink-0" aria-hidden /><span className="truncate">Search tables, dishes, bills</span>
          <span className="ml-auto hidden gap-1 sm:flex"><Kbd>Ctrl</Kbd><Kbd>K</Kbd></span>
        </button>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="hidden items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-[12px] font-semibold text-success md:inline-flex">
            <span className="size-2 rounded-full bg-success" />Live
          </span>
          <Button size="icon" variant="ghost" aria-label={theme === "dark" ? "Use light theme" : "Use dark theme"} onClick={toggle}>
            {theme === "dark" ? <Sun /> : <Moon />}
          </Button>
          <Button size="icon" variant="ghost" aria-label="Notifications, 2 new" onClick={() => setBell(true)} className="relative">
            <Bell /><span className="absolute right-2 top-2 size-2 rounded-full bg-coral ring-2 ring-background" />
          </Button>
          <div className="ml-1 grid size-9 place-items-center rounded-full bg-blue-soft text-[13px] font-bold text-blue" aria-label={`Signed in as ${role}`}>{role[0]}</div>
        </div>
      </header>

      <main className={cn("pb-24 lg:pb-10", !bleed && "px-4 pt-6 lg:px-8")}>
        {notice && !bleed && (
          <div className="mb-5 flex items-start gap-3 rounded-[var(--radius-lg)] border border-blue/25 bg-blue-soft px-4 py-3 text-[13px] text-fg">
            <Megaphone className="mt-0.5 size-4 shrink-0 text-blue" aria-hidden />
            <p className="flex-1"><b>Team notice from the owner:</b> Terrace closes at 10 pm tonight for a private booking. Seat walk-ins inside.</p>
            <button aria-label="Dismiss notice" onClick={() => setNotice(false)} className="text-fg-2 hover:text-fg"><X className="size-4" /></button>
          </div>
        )}
        {!bleed && (
          <div className="mb-6 flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-[26px] font-extrabold leading-tight text-fg lg:text-[30px]">{title}</h1>
              {sub && <p className="mt-1 text-sm text-fg-2">{sub}</p>}
            </div>
            {actions}
          </div>
        )}
        {children}
      </main>

      {/* Phone bottom tabs ------------------------------------------------------- */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        {nav.slice(0, 5).map(n => (
          <button key={n.route} onClick={() => go(n.route)} aria-current={route === n.route ? "page" : undefined}
            className={cn("flex h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold text-fg-2", route === n.route && "text-fg")}>
            <span className={cn("grid h-7 w-12 place-items-center rounded-full", route === n.route && "bg-coral-soft text-coral-strong")}><n.Icon className="size-5" aria-hidden /></span>
            {n.short}
          </button>
        ))}
      </nav>

      {/* Bell ------------------------------------------------------------------- */}
      <Dialog open={bell} onOpenChange={setBell} title="Notifications" description="Calls, bills and kitchen alerts from the last hour.">
        <ul className="divide-y divide-border">
          {NOTIFICATIONS.map(n => (
            <li key={n.id} className="flex items-center gap-3 py-3">
              <span className={cn("size-2.5 shrink-0 rounded-full", n.tone === "coral" ? "bg-coral" : n.tone === "warning" ? "bg-warning" : "bg-success")} />
              <span className="flex-1 text-sm text-fg">{n.text}</span><span className="text-[12px] text-fg-2">{n.time}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center gap-2 rounded-[var(--radius)] bg-muted px-3 py-2 text-[12px] text-fg-2">
          <WifiOff className="size-3.5" aria-hidden />If the internet drops, orders queue on this device and send when it is back.
        </div>
      </Dialog>

      {/* Command palette -------------------------------------------------------- */}
      <Dialog open={cmd} onOpenChange={setCmd} title="Search" className="p-0 [&>div:first-child]:hidden">
        <Command label="Search" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-fg-2">
          <div className="flex items-center gap-2 border-b border-border px-4">
            <Search className="size-4 text-fg-2" aria-hidden />
            <Command.Input autoFocus placeholder="Type a table, dish or screen" className="h-14 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-2" />
            <Kbd>Esc</Kbd>
          </div>
          <Command.List className="max-h-[360px] overflow-auto p-2">
            <Command.Empty className="px-3 py-6 text-center text-sm text-fg-2">Nothing found.</Command.Empty>
            <Command.Group heading="Go to">
              {nav.map(n => <CmdItem key={n.route} onSelect={() => { go(n.route); setCmd(false); }}><n.Icon className="size-4" />{n.label}</CmdItem>)}
            </Command.Group>
            <Command.Group heading="Tables">
              {TABLES.filter(t => t.state !== "free").map(t => <CmdItem key={t.id} onSelect={() => { go("waiter"); setCmd(false); }}><LayoutGrid className="size-4" />Table {t.name}<span className="ml-auto text-[12px] text-fg-2">{t.waiter}</span></CmdItem>)}
            </Command.Group>
            <Command.Group heading="Dishes">
              {MENU.slice(0, 8).map(d => <CmdItem key={d.id} onSelect={() => setCmd(false)}><UtensilsCrossed className="size-4" />{d.name}</CmdItem>)}
            </Command.Group>
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
