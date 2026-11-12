"use client";
/* Installing the staff app on a phone or computer ("Add to Home Screen"). Android and desktop
   Chrome/Edge offer an install prompt we can open from a button; iPhone and iPad only allow it
   from Safari's Share menu, so there we show the steps instead. */
import * as React from "react";

type Prompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
let saved: Prompt | null = null;
const subs = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); saved = e as Prompt; subs.forEach(f => f()); });
  window.addEventListener("appinstalled", () => { saved = null; subs.forEach(f => f()); });
}

export const isStandalone = () => typeof window !== "undefined" &&
  (matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
export const isIOS = () => typeof navigator !== "undefined" && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

export type InstallState = "installed" | "prompt" | "ios" | "unavailable";

export function useInstall() {
  const [state, setState] = React.useState<InstallState>("unavailable");
  React.useEffect(() => {
    const read = () => setState(isStandalone() ? "installed" : saved ? "prompt" : isIOS() ? "ios" : "unavailable");
    read(); subs.add(read); return () => { subs.delete(read); };
  }, []);
  const install = async () => {
    if (!saved) return false;
    await saved.prompt();
    const { outcome } = await saved.userChoice;
    saved = null; subs.forEach(f => f());
    return outcome === "accepted";
  };
  return { state, install };
}

/** The service worker (sw.js): needed for phone alerts with the app closed. It caches nothing. */
export function registerWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator) || location.protocol === "file:") return;
  navigator.serviceWorker.register("sw.js").catch(() => { /* private window or blocked: the app works without it */ });
}
