"use client";
/* Phones: slide a card to the right to do its next step (from Vroombrite). The step's name shows
   underneath as the card moves; letting go past the line does it, before the line springs back.
   Mouse and keyboard users keep the normal buttons. */
import * as React from "react";
import { ArrowRight } from "lucide-react";
import { buzz } from "@/lib/motion";

export function Swipe({ label, onSwipe, disabled, children }: { label: string; onSwipe: () => void; disabled?: boolean; children: React.ReactNode }) {
  const [dx, setDx] = React.useState(0);
  const p = React.useRef<{ x: number; y: number; mode: 0 | 1; w: number } | null>(null);
  const swiped = React.useRef(0);
  const down = (e: React.PointerEvent) => {
    if (disabled || e.pointerType === "mouse") return;
    p.current = { x: e.clientX, y: e.clientY, mode: 0, w: (e.currentTarget as HTMLElement).offsetWidth };
  };
  const move = (e: React.PointerEvent) => {
    const s = p.current; if (!s) return;
    const mx = e.clientX - s.x, my = e.clientY - s.y;
    if (!s.mode) {
      if (Math.abs(mx) > 12 && Math.abs(mx) > Math.abs(my) * 1.4 && mx > 0) { s.mode = 1; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }
      else if (Math.abs(my) > 12) { p.current = null; return; } else return;
    }
    const was = dx > s.w * 0.38, now = Math.max(0, mx) > s.w * 0.38;
    if (now && !was) buzz(10);
    setDx(Math.max(0, mx));
  };
  const up = () => {
    const s = p.current; p.current = null;
    if (!s || !s.mode) return;
    swiped.current = Date.now();
    if (dx > s.w * 0.38) { setDx(s.w); setTimeout(() => { onSwipe(); setDx(0); }, 160); } else setDx(0);
  };
  return (
    <div className="relative rounded-[var(--radius-lg)]" onClickCapture={e => { if (Date.now() - swiped.current < 350) { e.stopPropagation(); e.preventDefault(); } }}>
      {dx > 0 && <div className="swipe-under" aria-hidden="true"><ArrowRight className="size-5" />{label}</div>}
      <div onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} className="relative touch-pan-y"
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: p.current?.mode ? "none" : "transform .25s cubic-bezier(.2,.9,.25,1)" }}>
        {children}
      </div>
    </div>
  );
}
