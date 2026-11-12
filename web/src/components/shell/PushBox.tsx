"use client";
/* Phone alerts that arrive even when the app is closed (web push, like Vroombrite). Each phone
   turns them on for itself. The kitchen gets new orders; floor staff get calls from tables and
   food ready to serve. iPhone needs the Home Screen app (Safari rule). */
import * as React from "react";
import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/overlay";
import { isDemo, pushFn, rpc } from "@/lib/api";
import { isIOS, isStandalone } from "@/lib/install";
import type { Role } from "@/lib/types";

type St = "loading" | "demo" | "ios-install" | "unsupported" | "blocked" | "off" | "on";
const b64u = (s: string) => { const p = "=".repeat((4 - (s.length % 4)) % 4), b = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from([...b].map(c => c.charCodeAt(0))); };

async function readState(): Promise<St> {
  if (isDemo()) return "demo";
  if (isIOS() && !isStandalone()) return "ios-install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || typeof Notification === "undefined") return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  try { const reg = await navigator.serviceWorker.getRegistration(); return (reg && await reg.pushManager.getSubscription()) ? "on" : "off"; } catch { return "off"; }
}

export function PushBox({ role, onIosHelp }: { role: Role | null; onIosHelp: () => void }) {
  const [st, setSt] = React.useState<St>("loading");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { readState().then(setSt); }, []);
  const what = role === "kitchen" ? "every new order" : "calls from tables and food ready to serve";

  const on = async () => {
    setBusy(true);
    try {
      if (await Notification.requestPermission() !== "granted") throw new Error("Alerts are blocked. Allow notifications for this app in the phone's settings.");
      const reg = await navigator.serviceWorker.register("sw.js"); await navigator.serviceWorker.ready;
      const { key } = await pushFn({ action: "key" });
      const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(key!) });
      const j = sub.toJSON(), dev = isIOS() ? "iPhone" : /Android/.test(navigator.userAgent) ? "Android" : "Computer";
      await rpc("staff_push_subscribe", { p: { endpoint: j.endpoint, p256dh: j.keys?.p256dh, auth: j.keys?.auth, device: dev } });
      await pushFn({ action: "test" }).catch(() => {});
      setSt("on"); toast("Phone alerts are on. A test alert is on its way.");
    } catch (e) { toast((e as Error).message, "error"); setSt(await readState()); } finally { setBusy(false); }
  };
  const off = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration(); const sub = reg && await reg.pushManager.getSubscription();
      if (sub) { await rpc("staff_push_unsubscribe", { p_endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); }
      setSt("off"); toast("Phone alerts are off on this phone");
    } finally { setBusy(false); }
  };

  if (st === "loading") return null;
  return (
    <div className="flex items-start gap-3 rounded-[var(--radius)] border border-border p-3">
      <BellRing className="mt-0.5 size-5 shrink-0 text-coral-strong" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-fg">Phone alerts{st === "on" && <span className="ml-2 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-bold text-success">On</span>}</p>
        <p className="text-[12px] text-fg-2">{{
          demo: "Alerts that arrive even with the app closed. They work on the live app, not in the demo.",
          "ios-install": "On iPhone, alerts work only from the Home Screen app.",
          unsupported: "This browser can't show alerts. Use Chrome on Android, or the Home Screen app on iPhone.",
          blocked: "Notifications are blocked for this app. Allow them in the phone's settings, then come back.",
          off: `An alert on this phone for ${what}, even when the app is closed.`,
          on: `This phone gets an alert for ${what}, even when the app is closed.`,
          loading: "",
        }[st]}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {st === "off" && <Button size="sm" variant="primary" disabled={busy} onClick={on}>Turn on phone alerts</Button>}
          {st === "on" && <><Button size="sm" disabled={busy} onClick={() => pushFn({ action: "test" }).then(() => toast("Test alert sent")).catch(e => toast(e.message, "error"))}>Send a test</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={off}>Turn off</Button></>}
          {st === "ios-install" && <Button size="sm" onClick={onIosHelp}>How to add it</Button>}
        </div>
      </div>
    </div>
  );
}
