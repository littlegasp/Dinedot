"use client";
import * as React from "react";
import { Sparkles } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import { GUIDE, WHATS_NEW } from "@/content/guide";
import { NAV, type Route } from "@/lib/routes";
import { useStaff } from "@/lib/staff";
import { cn } from "@/lib/utils";

export function HelpScreen({ focus }: { focus?: string | null }) {
  const { role } = useStaff();
  const mine = NAV.filter(n => role && n.roles.includes(role) && n.route !== "help");
  const [sel, setSel] = React.useState<Route | "new">((mine.find(n => n.route === focus)?.route) ?? "new");
  const s = sel === "new" ? null : GUIDE[sel];

  return (
    <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
      <nav aria-label="Help topics" className="-mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:gap-0.5 lg:px-0">
        <Topic on={sel === "new"} onClick={() => setSel("new")}><Sparkles className="size-4" aria-hidden />What&apos;s new</Topic>
        {mine.map(n => <Topic key={n.route} on={sel === n.route} onClick={() => setSel(n.route)}><n.Icon className="size-4" aria-hidden />{n.label}</Topic>)}
      </nav>
      <Card className="p-6">
        {s ? (
          <article>
            <h2 className="font-display text-2xl font-extrabold text-fg">{s.title}</h2>
            <p className="mt-1 text-[13px] font-semibold text-fg-2">For: {s.who}</p>
            <p className="mt-3 text-[15px] text-fg">{s.intro}</p>
            <ol className="mt-5 grid gap-3">
              {s.steps.map((t, i) => (
                <li key={i} className="flex gap-3 text-[15px] text-fg">
                  <span className="num grid size-7 shrink-0 place-items-center rounded-full bg-coral-soft text-[13px] font-bold text-coral-strong">{i + 1}</span><span className="pt-0.5">{t}</span>
                </li>
              ))}
            </ol>
            {s.tips && <div className="mt-5 rounded-[var(--radius)] bg-blue-soft p-4 text-[14px] text-fg">{s.tips.map((t, i) => <p key={i} className={cn(i && "mt-2")}><b>Tip:</b> {t}</p>)}</div>}
          </article>
        ) : (
          <article>
            <h2 className="font-display text-2xl font-extrabold text-fg">What&apos;s new</h2>
            <ul className="mt-4 grid gap-4">
              {WHATS_NEW.map((w, i) => <li key={i} className="border-l-2 border-coral pl-4"><p className="text-[12px] font-semibold text-fg-2">{w.date}</p><p className="text-[15px] text-fg">{w.text}</p></li>)}
            </ul>
          </article>
        )}
      </Card>
    </div>
  );
}

function Topic({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-current={on ? "true" : undefined}
      className={cn("flex h-10 shrink-0 items-center gap-2 rounded-[var(--radius)] border border-border bg-surface px-3 text-sm font-semibold text-fg-2 lg:border-0 lg:bg-transparent",
        on && "border-ink bg-ink text-surface lg:bg-ink")}>
      {children}
    </button>
  );
}
