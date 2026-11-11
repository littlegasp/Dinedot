"use client";
/* Alerts while the app is open (in front or in a background tab): a chime, a buzz on phones and,
   if allowed, a phone/desktop notification. Kitchen hears new orders; floor staff hear calls from
   tables and food that is ready to serve. Each person turns sound and notifications on or off
   on their own device. Nothing about guests is sent anywhere. */
import * as React from "react";
import type { Live, Role } from "./types";

const SOUND = "dineos.sound";
const readSound = () => { try { return localStorage.getItem(SOUND) !== "off"; } catch { return true; } };

let ctx: AudioContext | null = null;
function unlock() {   // browsers only allow sound after the person has touched the page once
  try { ctx ??= new AudioContext(); if (ctx.state === "suspended") ctx.resume(); } catch { /* no audio */ }
}
export function chime(kind: "order" | "call" | "ready") {
  if (!ctx) return;
  const notes = kind === "call" ? [880, 660, 880] : kind === "ready" ? [523, 784] : [660, 880, 1046];
  notes.forEach((f, i) => {
    const o = ctx!.createOscillator(), g = ctx!.createGain(), t = ctx!.currentTime + i * 0.16;
    o.type = "sine"; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    o.connect(g).connect(ctx!.destination); o.start(t); o.stop(t + 0.16);
  });
}

export function useAlertSettings() {
  const [sound, setSound] = React.useState(true);
  const [perm, setPerm] = React.useState<NotificationPermission | "unsupported">("default");
  React.useEffect(() => { setSound(readSound()); setPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission); }, []);
  return {
    sound, perm,
    setSound: (on: boolean) => { setSound(on); try { localStorage.setItem(SOUND, on ? "on" : "off"); } catch { /* private window */ } if (on) { unlock(); chime("order"); } },
    askNotify: async () => { if (typeof Notification === "undefined") return; setPerm(await Notification.requestPermission()); },
  };
}

type Event = { key: string; kind: "order" | "call" | "ready"; title: string; body: string };
function eventsFor(live: Live, role: Role, kitchenScreen: boolean): Event[] {
  const name = (tableId: string | null, token: number | null) => tableId ? (live.tables.find(t => t.id === tableId)?.code ?? "") : `Token ${token}`;
  const out: Event[] = [];
  const kitchen = role === "kitchen" || kitchenScreen;
  for (const v of live.visits) for (const o of v.orders) {
    if (kitchen && o.status === "new") out.push({ key: `o:${o.id}`, kind: "order", title: `New order · ${name(v.table_id, v.token)}`, body: o.items.map(i => `${i.qty}× ${i.name}`).join(", ") });
    if (!kitchen && o.status === "ready") out.push({ key: `r:${o.id}`, kind: "ready", title: `Ready to serve · ${name(v.table_id, v.token)}`, body: `Order #${o.no}` });
  }
  if (!kitchen) for (const c of live.calls) {
    const what = { waiter: "called a waiter", water: "asked for water", bill: "asked for the bill", help: "needs help" }[c.kind];
    out.push({ key: `c:${c.id}`, kind: "call", title: `${name(c.table_id, null)} ${what}`, body: "Tap to open DineOS" });
  }
  return out;
}

/** Watches the live picture; alerts once per new event (never for what was there when the page opened). */
export function useAlerts(live: Live | null, role: Role | null, kitchenScreen: boolean) {
  const seen = React.useRef<Set<string> | null>(null);
  React.useEffect(() => {
    const u = () => unlock();
    window.addEventListener("pointerdown", u, { once: true }); window.addEventListener("keydown", u, { once: true });
    return () => { window.removeEventListener("pointerdown", u); window.removeEventListener("keydown", u); };
  }, []);
  React.useEffect(() => { seen.current = null; }, [kitchenScreen, role]);
  React.useEffect(() => {
    if (!live || !role) return;
    const evs = eventsFor(live, role, kitchenScreen);
    if (!seen.current) { seen.current = new Set(evs.map(e => e.key)); return; }
    const fresh = evs.filter(e => !seen.current!.has(e.key));
    evs.forEach(e => seen.current!.add(e.key));
    if (!fresh.length) return;
    const first = fresh[0];
    if (readSound()) { chime(first.kind); try { navigator.vibrate?.(first.kind === "call" ? [120, 80, 120] : 150); } catch { /* not a phone */ } }
    if (document.visibilityState === "hidden" && typeof Notification !== "undefined" && Notification.permission === "granted") {
      for (const e of fresh.slice(0, 3)) { try { const n = new Notification(e.title, { body: e.body, tag: e.key }); n.onclick = () => { window.focus(); n.close(); }; } catch { /* some phones need a service worker */ } }
    }
  }, [live, role, kitchenScreen]);
}

/** Keeps a kitchen tablet's screen on while the kitchen screen is open (where the browser allows it). */
export function useWakeLock(on: boolean) {
  React.useEffect(() => {
    if (!on || !("wakeLock" in navigator)) return;
    let lock: { release: () => Promise<void> } | null = null;
    const take = async () => { try { lock = await (navigator as Navigator & { wakeLock: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock.request("screen"); } catch { /* battery saver or not allowed */ } };
    const back = () => { if (document.visibilityState === "visible") take(); };
    take(); document.addEventListener("visibilitychange", back);
    return () => { document.removeEventListener("visibilitychange", back); lock?.release().catch(() => {}); };
  }, [on]);
}
