import { BookOpen, ChefHat, CircleHelp, LayoutDashboard, LayoutGrid, QrCode, Receipt, ScrollText, Settings, Users, UtensilsCrossed } from "lucide-react";
import type { Role } from "./types";

/** Every screen of the staff app. Adding one here means adding its Help section too
    (src/content/guide.ts is typed as Record<Route, …>, so the build fails without it). */
export type Route = "today" | "pos" | "floor" | "kitchen" | "bills" | "menu" | "tables" | "team" | "settings" | "help" | "design";

export type NavItem = { route: Route; label: string; short: string; Icon: typeof Receipt; roles: Role[]; group: "service" | "manage" | "help" };
const ALL: Role[] = ["owner", "manager", "cashier", "waiter", "kitchen"];
const FLOOR: Role[] = ["owner", "manager", "cashier", "waiter"];

/** Roles mirror the database checks (is_floor / is_manager / is_owner); the database refuses anyway. */
export const NAV: NavItem[] = [
  { route: "today", label: "Today", short: "Today", Icon: LayoutDashboard, roles: ["owner", "manager"], group: "service" },
  { route: "pos", label: "POS & billing", short: "POS", Icon: Receipt, roles: FLOOR, group: "service" },
  { route: "floor", label: "Floor", short: "Floor", Icon: LayoutGrid, roles: FLOOR, group: "service" },
  { route: "kitchen", label: "Kitchen", short: "Kitchen", Icon: ChefHat, roles: ALL, group: "service" },
  { route: "bills", label: "Bills", short: "Bills", Icon: ScrollText, roles: FLOOR, group: "service" },
  { route: "menu", label: "Menu", short: "Menu", Icon: UtensilsCrossed, roles: ALL, group: "manage" },
  { route: "tables", label: "Tables & QR", short: "Tables", Icon: QrCode, roles: ["owner", "manager"], group: "manage" },
  { route: "team", label: "Team", short: "Team", Icon: Users, roles: ["owner"], group: "manage" },
  { route: "settings", label: "Settings", short: "Settings", Icon: Settings, roles: ["owner"], group: "manage" },
  { route: "help", label: "Help", short: "Help", Icon: CircleHelp, roles: ALL, group: "help" },
];
export const ROUTES: Route[] = [...NAV.map(n => n.route), "design"];
export const HOME: Record<Role, Route> = { owner: "today", manager: "today", cashier: "pos", waiter: "floor", kitchen: "kitchen" };
export const GuideIcon = BookOpen;
