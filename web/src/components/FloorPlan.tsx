"use client";
/* The 2D floor plan: each area is a room drawn from above, with every table in its place,
   its chairs around it, markers for the room's fixed things (entrance, counter, kitchen…),
   and (on Floor) each table's live state in colour + word. On Tables & QR a manager drags
   tables and markers into place (or moves a selected one with the arrow keys).
   Units: a wide room is 1000 × 640, a square one 640 × 640, a long one 1000 × 400 (the
   database checks the same sizes). Tables store their centre (plan_x, plan_y). Tables not
   placed yet get a tidy starting spot until the plan is saved. */
import * as React from "react";
import type { LiveTable, Mark, MarkKind, RoomShape, TableShape } from "@/lib/types";
import type { TableState } from "@/components/ui/status";
import { cn } from "@/lib/utils";

export const PLAN_W = 1000, PLAN_H = 640;
export const ROOM: Record<RoomShape, { w: number; h: number }> = { wide: { w: 1000, h: 640 }, square: { w: 640, h: 640 }, long: { w: 1000, h: 400 } };
export type Spot = { x: number; y: number };

export const MARKS: { k: MarkKind; label: string }[] = [
  { k: "entrance", label: "Entrance" }, { k: "counter", label: "Counter" }, { k: "kitchen", label: "Kitchen" },
  { k: "washroom", label: "Washroom" }, { k: "window", label: "Window" }, { k: "stairs", label: "Stairs" }, { k: "pillar", label: "Pillar" },
];
const MARK_LABEL = Object.fromEntries(MARKS.map(m => [m.k, m.label])) as Record<MarkKind, string>;

