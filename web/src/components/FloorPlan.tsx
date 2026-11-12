"use client";
/* The 2D floor plan: each area is a room drawn from above, with every table in its place,
   its chairs around it, and (on Floor) its live state in colour + word. On Tables & QR a
   manager drags tables into place (or moves a selected one with the arrow keys).
   Units: the room is 1000 × 640; tables store their centre (plan_x, plan_y). Tables not
   placed yet get a tidy starting spot until the plan is saved. */
import * as React from "react";
import type { LiveTable, TableShape } from "@/lib/types";
import type { TableState } from "@/components/ui/status";
import { cn } from "@/lib/utils";

export const PLAN_W = 1000, PLAN_H = 640;
export type Spot = { x: number; y: number };

/** Where a table stands: its saved spot, or a starting grid spot (by its order in the area). */
export function spotOf(t: LiveTable, index: number): Spot {
  if (t.x != null && t.y != null) return { x: t.x, y: t.y };
  const cols = 5, col = index % cols, row = Math.floor(index / cols);
  return { x: 110 + col * 195, y: Math.min(PLAN_H - 90, 110 + row * 170) };
}

/** Table size from its shape and seats. */
function size(shape: TableShape, seats: number) {
  if (shape === "long") return { w: Math.min(260, 70 + Math.ceil(seats / 2) * 34), h: 78 };
  const s = seats <= 2 ? 66 : seats <= 4 ? 84 : 104;
  return { w: s, h: s };
}

/** Chair positions around a table (centred on 0,0). */
function chairs(shape: TableShape, seats: number, w: number, h: number) {
  const out: { x: number; y: number; r: number }[] = [];
  if (shape === "round") {
    const R = w / 2 + 16;
    for (let i = 0; i < seats; i++) { const a = (i / seats) * Math.PI * 2 - Math.PI / 2; out.push({ x: Math.cos(a) * R, y: Math.sin(a) * R, r: (a * 180) / Math.PI + 90 }); }
    return out;
  }
  // square / long: share chairs along the top and bottom; the ends get one each when there are odd/extra seats
  const ends = shape === "square" && seats > 4 ? 2 : shape === "square" && seats >= 3 ? Math.min(2, seats - 2) : seats % 2;
  const sides = seats - ends, top = Math.ceil(sides / 2), bottom = sides - top;
  const row = (n: number, y: number, r: number) => { for (let i = 0; i < n; i++) out.push({ x: -w / 2 + ((i + 1) * w) / (n + 1), y, r }); };
  row(top, -h / 2 - 15, 0); row(bottom, h / 2 + 15, 180);
  if (ends >= 1) out.push({ x: -w / 2 - 15, y: 0, r: 270 });
  if (ends >= 2) out.push({ x: w / 2 + 15, y: 0, r: 90 });
  return out;
}

const TONE: Record<TableState | "off", { fill: string; stroke: string; text: string }> = {
  free:    { fill: "var(--surface)",      stroke: "var(--border-strong)", text: "var(--text-secondary)" },
  ordered: { fill: "var(--warning-soft)", stroke: "var(--warning)",       text: "var(--warning-strong)" },
  food:    { fill: "var(--success-soft)", stroke: "var(--success)",       text: "var(--success)" },
  bill:    { fill: "var(--coral-soft)",   stroke: "var(--coral)",         text: "var(--coral-strong)" },
  off:     { fill: "var(--surface-muted)", stroke: "var(--border)",       text: "var(--text-secondary)" },
};

export type PlanInfo = { state: TableState | "off"; word: string; sub?: string; ping?: boolean };

