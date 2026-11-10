"use client";
import * as React from "react";
import { AppShell, HOME, NAV, type Route } from "@/components/shell/AppShell";
import { Toaster } from "@/components/ui/overlay";
import { Auth } from "@/lib/api";
import { StaffProvider, useStaff } from "@/lib/staff";
import { DesignScreen } from "@/screens/Design";
import { FloorScreen } from "@/screens/Floor";
import { KitchenScreen } from "@/screens/Kitchen";
import { PosScreen } from "@/screens/Pos";
import { NoRestaurant, SignIn } from "@/screens/SignIn";
import { TodayScreen } from "@/screens/Today";

/* Staff app: one page with hash routes (#/today, #/pos?table=…, #/floor, #/kitchen),
   so it works as plain files on any host. The guest page is t.html?k=<token>. */
type Loc = { route: Route; params: URLSearchParams };
const parse = (): Loc => {
  const [path, qs] = location.hash.replace(/^#\/?/, "").split("?");
  const r = path as Route;
  return { route: (["today", "pos", "floor", "kitchen", "design"] as Route[]).includes(r) ? r : ("" as Route), params: new URLSearchParams(qs ?? "") };
};

export default function StaffPage() {
  const [signedIn, setSignedIn] = React.useState<boolean | null>(null);
  React.useEffect(() => { setSignedIn(Auth.signedIn()); }, []);
  const out = React.useCallback(() => setSignedIn(false), []);
  if (signedIn === null) return null;
  if (!signedIn) return <><SignIn onDone={() => setSignedIn(true)} /><Toaster /></>;
  return <StaffProvider onSignedOut={out}><Staff /><Toaster /></StaffProvider>;
}

function Staff() {
  const { me, role, error } = useStaff();
  const [loc, setLoc] = React.useState<Loc>({ route: "" as Route, params: new URLSearchParams() });
  React.useEffect(() => {
    const read = () => setLoc(parse());
    read(); window.addEventListener("hashchange", read); return () => window.removeEventListener("hashchange", read);
  }, []);
  const go = React.useCallback((hash: string) => { location.hash = hash; }, []);

  if (!me) return error ? <p className="p-8 text-center text-sm text-danger">{error}</p> : null;
  if (!role) return <NoRestaurant />;

  const allowed = (r: Route) => r === "design" || NAV.some(n => n.route === r && n.roles.includes(role));
  const route: Route = loc.route && allowed(loc.route) ? loc.route : HOME[role];
  const nav = (r: Route) => go(`/${r}`);
  const tableId = loc.params.get("table");

  const page = {
    today: { title: `Good ${greeting()}, ${me.name.split(" ")[0]}`, sub: new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" }), el: <TodayScreen go={go} /> },
    pos: { title: "POS & billing", sub: "Pick a table, add dishes, send to the kitchen, take payment.",
      el: <PosScreen tableId={tableId} payNow={loc.params.get("pay") === "1"} setTableId={id => go(`/pos?table=${id}`)} /> },
    floor: { title: "Floor", sub: "Tap a table to see its orders, serve, add items or take payment.",
      el: <FloorScreen openPos={(id, pay) => go(`/pos?table=${id}${pay ? "&pay=1" : ""}`)} /> },
    kitchen: { title: "Kitchen", el: <KitchenScreen />, bleed: true },
    design: { title: "Design system", sub: "DineOS colours and components.", el: <DesignScreen /> },
  }[route];

  return (
    <AppShell route={route} go={nav} title={page.title} sub={"sub" in page ? page.sub : undefined} bleed={"bleed" in page}>
      {page.el}
    </AppShell>
  );
}

const greeting = () => { const h = new Date().getHours(); return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening"; };
