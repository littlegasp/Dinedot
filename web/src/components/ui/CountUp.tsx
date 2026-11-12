"use client";
/* A number that counts up the first time it appears (Studio CRM); later changes just update. */
import * as React from "react";

export function CountUp({ value, format = n => String(Math.round(n)) }: { value: number; format?: (n: number) => string }) {
  const [shown, setShown] = React.useState(value);
  const first = React.useRef(true);
  React.useEffect(() => {
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!first.current || calm || !value) { setShown(value); return; }
    first.current = false;
    const start = performance.now(), dur = 750; let raf = 0;
    const tick = (t: number) => { const p = Math.min(1, (t - start) / dur); setShown(value * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format(shown)}</>;
}
