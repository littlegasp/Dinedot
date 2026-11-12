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
      setBox(on ? { x: on.offsetLeft, y: on.offsetTop, w: on.offsetWidth, h: on.offsetHeight } : null);
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
