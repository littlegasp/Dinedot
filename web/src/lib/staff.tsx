"use client";
/* Who is signed in, which restaurant, and the live picture of the floor (staff_live, every 4 s). */
import * as React from "react";
import { Auth, isDemo, onSignOut, rpc } from "./api";
import type { Live, Me, RestaurantRow, Role } from "./types";

type Ctx = {
  me: Me; live: Live | null; error: string; offline: boolean;
  role: Role | null; demo: boolean; restaurants: RestaurantRow[];
  reload: () => Promise<void>;           // fetch staff_live now (after an action)
  reloadMe: () => Promise<void>;
  signOut: () => Promise<void>;
  can: (what: "floor" | "manage" | "own") => boolean;
};
const StaffCtx = React.createContext<Ctx | null>(null);
export const useStaff = () => { const c = React.useContext(StaffCtx); if (!c) throw new Error("useStaff outside provider"); return c; };

export function StaffProvider({ children, onSignedOut }: { children: React.ReactNode; onSignedOut: () => void }) {
  const [me, setMe] = React.useState<Me>(null);
  const [live, setLive] = React.useState<Live | null>(null);
  const [restaurants, setRestaurants] = React.useState<RestaurantRow[]>([]);
  const [error, setError] = React.useState("");
  const [offline, setOffline] = React.useState(false);
  const busy = React.useRef(false);

  const reloadMe = React.useCallback(async () => {
    const [m, rs] = await Promise.all([rpc<Me>("staff_me"), rpc<RestaurantRow[]>("staff_restaurants").catch(() => [])]);
    setMe(m); setRestaurants(rs ?? []);
  }, []);

  const reload = React.useCallback(async () => {
    if (busy.current) return; busy.current = true;
    try { setLive(await rpc<Live>("staff_live")); setError(""); setOffline(false); }
    catch (e) { const x = e as Error & { offline?: boolean }; if (x.offline) setOffline(true); else setError(x.message); }
    finally { busy.current = false; }
  }, []);

  React.useEffect(() => onSignOut(onSignedOut), [onSignedOut]);
  React.useEffect(() => { reloadMe().catch(e => setError((e as Error).message)); }, [reloadMe]);

  const active = !!(me?.active && me.role);
  React.useEffect(() => {
    if (!active) return;
    reload();
    const t = setInterval(() => { if (document.visibilityState === "visible") reload(); }, 4000);
    const back = () => { if (document.visibilityState === "visible") reload(); };
    document.addEventListener("visibilitychange", back); window.addEventListener("online", back);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", back); window.removeEventListener("online", back); };
  }, [active, reload, me?.restaurant_id]);

  const role = active ? (me!.role as Role) : null;
  const value: Ctx = {
    me, live, error, offline, role, demo: isDemo(), restaurants, reload, reloadMe,
    signOut: async () => { await Auth.signOut(); onSignedOut(); },
    can: what => !!role && (what === "own" ? role === "owner" : what === "manage" ? role === "owner" || role === "manager" : role !== "kitchen"),
  };
  return <StaffCtx.Provider value={value}>{children}</StaffCtx.Provider>;
}

/* Small helpers the screens share ------------------------------------------------------ */
export const minutesSince = (iso: string | null | undefined, now = Date.now()) => (iso ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000)) : 0);

/** Runs an action, shows its error as a toast, then refreshes the live picture. */
export function useAction() {
  const { reload } = useStaff();
  const [pending, setPending] = React.useState(false);
  const run = React.useCallback(async <T,>(fn: () => Promise<T>, ok?: string): Promise<T | undefined> => {
    const { toast } = await import("@/components/ui/overlay");
    setPending(true);
    try { const r = await fn(); if (ok) toast(ok); await reload(); return r; }
    catch (e) { toast((e as Error).message, "error"); return undefined; }
    finally { setPending(false); }
  }, [reload]);
  return { run, pending };
}
