"use client";
import * as React from "react";
import qrcode from "qrcode-generator";
import { Plus, Printer, QrCode, RefreshCw, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, Field, Input, Skeleton, Switch } from "@/components/ui/primitives";
import { Sheet, toast } from "@/components/ui/overlay";
import { LogoMark } from "@/components/brand/Logo";
import { rpc } from "@/lib/api";
import { useAction, useStaff } from "@/lib/staff";
import type { LiveTable } from "@/lib/types";
import { cn } from "@/lib/utils";

/** The address a table's QR code opens: this site's t.html (same as the printed codes of the old app). */
export const guestUrl = (token: string) => new URL(`t.html?k=${encodeURIComponent(token)}`, location.href.split("#")[0]).toString();

function Qr({ text, className, decorative }: { text: string; className?: string; decorative?: boolean }) {
  const svg = React.useMemo(() => { const q = qrcode(0, "M"); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); }, [text]);
  return decorative
    ? <div className={cn("bg-white [&_svg]:size-full", className)} aria-hidden dangerouslySetInnerHTML={{ __html: svg }} />
    : <div className={cn("bg-white [&_svg]:size-full", className)} role="img" aria-label="QR code" dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function TablesScreen() {
  const { live, reload } = useStaff();
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
  const areas = [...new Set(tables.map(t => t.area))];

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => setEdit({ code: "", area: areas[0] ?? "Main", seats: 4, active: true })}><Plus />Add table</Button>
        <Button disabled={!tables.some(t => t.active)} onClick={() => setPrinting(tables.filter(t => t.active))}><Printer />Print QR codes</Button>
      </div>

      {tables.length === 0 ? (
        <Card><EmptyState icon={<QrCode />} title="No tables yet" body="Add your tables, then print a QR card for each one."
          action={<Button variant="primary" onClick={() => setEdit({ code: "T1", area: "Main", seats: 4, active: true })}><Plus />Add table</Button>} /></Card>
      ) : areas.map(a => (
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

      {edit && <TableSheet t={edit} token={edit.id ? tokens[edit.id] : undefined} areas={areas}
        onClose={() => setEdit(null)} onPrint={t => { setEdit(null); setPrinting([t]); }}
        onSaved={() => { setEdit(null); reload(); loadTokens(); }} onToken={loadTokens} />}

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
  onClose: () => void; onSaved: () => void; onToken: () => void; onPrint: (t: LiveTable) => void }) {
  const { run, pending } = useAction();
  const [f, setF] = React.useState({ code: t.code ?? "", name: t.name ?? "", area: t.area ?? "Main", seats: t.seats ?? 4, active: t.active ?? true });
  const [confirm, setConfirm] = React.useState<"" | "qr" | "del">("");
  const save = async () => { const ok = await run(() => rpc("owner_save_table", { p: { id: t.id ?? "", ...f } }).then(() => true), "Table saved"); if (ok) onSaved(); };

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
        <Field label="Area" hint="e.g. Main, Terrace, Family room">
          <Input value={f.area} list="areas" maxLength={30} onChange={e => setF({ ...f, area: e.target.value })} />
        </Field>
        <datalist id="areas">{areas.map(a => <option key={a} value={a} />)}</datalist>
        <Field label="Name (optional)" hint="Shown to guests instead of the number, e.g. Window booth"><Input value={f.name} maxLength={40} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
        <label className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-border p-3">
          <span><span className="block text-sm font-semibold text-fg">In use</span><span className="text-[12px] text-fg-2">Switched off, its QR code stops working.</span></span>
          <Switch checked={f.active} onChange={v => setF({ ...f, active: v })} label="Table in use" />
        </label>
        <Button size="lg" variant="primary" disabled={pending || !f.code.trim()} onClick={save}>Save table</Button>

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
