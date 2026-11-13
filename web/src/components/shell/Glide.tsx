"use client";
/* A highlight that glides to the selected item inside its parent (side menu, phone tab bar)
   instead of jumping. Put it as the first child of a `relative` box; `selector` finds the
   selected item, `watch` is anything that changes the selection. */
import * as React from "react";
import { cn } from "@/lib/utils";

export function Glide({ selector, watch, className }: { selector: string; watch: unknown; className?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const [box, setBox] = React.useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [ready, setReady] = React.useState(false);
  React.useLayoutEffect(() => {
    const host = ref.current?.parentElement;
    if (!host) return;
    const place = () => {
      const on = host.querySelector<HTMLElement>(selector);
      if (!on) { setBox(null); return; }
      // measured against the box itself (offsetLeft would be relative to the nearest positioned parent,
      // e.g. the tab's own button, and leave the highlight stuck on the first tab)
      const h = host.getBoundingClientRect(), r = on.getBoundingClientRect();
      setBox({ x: r.left - h.left - host.clientLeft + host.scrollLeft, y: r.top - h.top - host.clientTop + host.scrollTop, w: r.width, h: r.height });
    };
    place();
    const t = setTimeout(() => setReady(true), 60);   // no fly-in from the corner on first draw
    const ro = new ResizeObserver(place); ro.observe(host);
    return () => { clearTimeout(t); ro.disconnect(); };
  }, [selector, watch]);
  return (
    <span ref={ref} aria-hidden="true" className={cn("glide", !ready && "!transition-none", className)}
      style={box ? { transform: `translate(${box.x}px, ${box.y}px)`, width: box.w, height: box.h, opacity: 1, left: 0, top: 0 } : { opacity: 0 }} />
  );
}