/** Where a table stands: its saved spot (kept inside the room), or a starting grid spot. */
export function spotOf(t: LiveTable, index: number, room: { w: number; h: number } = ROOM.wide): Spot {
  if (t.x != null && t.y != null) return { x: Math.min(t.x, room.w - 50), y: Math.min(t.y, room.h - 50) };
  const cols = Math.max(2, Math.floor((room.w - 40) / 195)), col = index % cols, row = Math.floor(index / cols);
  return { x: 110 + col * 195, y: Math.min(room.h - 90, 110 + row * 170) };
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

/** A marker's box (centred on 0,0) and where its word goes. */
const MARK_BOX: Record<MarkKind, { w: number; h: number; r: number; below?: boolean }> = {
  entrance: { w: 130, h: 36, r: 18 }, counter: { w: 190, h: 46, r: 10 }, kitchen: { w: 170, h: 84, r: 14 },
  washroom: { w: 130, h: 56, r: 12 }, window: { w: 170, h: 16, r: 8, below: true }, stairs: { w: 96, h: 96, r: 8 }, pillar: { w: 40, h: 40, r: 20, below: true },
};

function MarkShape({ m, sel }: { m: Mark; sel: boolean }) {
  const b = MARK_BOX[m.k], blue = m.k === "entrance" || m.k === "window";
  const stroke = sel ? "var(--blue)" : blue ? "var(--blue)" : "var(--border-strong)";
  return (<>
    <rect x={-b.w / 2} y={-b.h / 2} width={b.w} height={b.h} rx={b.r}
      fill={blue ? "var(--blue-soft)" : m.k === "pillar" ? "var(--border-strong)" : "var(--surface-muted)"}
      stroke={stroke} strokeWidth={sel ? 4 : 2} strokeDasharray={m.k === "kitchen" || m.k === "washroom" ? "8 6" : undefined} />
    {m.k === "stairs" && [-30, -10, 10, 30].map(y => <line key={y} x1={-38} x2={38} y1={y} y2={y} stroke="var(--border-strong)" strokeWidth="2" />)}
    <text y={b.below ? b.h / 2 + 18 : 5} textAnchor="middle" fontSize="14" fontWeight="700"
      fill={blue ? "var(--blue)" : "var(--text-secondary)"} paintOrder="stroke" stroke={m.k === "stairs" ? "var(--surface-muted)" : "none"} strokeWidth="6">{MARK_LABEL[m.k]}</text>
  </>);
}

export type PlanInfo = { state: TableState | "off"; word: string; sub?: string; ping?: boolean };

export function FloorPlan({ area, tables, info, onOpen, edit, spots, onMove, selected, room = "wide", marks = [], onMoveMark, onPickMark, selectedMark }: {
  area: string; tables: LiveTable[];
  info: (t: LiveTable) => PlanInfo;
  onOpen: (t: LiveTable) => void;
  edit?: boolean; spots?: Record<string, Spot>; onMove?: (id: string, s: Spot) => void; selected?: string | null;
  room?: RoomShape; marks?: Mark[]; onMoveMark?: (i: number, s: Spot) => void; onPickMark?: (i: number) => void; selectedMark?: number | null;
}) {
  const R = ROOM[room] ?? ROOM.wide;
  const svg = React.useRef<SVGSVGElement>(null);
  const drag = React.useRef<{ key: string; dx: number; dy: number; moved: boolean } | null>(null);
  const toPlan = (e: React.PointerEvent) => {
    const m = svg.current!.getScreenCTM()!.inverse(); const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return { x: p.x, y: p.y };
  };
  const clamp = (s: Spot, pad = 50) => ({ x: Math.round(Math.min(R.w - pad, Math.max(pad, s.x)) / 10) * 10, y: Math.round(Math.min(R.h - pad, Math.max(pad, s.y)) / 10) * 10 });
  const at = (t: LiveTable, i: number) => spots?.[t.id] ?? spotOf(t, i, R);
  const id = `dots-${area.replace(/\W+/g, "-")}`;

  // shared drag + keyboard for tables and markers
  const handlers = (key: string, s: Spot, move: (s: Spot) => void, open: () => void, pad: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (!edit) return;
      const p = toPlan(e); drag.current = { key, dx: p.x - s.x, dy: p.y - s.y, moved: false };
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = drag.current; if (!d || d.key !== key) return;
      const p = toPlan(e); d.moved = true; move(clamp({ x: p.x - d.dx, y: p.y - d.dy }, pad));
    },
    onPointerUp: () => { const d = drag.current; drag.current = null; if (edit && d && !d.moved) open(); },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); return; }
      if (!edit) return;
      const step = e.shiftKey ? 50 : 10, mv = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, number[]>)[e.key];
      if (mv) { e.preventDefault(); move(clamp({ x: s.x + mv[0], y: s.y + mv[1] }, pad)); }
    },
  });

  return (
    <div className="min-w-0 max-w-full overflow-x-auto overscroll-x-contain rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
      <svg ref={svg} viewBox={`0 0 ${R.w} ${R.h}`} role="group" aria-label={`${area} floor plan`}
        className={cn("mx-auto block w-full select-none", room === "square" ? "min-w-[420px] max-w-[760px]" : "min-w-[640px]", edit && "touch-none")}>
        <defs>
          <pattern id={id} width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="1.5" fill="var(--border)" /></pattern>
        </defs>
        <rect x="8" y="8" width={R.w - 16} height={R.h - 16} rx="22" fill="var(--surface-muted)" opacity=".55" />
        <rect x="8" y="8" width={R.w - 16} height={R.h - 16} rx="22" fill={`url(#${id})`} stroke="var(--border)" strokeWidth="2" strokeDasharray={edit ? "10 8" : undefined} />
        <text x="34" y="52" fontSize="22" fontWeight="800" fill="var(--text-secondary)" opacity=".55" style={{ fontFamily: "var(--font-display)", letterSpacing: ".06em" }}>{area.toUpperCase()}</text>

        {marks.map((m, i) => {
          const b = MARK_BOX[m.k], pad = Math.max(b.w, b.h) / 2 + 10;
          const h = handlers(`m${i}`, m, s => onMoveMark?.(i, s), () => onPickMark?.(i), Math.min(pad, 60));
          return (
            <g key={`m${i}`} transform={`translate(${m.x} ${m.y})`} className={cn("plan-mark", edit ? "cursor-grab outline-none active:cursor-grabbing" : "pointer-events-none")}
              {...(edit ? { role: "button", tabIndex: 0, "aria-label": `${MARK_LABEL[m.k]} marker. Drag, or use the arrow keys, to move it`, ...h } : { "aria-hidden": true })}>
              <MarkShape m={m} sel={!!edit && selectedMark === i} />
            </g>
          );
        })}

        {tables.map((t, i) => {
          const s = at(t, i), shape = t.shape ?? "square", { w, h } = size(shape, t.seats), inf = info(t), tone = TONE[inf.state];
          const sel = selected === t.id;
          const hd = handlers(t.id, s, p => onMove?.(t.id, p), () => onOpen(t), 50);
          return (
            <React.Fragment key={t.id}>
            {/* the pulse sits outside the table's button, so the button itself never moves */}
            {inf.ping && (
              <g transform={`translate(${s.x} ${s.y})`} aria-hidden="true" pointerEvents="none">
                {shape === "round"
                  ? <circle r={w / 2 + 8} fill="none" stroke="var(--coral)" strokeWidth="3" className="plan-ping" />
                  : <rect x={-w / 2 - 8} y={-h / 2 - 8} width={w + 16} height={h + 16} rx="20" fill="none" stroke="var(--coral)" strokeWidth="3" className="plan-ping" />}
              </g>
            )}
            <g transform={`translate(${s.x} ${s.y})`} role="button" tabIndex={0}
              aria-label={`${t.code}, ${inf.word}${inf.sub ? `, ${inf.sub}` : ""}, ${t.seats} seats${edit ? ". Drag, or use the arrow keys, to move it" : ""}`}
              className={cn("plan-table outline-none", edit ? "cursor-grab active:cursor-grabbing" : "cursor-pointer")}
              {...hd} onClick={() => { if (!edit) onOpen(t); }}>
              {chairs(shape, t.seats, w, h).map((c, k) => (
                <rect key={k} x={c.x - 11} y={c.y - 7} width="22" height="14" rx="6" transform={`rotate(${c.r} ${c.x} ${c.y})`}
                  fill="var(--surface)" stroke={tone.stroke} strokeWidth="2" opacity={inf.state === "off" ? 0.5 : 1} />
              ))}
              {shape === "round"
                ? <circle r={w / 2} fill={tone.fill} stroke={tone.stroke} strokeWidth={sel ? 5 : 3} />
                : <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="14" fill={tone.fill} stroke={tone.stroke} strokeWidth={sel ? 5 : 3} />}
              <text y={inf.sub ? -4 : 7} textAnchor="middle" fontSize={w < 80 ? 19 : 22} fontWeight="800" fill="var(--text)" style={{ fontFamily: "var(--font-display)" }}>{t.code}</text>
              <text y={inf.sub ? 16 : 26} textAnchor="middle" fontSize={w < 80 ? 11 : 13} fontWeight="700" fill={tone.text}>{inf.word}</text>
              {inf.sub && <text y={33} textAnchor="middle" fontSize="12" fill="var(--text-secondary)">{inf.sub}</text>}
            </g>
            </React.Fragment>
          );
        })}
      </svg>
    </div>
  );
}
