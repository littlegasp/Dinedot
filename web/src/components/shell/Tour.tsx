"use client";
/* First-time tour: the first time someone opens a screen on a device, a small card walks them
   through it, one step at a time. The steps are the Help guide's own (src/content/guide.ts), so
   the tour can never drift from Help. Skip ends every tour; Help → Show the tours again restarts. */
import * as React from "react";
import { Compass, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GUIDE } from "@/content/guide";
import type { Route } from "@/lib/routes";

const key = (user: string, route: string) => `dineos.tour.${user}.${route}`;
const SKIP = (user: string) => `dineos.tour.${user}.all`;
const seen = (k: string) => { try { return localStorage.getItem(k) === "1"; } catch { return true; } };
const mark = (k: string) => { try { localStorage.setItem(k, "1"); } catch { /* private window: show again next time */ } };

export function resetTours(user: string) {
  try { Object.keys(localStorage).filter(k => k.startsWith(`dineos.tour.${user}.`)).forEach(k => localStorage.removeItem(k)); } catch { /* blocked */ }
}

export function Tour({ user, route, dark }: { user: string; route: Route; dark?: boolean }) {
  const [step, setStep] = React.useState<number | null>(null);
  React.useEffect(() => {
    setStep(route === "design" || seen(SKIP(user)) || seen(key(user, route)) ? null : 0);
  }, [user, route]);
  if (step === null) return null;
  const g = GUIDE[route], steps = g.steps, last = step >= steps.length - 1;
  const done = () => { mark(key(user, route)); setStep(null); };
  return (
    <section aria-label={`Tour: ${g.title}`} className={dark ? "theme-dark" : undefined}>
      <div className="mb-5 flex gap-3 rounded-[var(--radius-lg)] border border-blue bg-blue-soft p-4 text-fg">
        <Compass className="mt-0.5 size-5 shrink-0 text-blue" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold">New here? {g.title} in {steps.length} steps <span className="num font-normal text-fg-2">· {step + 1} of {steps.length}</span></p>
          <p className="mt-1 text-[14px]">{steps[step]}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {step > 0 && <Button size="sm" variant="ghost" onClick={() => setStep(step - 1)}>Back</Button>}
            <Button size="sm" variant="ink" onClick={() => (last ? done() : setStep(step + 1))}>{last ? "Got it" : "Next tip"}</Button>
            <button className="ml-auto text-[12px] font-semibold text-fg-2 underline-offset-2 hover:underline" onClick={() => { mark(SKIP(user)); setStep(null); }}>Skip all tours</button>
          </div>
        </div>
        <button aria-label="Close the tour" className="grid size-7 shrink-0 place-items-center rounded text-fg-2 hover:text-fg" onClick={done}><X className="size-4" /></button>
      </div>
    </section>
  );
}
