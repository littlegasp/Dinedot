"use client";
import * as React from "react";
import qrcode from "qrcode-generator";
import { ArrowDown, ArrowUp, LayoutDashboard, LayoutGrid, Map as MapIcon, Move, Plus, Printer, QrCode, RefreshCw, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, Field, Input, Segmented, Skeleton, Switch } from "@/components/ui/primitives";
import { FloorPlan, MARKS, ROOM, spotOf, type Spot } from "@/components/FloorPlan";
import { Sheet, toast } from "@/components/ui/overlay";
import { LogoMark } from "@/components/brand/Logo";
import { rpc } from "@/lib/api";
import { useAction, useStaff } from "@/lib/staff";
import type { LiveArea, LiveTable, Mark, MarkKind, RoomShape, TableShape } from "@/lib/types";
import { cn } from "@/lib/utils";

/** The address a table's QR code opens: this site's t.html (same as the printed codes of the old app). */
export const guestUrl = (token: string) => new URL(`t.html?k=${encodeURIComponent(token)}`, location.href.split("#")[0]).toString();

function Qr({ text, className, decorative }: { text: string; className?: string; decorative?: boolean }) {
  const svg = React.useMemo(() => { const q = qrcode(0, "M"); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); }, [text]);
  return decorative
    ? <div className={cn("bg-white [&_svg]:size-full", className)} aria-hidden dangerouslySetInnerHTML={{ __html: svg }} />
    : <div className={cn("bg-white [&_svg]:size-full", className)} role="img" aria-label="QR code" dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** Plan or cards: remembered on this device (Tables and Floor share it). */
export function usePlanView(): ["plan" | "cards", (v: "plan" | "cards") => void] {
  const [v, setV] = React.useState<"plan" | "cards">("plan");
  React.useEffect(() => { try { if (localStorage.getItem("dineos.view") === "cards") setV("cards"); } catch {} }, []);
  return [v, (n) => { setV(n); try { localStorage.setItem("dineos.view", n); } catch {} }];
}
export const VIEW_OPTIONS = [
  { value: "plan" as const, label: <span className="flex items-center gap-1.5"><MapIcon className="size-4" aria-hidden />Plan</span> },
  { value: "cards" as const, label: <span className="flex items-center gap-1.5"><LayoutGrid className="size-4" aria-hidden />Cards</span> },
];

/** The restaurant's areas in their order (from the database); older data: the tables' area names. */
export function areasOf(areas: LiveArea[] | undefined, tables: LiveTable[]): LiveArea[] {
  const list = [...(areas ?? [])];
  for (const n of new Set(tables.map(t => t.area))) if (!list.some(a => a.name === n)) list.push({ id: "", name: n, shape: "wide", marks: [] });
  return list;
}

