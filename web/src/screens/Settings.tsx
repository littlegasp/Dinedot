"use client";
import * as React from "react";
import { Camera, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Field, Input, Skeleton, Switch, Textarea } from "@/components/ui/primitives";
import { toast } from "@/components/ui/overlay";
import { rpc, uploadPhoto } from "@/lib/api";
import { useStaff } from "@/lib/staff";
import type { Settings } from "@/lib/types";

export function SettingsScreen() {
  const { me, reload } = useStaff();
  const [s, setS] = React.useState<Settings | null>(null);
  const [saved, setSaved] = React.useState<Settings | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [tips, setTips] = React.useState("");   // typed freely, read when saving
  const [stations, setStations] = React.useState("");
  const fileRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => { rpc<Settings>("owner_settings").then(x => { setS(x); setSaved(x); setTips(x.tip_options.join(", ")); setStations((x.stations ?? []).join(", ")); }).catch(e => toast((e as Error).message, "error")); }, []);
  if (!s) return <div className="grid gap-4">{[0, 1, 2].map(i => <Skeleton key={i} className="h-48" />)}</div>;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS(x => x && { ...x, [k]: v });
  const num = (v: string) => Math.max(0, Math.min(100, Number(v.replace(/[^\d.]/g, "")) || 0));
  const tipList = [...new Set(tips.split(",").map(x => x.trim()).filter(Boolean).map(x => Math.round(num(x))))].slice(0, 6);
  const stationList = stations.split(",").map(x => x.trim().slice(0, 24)).filter(Boolean)
    .filter((x, i, a) => a.findIndex(y => y.toLowerCase() === x.toLowerCase()) === i);   // the same name once, first spelling kept
  const dirty = JSON.stringify(s) !== JSON.stringify(saved) || tipList.join() !== saved?.tip_options.join() || stationList.join() !== (saved?.stations ?? []).join();

  const save = async () => {
    setBusy(true);
    try {
      const tip_options = tipList.length ? tipList : [0];
      const { restaurant_name, tagline, cover_url, welcome_note, closed_message, gst_pct, service_pct, upi_id, upi_name,
        pay_cash, pay_card, pay_upi, wifi_name, wifi_password, google_review_url, max_discount_pct } = s;
      const general = () => rpc("owner_save_settings", { p: { restaurant_name, tagline, cover_url, welcome_note, closed_message, gst_pct, service_pct,
        tip_options, upi_id: upi_id.trim(), upi_name, pay_cash, pay_card, pay_upi, wifi_name, wifi_password, google_review_url,
        max_discount_pct, stations: stationList } });
      const { legal_name, bill_address, gstin, fssai, sac, gst_composition, invoice_prefix, bill_footer, receipt_width } = s;
      const billing = () => rpc("owner_save_bill_settings", { p: { legal_name, bill_address, gstin: gstin.trim().toUpperCase(), fssai: fssai.trim(), sac: sac.trim(),
        gst_composition, invoice_prefix: invoice_prefix.trim().toUpperCase(), bill_footer, receipt_width } });
      // leaving the composition scheme: bill details first, so GST can be switched back on
      if (saved && saved.gst_composition && !gst_composition) { await billing(); await general(); } else { await general(); await billing(); }
      const next = { ...s, tip_options, stations: stationList }; setS(next); setSaved(next); setTips(tip_options.join(", ")); setStations(stationList.join(", "));
      toast("Settings saved"); reload();
    } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  };
  const cover = async (f?: File | null) => {
    if (!f) return;
    setBusy(true);
    try { set("cover_url", await uploadPhoto(f, me?.restaurant_id ?? "demo", 1600)); toast("Cover added. Remember to Save."); }
    catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  };

  return (
    <div className="grid gap-5 pb-20 lg:max-w-3xl">
      <Card>
        <CardHeader title="Restaurant" sub="Shown at the top of the guest page and on QR cards." />
        <div className="grid gap-4 px-5 pb-5">
          <div className="flex items-center gap-4">
            {s.cover_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={s.cover_url} alt="" className="h-20 w-32 rounded-[var(--radius)] object-cover" />
              : <div className="grid h-20 w-32 place-items-center rounded-[var(--radius)] bg-muted text-fg-2"><Camera className="size-5" /></div>}
            <div className="grid gap-1.5">
              <Button size="sm" disabled={busy} onClick={() => fileRef.current?.click()}><Camera />{s.cover_url ? "Change cover" : "Add cover photo"}</Button>
              {s.cover_url && <button className="text-left text-[12px] font-semibold text-danger" onClick={() => set("cover_url", "")}>Remove cover</button>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { cover(e.target.files?.[0]); e.target.value = ""; }} />
          </div>
          <Field label="Restaurant name"><Input value={s.restaurant_name} maxLength={80} onChange={e => set("restaurant_name", e.target.value)} /></Field>
          <Field label="Tagline"><Input value={s.tagline} maxLength={80} onChange={e => set("tagline", e.target.value)} placeholder="e.g. North Indian kitchen & grill" /></Field>
          <Field label="Welcome note"><Textarea value={s.welcome_note} maxLength={200} onChange={e => set("welcome_note", e.target.value)} placeholder="e.g. Order from your phone; we'll bring it to your table." /></Field>
          <Field label="Message when QR ordering is paused"><Input value={s.closed_message} maxLength={120} onChange={e => set("closed_message", e.target.value)} /></Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Bill" sub="Worked out the same way on every screen and the guest's phone." />
        <div className="grid gap-4 px-5 pb-5 sm:grid-cols-3">
          <Field label="GST %"><Input inputMode="decimal" className="num" value={String(s.gst_pct)} onChange={e => set("gst_pct", num(e.target.value))} /></Field>
          <Field label="Service charge %" hint="0 for none"><Input inputMode="decimal" className="num" value={String(s.service_pct)} onChange={e => set("service_pct", num(e.target.value))} /></Field>
          <Field label="Tip choices %" hint="Comma separated, e.g. 0, 5, 10">
            <Input value={tips} onChange={e => setTips(e.target.value.replace(/[^\d,\s]/g, ""))} /></Field>
          <Field label="Manager discount limit %" hint="Managers can take up to this much off a bill. You (the owner) can give more.">
            <Input inputMode="decimal" className="num" value={String(s.max_discount_pct ?? 20)} onChange={e => set("max_discount_pct", num(e.target.value))} /></Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Bills" sub="What a printed bill shows. GST bills need your GSTIN; every bill shows your FSSAI licence number." />
        <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
          <Field label="Legal name" hint="As on your GST registration"><Input value={s.legal_name ?? ""} maxLength={120} onChange={e => set("legal_name", e.target.value)} /></Field>
          <Field label="GSTIN" hint="15 characters. Leave empty if you aren't registered for GST.">
            <Input value={s.gstin ?? ""} maxLength={15} className="uppercase" onChange={e => set("gstin", e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, ""))} /></Field>
          <div className="sm:col-span-2"><Field label="Address on the bill"><Textarea value={s.bill_address ?? ""} maxLength={300} className="min-h-16" onChange={e => set("bill_address", e.target.value)} /></Field></div>
          <Field label="FSSAI licence number" hint="14 digits"><Input inputMode="numeric" value={s.fssai ?? ""} maxLength={14} onChange={e => set("fssai", e.target.value.replace(/\D/g, ""))} /></Field>
          <Field label="Bill number prefix" hint={`Up to 5 letters. Bills are numbered like ${(s.invoice_prefix || "").toUpperCase()}2627-0001 and start again each 1 April.`}>
            <Input value={s.invoice_prefix ?? ""} maxLength={5} className="uppercase" onChange={e => set("invoice_prefix", e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, ""))} /></Field>
          <Field label="SAC code" hint="996331 for restaurant service"><Input inputMode="numeric" value={s.sac ?? "996331"} maxLength={8} onChange={e => set("sac", e.target.value.replace(/\D/g, ""))} /></Field>
          <Field label="Receipt paper">
            <select value={s.receipt_width ?? 80} onChange={e => set("receipt_width", Number(e.target.value) as 58 | 80)} className="h-10 rounded-[var(--radius)] border border-border bg-surface px-2 text-sm text-fg">
              <option value={80}>80 mm roll (most counter printers)</option><option value={58}>58 mm roll (small printers)</option>
            </select></Field>
          <div className="sm:col-span-2"><Field label="Line at the bottom of the bill"><Input value={s.bill_footer ?? ""} maxLength={160} onChange={e => set("bill_footer", e.target.value)} /></Field></div>
          <label className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-border p-3 sm:col-span-2">
            <span><span className="block text-sm font-semibold text-fg">GST composition scheme</span>
              <span className="text-[12px] text-fg-2">Tick only if you pay GST under the composition scheme. Bills then print as a Bill of supply and no GST is charged (set GST % to 0).</span></span>
            <Switch checked={!!s.gst_composition} onChange={v => { set("gst_composition", v); if (v) set("gst_pct", 0); }} label="GST composition scheme" />
          </label>
        </div>
      </Card>

      <Card>
        <CardHeader title="Kitchen stations" sub="Split the kitchen screen so each counter sees only its own dishes." />
        <div className="grid gap-3 px-5 pb-5">
          <Field label="Stations" hint="Comma separated, up to 8, e.g. Tandoor, Curry, Bar. Then pick a station for each section in Menu.">
            <Input value={stations} onChange={e => setStations(e.target.value)} placeholder="Leave empty for one kitchen screen" /></Field>
          {stationList.length > 0 && <p className="text-[12px] text-fg-2">On each kitchen screen, pick its station at the top. A removed station is taken off its sections and dishes.</p>}
        </div>
      </Card>

      <Card>
        <CardHeader title="Payments" sub="UPI goes straight to your account. No fees, no gateway." />
        <div className="grid gap-4 px-5 pb-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="UPI ID" hint="e.g. yourname@okicici"><Input value={s.upi_id} maxLength={60} onChange={e => set("upi_id", e.target.value)} /></Field>
            <Field label="Name on UPI" hint="What the guest's UPI app shows"><Input value={s.upi_name} maxLength={60} onChange={e => set("upi_name", e.target.value)} /></Field>
          </div>
          {s.pay_upi && !s.upi_id.trim() && <p role="status" className="rounded-[var(--radius)] bg-warning-soft px-3 py-2 text-[13px] font-semibold text-warning-strong">Guests won&apos;t see UPI until you add your UPI ID above.</p>}
          {([["pay_upi", "UPI / QR"], ["pay_card", "Card"], ["pay_cash", "Cash"]] as const).map(([k, l]) => (
            <label key={k} className="flex items-center justify-between rounded-[var(--radius)] border border-border p-3">
              <span className="text-sm font-semibold text-fg">Guests can choose {l}</span><Switch checked={s[k]} onChange={v => set(k, v)} label={`Accept ${l}`} />
            </label>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Guest Wi-Fi and reviews" sub="Wi-Fi shows only to guests with an open bill." />
        <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
          <Field label="Wi-Fi name"><Input value={s.wifi_name} maxLength={60} onChange={e => set("wifi_name", e.target.value)} /></Field>
          <Field label="Wi-Fi password"><Input value={s.wifi_password} maxLength={60} onChange={e => set("wifi_password", e.target.value)} /></Field>
          <div className="sm:col-span-2"><Field label="Google review link" hint="Happy guests (4–5 stars) are offered this link."><Input type="url" value={s.google_review_url} onChange={e => set("google_review_url", e.target.value)} placeholder="https://g.page/r/…" /></Field></div>
        </div>
      </Card>

      {dirty && (
        <div className="fixed inset-x-0 bottom-[72px] z-20 flex justify-center px-4 lg:bottom-6 lg:left-[248px]">
          <div className="flex items-center gap-3 rounded-[var(--radius-lg)] bg-ink px-4 py-2 text-[13px] text-surface shadow-[var(--shadow)]">
            <span>Unsaved changes</span>
            <Button size="md" variant="primary" disabled={busy} onClick={save}><Save />{busy ? "Saving…" : "Save changes"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
