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
  const fileRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => { rpc<Settings>("owner_settings").then(x => { setS(x); setSaved(x); setTips(x.tip_options.join(", ")); }).catch(e => toast((e as Error).message, "error")); }, []);
  if (!s) return <div className="grid gap-4">{[0, 1, 2].map(i => <Skeleton key={i} className="h-48" />)}</div>;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS(x => x && { ...x, [k]: v });
  const num = (v: string) => Math.max(0, Math.min(100, Number(v.replace(/[^\d.]/g, "")) || 0));
  const tipList = [...new Set(tips.split(",").map(x => x.trim()).filter(Boolean).map(x => Math.round(num(x))))].slice(0, 6);
  const dirty = JSON.stringify(s) !== JSON.stringify(saved) || tipList.join() !== saved?.tip_options.join();

  const save = async () => {
    setBusy(true);
    try {
      const tip_options = tipList.length ? tipList : [0];
      const { restaurant_name, tagline, cover_url, welcome_note, closed_message, gst_pct, service_pct, upi_id, upi_name,
        pay_cash, pay_card, pay_upi, wifi_name, wifi_password, google_review_url } = s;
      await rpc("owner_save_settings", { p: { restaurant_name, tagline, cover_url, welcome_note, closed_message, gst_pct, service_pct,
        tip_options, upi_id: upi_id.trim(), upi_name, pay_cash, pay_card, pay_upi, wifi_name, wifi_password, google_review_url } });
      const next = { ...s, tip_options }; setS(next); setSaved(next); setTips(tip_options.join(", ")); toast("Settings saved"); reload();
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
        </div>
      </Card>

      <Card>
        <CardHeader title="Payments" sub="UPI goes straight to your account. No fees, no gateway." />
        <div className="grid gap-4 px-5 pb-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="UPI ID" hint="e.g. yourname@okicici"><Input value={s.upi_id} maxLength={60} onChange={e => set("upi_id", e.target.value)} /></Field>
            <Field label="Name on UPI" hint="What the guest's UPI app shows"><Input value={s.upi_name} maxLength={60} onChange={e => set("upi_name", e.target.value)} /></Field>
          </div>
          {([["pay_upi", "UPI"], ["pay_card", "Card"], ["pay_cash", "Cash"]] as const).map(([k, l]) => (
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
