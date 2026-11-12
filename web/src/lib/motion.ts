"use client";
/* The app's feel, taken from Studio CRM and Vroombrite:
   - switchWithInk: day/night spreads like ink from the sun/moon button (browser page transition;
     older browsers and phones set to Reduce Motion just switch);
   - installClickFeel: a soft ripple from where you press, and a tiny buzz on Android for actions;
   - celebrate: a short burst when a bill is paid.
   Nothing here changes what a button does. */
import { flushSync } from "react-dom";

const calm = () => typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- ink day/night ---------- */
const INK = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><path d='M169.4 97Q169.7 100 168.7 103Q166.3 108.7 165.7 114.6Q163.6 119.9 159.3 124.5Q154.9 128.5 152.6 133.6Q145.1 134.1 135.8 132.8Q129.7 138.9 129.5 146.6Q128.4 154.7 124.6 159.4Q119.2 160.7 114 163.3Q108.5 163.5 102.7 164.7Q97.1 167.4 91.2 166.5Q85.5 165.3 80.2 162.9Q75 160.3 68.7 159.9Q65 155.3 62.2 149.2Q56.7 147.2 50.9 144.9Q46.9 140.8 45.7 134.7Q45.5 128.4 45.7 122.5Q47 116.8 48.9 111.4Q47.9 106.8 46.1 102.3Q45.9 97.6 42.3 92.2Q33.5 85 36.3 80.3Q44.7 77.1 44.4 70.9Q41.7 62.7 40.6 54.3Q43.8 48.5 48.1 43.3Q55.3 42 64 43.6Q70.2 42.8 76.6 43.8Q82.3 43.6 87.1 42.1Q91.9 37.3 97 36.5Q102.5 42.2 107.4 44Q111.9 46 117 46.4Q123 44.7 128.8 44.7Q134 46.6 138.6 49.8Q142 54.1 147.4 56.7Q150.2 61.3 148.3 69.1Q152.9 72.7 160.8 74.9Q167.3 78.9 171.5 84.1Q170.7 90.6 169.4 97Z'/><circle cx='31.7' cy='159.6' r='1.5'/><circle cx='186' cy='133.4' r='1.8'/><circle cx='101.3' cy='186.2' r='3.8'/><circle cx='176.2' cy='142.3' r='2.9'/><circle cx='169.2' cy='37.7' r='3.8'/><circle cx='84.6' cy='185.3' r='2.4'/><circle cx='137.4' cy='174.9' r='2.1'/><circle cx='11' cy='108.4' r='2.1'/><circle cx='12.9' cy='61.4' r='3.3'/><circle cx='10.5' cy='91.3' r='3.3'/><circle cx='34.2' cy='148.4' r='3.2'/></svg>";
type DocVT = Document & { startViewTransition?: (u: () => void) => { ready: Promise<void>; finished: Promise<void> } };

export function switchWithInk(apply: () => void, from?: { x: number; y: number }) {
  const doc = document as DocVT;
  if (!doc.startViewTransition || calm()) { apply(); return; }
  const x = from?.x ?? window.innerWidth - 40, y = from?.y ?? 40;
  const far = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const end = Math.ceil(far * 3.9);   // the blot's solid middle is about half its drawing
  const root = document.documentElement;
  root.style.setProperty("--ink-mask", `url("${INK}")`);
  root.classList.add("ink-switch");
  const t = doc.startViewTransition(() => flushSync(apply));
  t.ready.then(() => {
    const size = (s: number) => `${s}px ${s}px`, at = (s: number) => `${x - s / 2}px ${y - s / 2}px`;
    root.animate([
      { maskSize: size(0), maskPosition: at(0), webkitMaskSize: size(0), webkitMaskPosition: at(0) },
      { maskSize: size(end * 0.18), maskPosition: at(end * 0.18), webkitMaskSize: size(end * 0.18), webkitMaskPosition: at(end * 0.18), offset: 0.25 },
      { maskSize: size(end), maskPosition: at(end), webkitMaskSize: size(end), webkitMaskPosition: at(end) },
    ] as Keyframe[], { duration: 900, easing: "cubic-bezier(.55,.06,.35,1)", pseudoElement: "::view-transition-new(root)", fill: "both" });
  }).catch(() => {});
  t.finished.finally(() => root.classList.remove("ink-switch"));
}

/** Sets the phone's status-bar colour to the page background. */
export function paintBar() {
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute("content", document.documentElement.dataset.theme === "dark" ? "#0f1218" : "#f5f6f8");
}

/* ---------- press feel ---------- */
const PRESSABLE = "button, [role=radio], [role=switch], a[href]";
const BUZZ = '[data-buzz], [data-variant="primary"], [data-variant="success"]';
export const buzzOn = () => { try { return localStorage.getItem("dineos.buzz") !== "off"; } catch { return true; } };
export function buzz(p: number | number[] = 8) { if (!buzzOn()) return; try { navigator.vibrate?.(p); } catch { /* iPhone: no vibration for web apps */ } }

export function installClickFeel() {
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const el = (e.target as Element | null)?.closest<HTMLElement>(PRESSABLE);
    if (!el || (el as HTMLButtonElement).disabled || el.closest("[data-no-ripple], .theme-dark-kitchen-off")) return;
    if (!calm()) {
      const r = el.getBoundingClientRect(), size = Math.max(r.width, r.height) * 2.2;
      const dot = document.createElement("span");
      dot.className = "ripple";
      dot.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
      el.classList.add("has-ripple");
      el.appendChild(dot);
      dot.addEventListener("animationend", () => dot.remove(), { once: true });
    }
    if (e.pointerType === "touch" && el.matches(BUZZ)) buzz(8);
  };
  document.addEventListener("pointerdown", onDown, { passive: true });
  return () => document.removeEventListener("pointerdown", onDown);
}

/* ---------- paid celebration ---------- */
export function celebrate(text = "Paid") {
  buzz([20, 40, 30]);
  const wrap = document.createElement("div");
  wrap.className = "celebrate";
  wrap.setAttribute("aria-hidden", "true");
  wrap.innerHTML = `<div class="celebrate-badge"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg><span></span></div>`;
  (wrap.querySelector("span") as HTMLElement).textContent = text;
  if (!calm()) {
    const colours = ["var(--coral)", "var(--blue)", "var(--success)", "var(--warning)"];
    for (let i = 0; i < 28; i++) {
      const p = document.createElement("i");
      const a = (Math.PI * 2 * i) / 28 + Math.random() * 0.3, d = 90 + Math.random() * 90;
      p.style.cssText = `--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 40}px;--r:${Math.random() * 540 - 270}deg;background:${colours[i % 4]};animation-delay:${Math.random() * 80}ms`;
      wrap.appendChild(p);
    }
  }
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 1500);
}