export function FloorPlan({ area, tables, info, onOpen, edit, spots, onMove, selected }: {
  area: string; tables: LiveTable[];
  info: (t: LiveTable) => PlanInfo;
  onOpen: (t: LiveTable) => void;
  edit?: boolean; spots?: Record<string, Spot>; onMove?: (id: string, s: Spot) => void; selected?: string | null;
}) {
  const svg = React.useRef<SVGSVGElement>(null);
  const drag = React.useRef<{ id: string; dx: number; dy: number; moved: boolean } | null>(null);
  const toPlan = (e: React.PointerEvent) => {
    const m = svg.current!.getScreenCTM()!.inverse(); const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return { x: p.x, y: p.y };
  };
  const clamp = (s: Spot) => ({ x: Math.round(Math.min(PLAN_W - 50, Math.max(50, s.x)) / 10) * 10, y: Math.round(Math.min(PLAN_H - 50, Math.max(50, s.y)) / 10) * 10 });
  const at = (t: LiveTable, i: number) => spots?.[t.id] ?? spotOf(t, i);

  return (
    <div className="min-w-0 max-w-full overflow-x-auto overscroll-x-contain rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
      <svg ref={svg} viewBox={`0 0 ${PLAN_W} ${PLAN_H}`} role="group" aria-label={`${area} floor plan`}
        className={cn("block w-full min-w-[640px] select-none", edit && "touch-none")}>
        <defs>
          <pattern id={`dots-${area}`} width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="1.5" fill="var(--border)" /></pattern>
        </defs>
        <rect x="8" y="8" width={PLAN_W - 16} height={PLAN_H - 16} rx="22" fill="var(--surface-muted)" opacity=".55" />
        <rect x="8" y="8" width={PLAN_W - 16} height={PLAN_H - 16} rx="22" fill={`url(#dots-${area})`} stroke="var(--border)" strokeWidth="2" strokeDasharray={edit ? "10 8" : undefined} />
        <text x="34" y="52" fontSize="22" fontWeight="800" fill="var(--text-secondary)" opacity=".55" style={{ fontFamily: "var(--font-display)", letterSpacing: ".06em" }}>{area.toUpperCase()}</text>
        {tables.map((t, i) => {
          const s = at(t, i), shape = t.shape ?? "square", { w, h } = size(shape, t.seats), inf = info(t), tone = TONE[inf.state];
          const sel = selected === t.id;
          return (
            <g key={t.id} transform={`translate(${s.x} ${s.y})`} role="button" tabIndex={0}
              aria-label={`${t.code}, ${inf.word}${inf.sub ? `, ${inf.sub}` : ""}, ${t.seats} seats${edit ? ". Drag, or use the arrow keys, to move it" : ""}`}
              className={cn("plan-table outline-none", edit ? "cursor-grab active:cursor-grabbing" : "cursor-pointer")}
              onPointerDown={e => {
                if (!edit) return;
                const p = toPlan(e); drag.current = { id: t.id, dx: p.x - s.x, dy: p.y - s.y, moved: false };
                (e.currentTarget as Element).setPointerCapture(e.pointerId);
              }}
              onPointerMove={e => {
                const d = drag.current; if (!d || d.id !== t.id) return;
                const p = toPlan(e); d.moved = true; onMove?.(t.id, clamp({ x: p.x - d.dx, y: p.y - d.dy }));
              }}
              onPointerUp={() => { const d = drag.current; drag.current = null; if (edit && d && !d.moved) onOpen(t); }}
              onClick={() => { if (!edit) onOpen(t); }}
              onKeyDown={e => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(t); return; }
                if (!edit) return;
                const step = e.shiftKey ? 50 : 10, mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
                if (mv) { e.preventDefault(); onMove?.(t.id, clamp({ x: s.x + mv[0], y: s.y + mv[1] })); }
              }}>
              {chairs(shape, t.seats, w, h).map((c, k) => (
                <rect key={k} x={c.x - 11} y={c.y - 7} width="22" height="14" rx="6" transform={`rotate(${c.r} ${c.x} ${c.y})`}
                  fill="var(--surface)" stroke={tone.stroke} strokeWidth="2" opacity={inf.state === "off" ? 0.5 : 1} />
              ))}
              {shape === "round"
                ? <circle r={w / 2} fill={tone.fill} stroke={tone.stroke} strokeWidth={sel ? 5 : 3} />
                : <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="14" fill={tone.fill} stroke={tone.stroke} strokeWidth={sel ? 5 : 3} />}
              {inf.ping && (shape === "round"
                ? <circle r={w / 2 + 8} fill="none" stroke="var(--coral)" strokeWidth="3" className="plan-ping" />
                : <rect x={-w / 2 - 8} y={-h / 2 - 8} width={w + 16} height={h + 16} rx="20" fill="none" stroke="var(--coral)" strokeWidth="3" className="plan-ping" />)}
              <text y={inf.sub ? -4 : 7} textAnchor="middle" fontSize={w < 80 ? 19 : 22} fontWeight="800" fill="var(--text)" style={{ fontFamily: "var(--font-display)" }}>{t.code}</text>
              <text y={inf.sub ? 16 : 26} textAnchor="middle" fontSize={w < 80 ? 11 : 13} fontWeight="700" fill={tone.text}>{inf.word}</text>
              {inf.sub && <text y={33} textAnchor="middle" fontSize="12" fill="var(--text-secondary)">{inf.sub}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
