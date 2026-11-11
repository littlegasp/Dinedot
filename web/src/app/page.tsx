"use client";
import * as React from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Toaster, toast } from "@/components/ui/overlay";
import { Auth } from "@/lib/api";
import { HOME, NAV, ROUTES, type Route } from "@/lib/routes";
import { StaffProvider, useStaff } from "@/lib/staff";
import { BillsScreen } from "@/screens/Bills";
import { DesignScreen } from "@/screens/Design";
import { FloorScreen } from "@/screens/Floor";
import { HelpScreen } from "@/screens/Help";
import { KitchenScreen } from "@/screens/Kitchen";
import { MenuScreen } from "@/screens/Menu";
import { PosScreen } from "@/screens/Pos";
import { SettingsScreen } from "@/screens/Settings";
import { NewPassword, NoRestaurant, SignIn } from "@/screens/SignIn";
import { TablesScreen } from "@/screens/Tables";
import { TeamScreen } from "@/screens/Team";
import { TodayScreen } from "@/screens/Today";
import { BRAND } from "@/lib/brand";

/* Staff app: one page with hash routes (#/today, #/pos?table=…, #/menu …), so it works as
   plain files on any host. The guest page is t.html?k=<token>. */
type Loc = { route: Route | ""; params: URLSearchParams };
const parse = (): Loc => {
  const [path, qs] = location.hash.replace(/^#\/?/, "").split("?");
  return { route: (ROUTES as string[]).includes(path) ? (path as Route) : "", params: new URLSearchParams(qs ?? "") };
};

export default function StaffPage() {
  const [state, setState] = React.useState<"loading" | "out" | "in" | "recovery">("loading");
  React.useEffect(() => { setState(Auth.takeRecovery() ? "recovery" : Auth.signedIn() ? "in" : "out"); }, []);
  const out = React.useCallback(() => setState("out"), []);
  if (state === "loading") return null;
  if (state === "out") return <><SignIn onDone={() => setState("in")} /><Toaster /></>;
  if (state === "recovery") return <><NewPassword onDone={() => { setState("in"); toast("New password saved"); }} /><Toaster /></>;
  return <StaffProvider onSignedOut={out}><Staff /><Toaster /></StaffProvider>;
}

function Staff() {
  const { me, role, error } = useStaff();
  const [loc, setLoc] = React.useState<Loc>({ route: "", params: new URLSearchParams() });
  React.useEffect(() => {
    const read = () => { setLoc(parse()); window.scrollTo(0, 0); };
    read(); window.addEventListener("hashchange", read); return () => window.removeEventListener("hashchange", read);
  }, []);
  const go = React.useCallback((hash: string) => { location.hash = hash; }, []);
  const [today, setToday] = React.useState("");
  React.useEffect(() => { setToday(new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })); }, []);

  // A screen this role can't open (an old link, someone else's bookmark) shows home; fix the address bar
  // after drawing, and only if the address still points at that screen (so it never races a real move).
  const shown = me && role ? (loc.route && (loc.route === "design" || NAV.some(n => n.route === loc.route && n.roles.includes(role))) ? loc.route : HOME[role]) : null;
  React.useEffect(() => {
    if (!shown || loc.route === shown) return;
    if (parse().route === loc.route) history.replaceState(null, "", `#/${shown}`);
  }, [shown, loc.route]);

  if (!me) return error ? <p className="p-8 text-center text-sm text-danger">{error}</p> : null;
  if (!role) return <NoRestaurant />;

  const allowed = (r: Route) => r === "design" || NAV.some(n => n.route === r && n.roles.includes(role));
  const route: Route = loc.route && allowed(loc.route) ? loc.route : HOME[role];
  const tableId = loc.params.get("table");


  const page: Record<Route, { title: string; sub?: string; el: React.ReactNode; bleed?: boolean }> = {
    today: { title: `Good ${greeting()}, ${me.name.split(" ")[0]}`, sub: today, el: <TodayScreen go={go} /> },
    pos: { title: "POS & billing", sub: "Pick a table, add dishes, send to the kitchen, take payment.",
      el: <PosScreen tableId={tableId} payNow={loc.params.get("pay") === "1"} setTableId={id => go(`/pos?table=${id}`)} /> },
    floor: { title: "Floor", sub: "Tap a table to see its orders, serve, add items or take payment.",
      el: <FloorScreen openPos={(id, pay) => go(`/pos?table=${id}${pay ? "&pay=1" : ""}`)} /> },
    kitchen: { title: "Kitchen", el: <KitchenScreen />, bleed: true },
    bills: { title: "Bills", sub: "Every closed bill, with how it was paid.", el: <BillsScreen /> },
    menu: { title: "Menu", sub: "Sections and dishes on the QR menu and in the POS.", el: <MenuScreen /> },
    tables: { title: "Tables & QR", sub: "Your tables and the QR card on each one.", el: <TablesScreen /> },
    team: { title: "Team", sub: "Who can sign in, and what they can do.", el: <TeamScreen /> },
    settings: { title: "Settings", sub: "Restaurant details, bill, payments and the guest page.", el: <SettingsScreen /> },
    help: { title: "Help", sub: "How each screen works, in plain words.", el: <HelpScreen focus={loc.params.get("topic")} /> },
    design: { title: "Design system", sub: `${BRAND.name} colours and components.`, el: <DesignScreen /> },
  };
  const p = page[route];

  return (
    <AppShell route={route} go={r => go(`/${r}`)} title={p.title} sub={p.sub} bleed={p.bleed}>
      {p.el}
    </AppShell>
  );
}

const greeting = () => { const h = new Date().getHours(); return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening"; };