export function TablesScreen() {
  const { live, reload } = useStaff();
  const { run, pending } = useAction();
  const [view, setView] = usePlanView();
  const [area, setArea] = React.useState("");
  const [arranging, setArranging] = React.useState(false);
  const [spots, setSpots] = React.useState<Record<string, Spot>>({});
  const [picked, setPicked] = React.useState<string | null>(null);
  const [marks, setMarks] = React.useState<Mark[]>([]);
  const [pickedMark, setPickedMark] = React.useState<number | null>(null);
  const [areasOpen, setAreasOpen] = React.useState(false);
  const [tokens, setTokens] = React.useState<Record<string, string> | null>(null);
  const [edit, setEdit] = React.useState<Partial<LiveTable> | null>(null);
  const [printing, setPrinting] = React.useState<LiveTable[] | null>(null);
  const loadTokens = React.useCallback(() => rpc<Record<string, string>>("owner_table_tokens").then(setTokens).catch(e => toast((e as Error).message, "error")), []);
  React.useEffect(() => { loadTokens(); }, [loadTokens]);
  React.useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(null);
    window.addEventListener("afterprint", done);
    const t = setTimeout(() => window.print(), 150);
    return () => { clearTimeout(t); window.removeEventListener("afterprint", done); };
  }, [printing]);

  if (!live || !tokens) return <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-40" />)}</div>;
  const tables = live.tables;
  const areaList = areasOf(live.areas, tables);
  const names = areaList.map(a => a.name);
  const cur = areaList.find(a => a.name === area) ?? areaList[0];
  const room = cur?.name ?? "";
  const R = ROOM[cur?.shape ?? "wide"];
  const inRoom = tables.filter(t => t.area === room);
  const startArrange = () => {
    setSpots(Object.fromEntries(inRoom.map((t, i) => [t.id, spotOf(t, i, R)]))); setPicked(null);
    setMarks(cur?.marks ?? []); setPickedMark(null); setArranging(true);
  };
  const saveLayout = async () => {
    const places = inRoom.map(t => ({ id: t.id, ...spots[t.id] }));
    const ok = await run(() => (cur?.id ? rpc("owner_save_room", { p: { area_id: cur.id, tables: places, marks } }) : rpc("owner_save_plan", { p: places })).then(() => true), "Layout saved");
    if (ok) { setArranging(false); reload(); }
  };
  const addMark = (k: MarkKind) => { setMarks(m => [...m, { k, x: Math.round(R.w / 20) * 10, y: Math.round(R.h / 20) * 10 }]); setPickedMark(marks.length); setPicked(null); };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {arranging ? (<>
          <Button variant="primary" disabled={pending} onClick={saveLayout}>Save layout</Button>
          <Button onClick={() => setArranging(false)}>Cancel</Button>
          <label className="sr-only" htmlFor="add-mark">Add to the room</label>
          <select id="add-mark" value="" onChange={e => { if (e.target.value) addMark(e.target.value as MarkKind); }}
            className="h-10 rounded-[var(--radius)] border border-border bg-surface px-3 text-sm font-semibold text-fg">
            <option value="">+ Add to the room…</option>
            {MARKS.map(m => <option key={m.k} value={m.k}>{m.label}</option>)}
          </select>
          {pickedMark != null && marks[pickedMark] && (
            <Button variant="danger" onClick={() => { setMarks(m => m.filter((_, i) => i !== pickedMark)); setPickedMark(null); }}><Trash2 />Remove {MARKS.find(m => m.k === marks[pickedMark].k)?.label}</Button>
          )}
          <p className="basis-full text-[13px] text-fg-2">Drag each table to where it stands, and add the entrance, counter, kitchen and so on. On a keyboard, pick one and use the arrow keys.</p>
        </>) : (<>
          <Button variant="primary" onClick={() => setEdit({ code: "", area: room || "Main", seats: 4, active: true, shape: "square" })}><Plus />Add table</Button>
          <Button disabled={!tables.some(t => t.active)} onClick={() => setPrinting(tables.filter(t => t.active))}><Printer />Print QR codes</Button>
          {view === "plan" && areaList.length > 0 && <Button onClick={startArrange}><Move />Arrange tables</Button>}
          <Button onClick={() => setAreasOpen(true)}><LayoutDashboard />Areas</Button>
          {tables.length > 0 && <Segmented className="ml-auto" value={view} onChange={setView} options={VIEW_OPTIONS} />}
        </>)}
      </div>

      {areaList.length > 0 && view === "plan" ? (
        <section aria-label="Floor plan" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
          {areaList.length > 1 && <Segmented value={room} onChange={a => { if (!arranging) setArea(a); }} options={names.map(a => ({ value: a, label: a }))} className="w-fit max-w-full overflow-x-auto" />}
          <FloorPlan area={room} tables={inRoom} edit={arranging} spots={arranging ? spots : undefined} selected={arranging ? picked : null}
            room={cur?.shape} marks={arranging ? marks : cur?.marks ?? []} selectedMark={pickedMark}
            onMoveMark={(i, s) => { setPickedMark(i); setPicked(null); setMarks(m => m.map((x, j) => j === i ? { ...x, ...s } : x)); }}
            onPickMark={i => { setPickedMark(i); setPicked(null); }}
            onMove={(id, s) => { setPicked(id); setPickedMark(null); setSpots(m => ({ ...m, [id]: s })); }}
            onOpen={t => { if (arranging) { setPicked(t.id); setPickedMark(null); } else setEdit(t); }}
            info={t => t.active ? { state: "free", word: `${t.seats} seats` } : { state: "off", word: "Off" }} />
          {!arranging && <p className="text-[12px] text-fg-2">{inRoom.length ? "Tap a table to change it or print its QR code. To move tables or mark the entrance, counter and kitchen, choose Arrange tables." : "No tables in this area yet. Tap Add table."}</p>}
        </section>
      ) : tables.length === 0 ? (
        <Card><EmptyState icon={<QrCode />} title="No tables yet" body="Add your tables, then print a QR card for each one."
          action={<Button variant="primary" onClick={() => setEdit({ code: "T1", area: "Main", seats: 4, active: true })}><Plus />Add table</Button>} /></Card>
      ) : names.filter(a => tables.some(t => t.area === a)).map(a => (
        <section key={a} aria-label={a}>
          <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wider text-fg-2">{a}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
            {tables.filter(t => t.area === a).map(t => (
              <button key={t.id} onClick={() => setEdit(t)} className={cn("flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-sm)] hover:border-border-strong", !t.active && "opacity-60")}>
                {tokens[t.id] ? <Qr decorative text={guestUrl(tokens[t.id])} className="size-24 rounded-[var(--radius-sm)]" /> : <div className="size-24 rounded bg-muted" />}
                <span className="font-display text-xl font-extrabold text-fg">{t.code}</span>
                <span className="flex items-center gap-2 text-[12px] text-fg-2"><Users className="size-3.5" aria-hidden />{t.seats} seats{!t.active && <Badge tone="neutral">Off</Badge>}</span>
              </button>
            ))}
          </div>
        </section>
      ))}

      {areasOpen && <AreasSheet areas={areaList} tables={tables} onClose={() => setAreasOpen(false)} onChanged={(a) => { if (a) setArea(a); reload(); }} />}
      {edit && <TableSheet t={edit} token={edit.id ? tokens[edit.id] : undefined} areas={names}
        onClose={() => setEdit(null)} onPrint={t => { setEdit(null); setPrinting([t]); }}
        onSaved={a => { setEdit(null); if (a) setArea(a); reload(); loadTokens(); }} onToken={loadTokens} />}

      {/* Print sheet: only this shows on paper (see globals.css @media print) */}
      {printing && (
        <div className="print-sheet" aria-hidden>
          {printing.map(t => (
            <div key={t.id} className="qr-card">
              <div className="flex items-center justify-center gap-2"><LogoMark size={22} /><span className="font-display text-[15px] font-extrabold">{live.settings.name}</span></div>
              <Qr text={guestUrl(tokens[t.id])} className="mx-auto my-3 size-[46mm]" />
              <p className="font-display text-[28px] font-extrabold leading-none">{t.code}</p>
              <p className="mt-2 text-[12px]">Scan to see the menu, order and pay.<br />No app or sign-up needed.</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TableSheet({ t, token, areas, onClose, onSaved, onToken, onPrint }: { t: Partial<LiveTable>; token?: string; areas: string[];
  onClose: () => void; onSaved: (area?: string) => void; onToken: () => void; onPrint: (t: LiveTable) => void }) {
  const { run, pending } = useAction();
  const [f, setF] = React.useState({ code: t.code ?? "", name: t.name ?? "", area: t.area ?? "Main", seats: t.seats ?? 4, active: t.active ?? true, shape: (t.shape ?? "square") as TableShape });
  const [confirm, setConfirm] = React.useState<"" | "qr" | "del">("");
  const areaChoices = areas.length ? (areas.includes(f.area) || !f.area ? areas : [...areas, f.area]) : ["Main"];
  const [newArea, setNewArea] = React.useState(false);
  const save = async () => { const ok = await run(() => rpc("owner_save_table", { p: { id: t.id ?? "", ...f } }).then(() => true), "Table saved"); if (ok) onSaved(f.area.trim() || "Main"); };

  return (
    <Sheet open onOpenChange={o => !o && onClose()} title={t.id ? `Table ${t.code}` : "Add table"} description="Each table has its own QR code.">
      <div className="grid gap-4">
        {t.id && token && (
          <div className="flex items-center gap-4 rounded-[var(--radius-lg)] border border-border p-3">
            <Qr text={guestUrl(token)} className="size-28 rounded-[var(--radius-sm)]" />
            <div className="grid gap-2">
              <Button size="sm" onClick={() => onPrint(t as LiveTable)}><Printer />Print this QR</Button>
              <a className="text-[12px] font-semibold text-blue" href={guestUrl(token)} target="_blank" rel="noopener">Open the guest page</a>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Table number"><Input value={f.code} maxLength={8} onChange={e => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="T1" /></Field>
          <Field label="Seats"><Input inputMode="numeric" value={String(f.seats)} onChange={e => setF({ ...f, seats: Math.min(40, Number(e.target.value.replace(/\D/g, "")) || 0) })} /></Field>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="table-area" className="text-[13px] font-semibold text-fg">Area</label>
          <select id="table-area" value={newArea ? NEW : f.area} onChange={e => { if (e.target.value === NEW) { setNewArea(true); setF({ ...f, area: "" }); } else { setNewArea(false); setF({ ...f, area: e.target.value }); } }}
            className="h-11 rounded-[var(--radius)] border border-border bg-surface px-3 text-[15px] text-fg">
            {areaChoices.map(a => <option key={a} value={a}>{a}</option>)}
            <option value={NEW}>+ New area…</option>
          </select>
          {newArea && <Input aria-label="New area name" autoFocus value={f.area} maxLength={30} placeholder="e.g. Rooftop, AC Hall" onChange={e => setF({ ...f, area: e.target.value })} />}
        </div>
        <div className="grid gap-1.5" role="group" aria-labelledby="shape-label">
          <span id="shape-label" className="text-[13px] font-semibold text-fg">Shape</span>
          <Segmented value={f.shape} onChange={v => setF({ ...f, shape: v })} className="w-fit"
            options={[{ value: "square", label: "Square" }, { value: "round", label: "Round" }, { value: "long", label: "Long" }]} />
          <span className="text-[12px] text-fg-2">How it&apos;s drawn on the floor plan.</span>
        </div>
        <Field label="Name (optional)" hint="Shown to guests instead of the number, e.g. Window booth"><Input value={f.name} maxLength={40} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
        <label className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-border p-3">
          <span><span className="block text-sm font-semibold text-fg">In use</span><span className="text-[12px] text-fg-2">Switched off, its QR code stops working.</span></span>
          <Switch checked={f.active} onChange={v => setF({ ...f, active: v })} label="Table in use" />
        </label>
        <Button size="lg" variant="primary" disabled={pending || !f.code.trim() || (newArea && !f.area.trim())} onClick={save}>Save table</Button>

        {t.id && (confirm === "qr" ? (
          <div className="rounded-[var(--radius)] bg-warning-soft p-3 text-[13px] text-fg">
            <p className="font-semibold">The old QR card on this table will stop working at once. Print and stick the new one.</p>
            <div className="mt-2 grid grid-cols-2 gap-2"><Button onClick={() => setConfirm("")}>Keep it</Button>
              <Button variant="ink" disabled={pending} onClick={async () => { await run(() => rpc("owner_new_token", { p_id: t.id }), "New QR made"); onToken(); setConfirm(""); }}><RefreshCw />Replace QR</Button></div>
          </div>
        ) : confirm === "del" ? (
          <div className="grid grid-cols-2 gap-2"><Button onClick={() => setConfirm("")}>Keep it</Button>
            <Button variant="danger" disabled={pending} onClick={async () => { const ok = await run(() => rpc("owner_delete_table", { p_id: t.id }).then(() => true), "Table deleted"); if (ok) onSaved(); }}><Trash2 />Yes, delete</Button></div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => setConfirm("qr")}><RefreshCw />Replace QR</Button>
            <Button variant="danger" onClick={() => setConfirm("del")}><Trash2 />Delete table</Button>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

const NEW = "\u0000new";
const ROOM_OPTIONS: { value: RoomShape; label: string }[] = [{ value: "wide", label: "Wide" }, { value: "square", label: "Square" }, { value: "long", label: "Long" }];

/** Areas: add, rename, order, room shape, delete an empty one. */
function AreasSheet({ areas, tables, onClose, onChanged }: { areas: LiveArea[]; tables: LiveTable[]; onClose: () => void; onChanged: (area?: string) => void }) {
  const { run, pending } = useAction();
  const [names, setNames] = React.useState<Record<string, string>>({});
  const [add, setAdd] = React.useState("");
  const count = (a: LiveArea) => tables.filter(t => t.area === a.name).length;
  const save = (a: LiveArea, p: { name?: string; shape?: RoomShape }) =>
    run(() => rpc("owner_save_area", { p: { id: a.id, name: p.name ?? a.name, shape: p.shape ?? a.shape } }).then(() => true), p.name ? "Area renamed" : "Room shape saved")
      .then(ok => { if (ok) { if (p.name) setNames(n => { const c = { ...n }; delete c[a.id]; return c; }); onChanged(p.name); } });
  const move = (i: number, d: -1 | 1) => {
    const ids = areas.map(a => a.id); [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    run(() => rpc("owner_sort_areas", { p_ids: ids }).then(() => true)).then(ok => { if (ok) onChanged(); });
  };
  const known = areas.filter(a => a.id);

  return (
    <Sheet open onOpenChange={o => !o && onClose()} title="Areas" description="The parts of your restaurant: each one is a room on the floor plan, in this order.">
      <div className="grid gap-3">
        {known.map((a, i) => {
          const n = count(a), v = names[a.id] ?? a.name, changed = v.trim() !== a.name && v.trim() !== "";
          return (
            <div key={a.id} className="grid gap-2.5 rounded-[var(--radius-lg)] border border-border p-3">
              <div className="flex items-center gap-2">
                <Input aria-label={`Name of ${a.name}`} value={v} maxLength={30} onChange={e => setNames(m => ({ ...m, [a.id]: e.target.value }))}
                  onKeyDown={e => { if (e.key === "Enter" && changed) save(a, { name: v.trim() }); }} />
                {changed
                  ? <Button size="sm" variant="primary" disabled={pending} onClick={() => save(a, { name: v.trim() })}>Rename</Button>
                  : (<>
                    <Button size="icon" aria-label={`Move ${a.name} up`} disabled={pending || i === 0} onClick={() => move(i, -1)}><ArrowUp /></Button>
                    <Button size="icon" aria-label={`Move ${a.name} down`} disabled={pending || i === known.length - 1} onClick={() => move(i, 1)}><ArrowDown /></Button>
                  </>)}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2" role="group" aria-label={`Room shape of ${a.name}`}>
                  <span className="text-[12px] text-fg-2">Room</span>
                  <Segmented value={a.shape} onChange={v => save(a, { shape: v })} options={ROOM_OPTIONS} />
                </div>
                <span className="flex items-center gap-2 text-[12px] text-fg-2">
                  {n} table{n === 1 ? "" : "s"}
                  <Button size="sm" variant="ghost" aria-label={`Delete ${a.name}`} disabled={pending || n > 0} title={n > 0 ? "Move its tables to another area first" : undefined}
                    onClick={() => run(() => rpc("owner_delete_area", { p_id: a.id }).then(() => true), "Area deleted").then(ok => { if (ok) onChanged(); })}><Trash2 /></Button>
                </span>
              </div>
            </div>
          );
        })}
        <form className="flex items-end gap-2" onSubmit={e => { e.preventDefault(); const name = add.trim(); if (!name) return;
            run(() => rpc("owner_save_area", { p: { name } }).then(() => true), "Area added").then(ok => { if (ok) { setAdd(""); onChanged(name); } }); }}>
          <div className="min-w-0 flex-1"><Field label="New area"><Input value={add} maxLength={30} placeholder="e.g. Rooftop, AC Hall, Family room" onChange={e => setAdd(e.target.value)} /></Field></div>
          <Button type="submit" variant="primary" disabled={pending || !add.trim()}><Plus />Add area</Button>
        </form>
        <p className="text-[12px] text-fg-2">An area with tables can&apos;t be deleted: move its tables first. Renaming an area moves its tables with it.</p>
      </div>
    </Sheet>
  );
}
