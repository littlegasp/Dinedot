"use client";
import * as React from "react";
import { Palette } from "lucide-react";
import { AppShell, NAV, type Role, type Route } from "@/components/shell/AppShell";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/overlay";
import { OwnerScreen } from "@/screens/Owner";
import { PosScreen } from "@/screens/Pos";
import { KitchenScreen } from "@/screens/Kitchen";
import { WaiterScreen } from "@/screens/Waiter";
import { GuestScreen } from "@/screens/Guest";
import { DesignScreen } from "@/screens/Design";

/* Design prototype: one page, hash routes (#/owner, #/pos, #/kds, #/waiter, #/guest, #/design)
   so it works as a single static file. The real app will use proper routes. */
const ROUTES: Route[] = ["owner", "pos", "kds", "waiter", "guest", "design"];
const HOME: Record<Role, Route> = { Owner: "owner", Manager: "owner", Cashier: "pos", Waiter: "waiter", Kitchen: "kds" };

export default function Prototype() {
  const [route, setRoute] = React.useState<Route>("owner");
  const [role, setRole] = React.useState<Role>("Owner");
  const [today, setToday] = React.useState("Today");
  React.useEffect(() => { setToday(new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })); }, []);

  React.useEffect(() => {
    const read = () => { const r = location.hash.replace("#/", "") as Route; setRoute(ROUTES.includes(r) ? r : "owner"); window.scrollTo(0, 0); };
    read(); window.addEventListener("hashchange", read); return () => window.removeEventListener("hashchange", read);
  }, []);
  const go = (r: Route) => { location.hash = `/${r}`; };
  const changeRole = (r: Role) => { setRole(r); if (!NAV.find(n => n.route === route)?.roles.includes(r)) go(HOME[r]); };

  if (route === "guest") return <><GuestScreen onExit={() => go("owner")} /><Toaster /></>;

  const page = {
    owner: { title: "Good evening, Kavya", sub: `${today} · dinner service is on`, el: <OwnerScreen />,
      actions: <Button size="sm" variant="ghost" onClick={() => go("design")}><Palette />Design system</Button> },
    pos: { title: "POS & billing", sub: "Dine-in and takeaway. Totals are worked out by the server, never the browser.", el: <PosScreen /> },
    waiter: { title: "Floor", sub: "Tap a table to seat guests, add items or print the bill.", el: <WaiterScreen onOrder={() => go("pos")} /> },
    kds: { title: "Kitchen", el: <KitchenScreen />, bleed: true },
    design: { title: "Design system", sub: "DineOS tokens and components. Same set in every screen.", el: <DesignScreen /> },
  }[route];

  return (
    <>
      <AppShell route={route} go={go} role={role} setRole={changeRole} title={page.title} sub={"sub" in page ? page.sub : undefined}
        actions={"actions" in page ? page.actions : undefined} bleed={"bleed" in page}>
        {page.el}
      </AppShell>
      <Toaster />
    </>
  );
}
