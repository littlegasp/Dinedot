"use client";
import * as React from "react";
import { Camera, Eye, EyeOff, Plus, Search, Trash2, UtensilsCrossed, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, Diet, EmptyState, Field, Input, Segmented, Skeleton, Switch, Textarea } from "@/components/ui/primitives";
import { Sheet, toast } from "@/components/ui/overlay";
import { removePhoto, rpc, uploadPhoto } from "@/lib/api";
import { useStaff } from "@/lib/staff";
import type { Diet as DietT, MenuCategory, MenuItem, StaffMenu } from "@/lib/types";
import { cn, inr } from "@/lib/utils";

type Opt = { name: string; price: number };
type ItemDraft = Omit<MenuItem, "id" | "sort"> & { id?: string; sort?: number };
const blankItem = (category_id: string): ItemDraft => ({ category_id, name: "", description: "", price: 0, diet: "veg", spice: null, allergens: [],
  sizes: [], addons: [], photo_url: "", bestseller: false, available: true, station: "" });

export function MenuScreen() {
  const { me, can, live } = useStaff();
  const stations = live?.settings.stations ?? [];
  const manage = can("manage");
  const [menu, setMenu] = React.useState<StaffMenu | null>(null);
  const [q, setQ] = React.useState("");
  const [item, setItem] = React.useState<ItemDraft | null>(null);
  const [cat, setCat] = React.useState<Partial<MenuCategory> | null>(null);
  const load = React.useCallback(() => rpc<StaffMenu>("staff_menu").then(setMenu).catch(e => toast((e as Error).message, "error")), []);
  React.useEffect(() => { load(); }, [load]);

  const soldOut = async (i: MenuItem, available: boolean) => {
    setMenu(m => m && { ...m, items: m.items.map(x => x.id === i.id ? { ...x, available } : x) });
    try { await rpc("staff_item_available", { p_item: i.id, p_available: available }); toast(available ? `${i.name} is back on the menu` : `${i.name} marked sold out`); }
    catch (e) { toast((e as Error).message, "error"); load(); }
  };

  if (!menu) return <div className="grid gap-3">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-20" />)}</div>;
  const match = (i: MenuItem) => i.name.toLowerCase().includes(q.trim().toLowerCase());

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-auto sm:min-w-64 sm:max-w-xs sm:flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-2" aria-hidden />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a dish" className="pl-9" aria-label="Find a dish" />
        </div>
        {manage && <>
          <Button onClick={() => setCat({ name: "", active: true })}><Plus />Add section</Button>
          <Button variant="primary" disabled={!menu.categories.length} onClick={() => setItem(blankItem(menu.categories[0].id))}><Plus />Add dish</Button>
        </>}
      </div>

      {menu.categories.length === 0 ? (
        <Card><EmptyState icon={<UtensilsCrossed />} title="No sections yet" body={manage ? "Start with a section such as Starters, then add dishes to it." : "The manager hasn't added the menu yet."}
          action={manage ? <Button variant="primary" onClick={() => setCat({ name: "", active: true })}><Plus />Add section</Button> : undefined} /></Card>
      ) : menu.categories.map(c => {
        const dishes = menu.items.filter(i => i.category_id === c.id && match(i));
        if (q.trim() && !dishes.length) return null;
        return (
          <Card key={c.id} className={cn(!c.active && "opacity-70")}>
            <div className="flex items-center gap-3 border-b border-border px-5 py-3">
              <h2 className="flex-1 text-base font-extrabold text-fg">{c.name} <span className="num ml-1 text-[13px] font-semibold text-fg-2">{dishes.length}</span></h2>
              {c.station && stations.length > 0 && <Badge tone="neutral">{c.station}</Badge>}
              {!c.active && <Badge tone="neutral"><EyeOff />Hidden from guests</Badge>}
              {manage && <Button size="sm" variant="ghost" onClick={() => setCat(c)}>Edit section</Button>}
            </div>
            {dishes.length === 0 ? <p className="px-5 py-4 text-sm text-fg-2">No dishes in this section yet.</p> : (
              <ul className="divide-y divide-border">
                {dishes.map(i => (
                  <li key={i.id} className="flex items-center gap-3 px-5 py-3">
                    <button className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default" disabled={!manage} onClick={() => setItem(i)}>
                      {i.photo_url
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={i.photo_url} alt="" className="size-12 shrink-0 rounded-[var(--radius-sm)] object-cover" loading="lazy" />
                        : <span className="grid size-12 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-muted text-fg-2"><UtensilsCrossed className="size-5" aria-hidden /></span>}
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5"><Diet diet={i.diet} /><span className="truncate text-sm font-semibold text-fg">{i.name}</span>
                          {i.bestseller && <Badge tone="coral" className="h-5 px-2 text-[11px]">Bestseller</Badge>}</span>
                        <span className="num block text-[13px] text-fg-2">
                          {i.sizes.length ? i.sizes.map(s => `${s.name} ${inr(s.price)}`).join(" · ") : inr(i.price)}{i.addons.length ? ` · ${i.addons.length} extra${i.addons.length > 1 ? "s" : ""}` : ""}
                        </span>
                      </span>
                    </button>
                    <span className={cn("hidden text-[12px] font-semibold sm:inline", i.available ? "text-success" : "text-danger")}>{i.available ? "On menu" : "Sold out"}</span>
                    <Switch checked={i.available} onChange={v => soldOut(i, v)} label={`${i.name}: ${i.available ? "on the menu" : "sold out"}`} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        );
      })}

      {cat && <SectionSheet c={cat} stations={stations} onClose={() => setCat(null)} onSaved={() => { setCat(null); load(); }} />}
      {item && <DishSheet d={item} categories={menu.categories} stations={stations} restaurantId={me?.restaurant_id ?? "demo"} onClose={() => setItem(null)} onSaved={() => { setItem(null); load(); }} />}
    </div>
  );
}

/** Kitchen station picker; hidden until Settings has stations. */
function StationField({ value, onChange, stations, hint, empty }: { value: string; onChange: (v: string) => void; stations: string[]; hint: string; empty: string }) {
  if (!stations.length && !value) return null;
  return (
    <Field label="Kitchen station" hint={hint}>
      <select value={value} onChange={e => onChange(e.target.value)} className="h-10 rounded-[var(--radius)] border border-border bg-surface px-2 text-sm text-fg">
        <option value="">{empty}</option>
        {stations.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
    </Field>
  );
}

function SectionSheet({ c, stations, onClose, onSaved }: { c: Partial<MenuCategory>; stations: string[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = React.useState(c.name ?? "");
  const [station, setStation] = React.useState(c.station ?? "");
  const [active, setActive] = React.useState(c.active ?? true);
  const [busy, setBusy] = React.useState(false);
  const save = async () => {
    setBusy(true);
    try { await rpc("owner_save_category", { p: { id: c.id ?? "", name: name.trim(), active, station } }); toast("Section saved"); onSaved(); }
    catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  };
  const del = async () => {
    setBusy(true);
    try { await rpc("owner_delete_category", { p_id: c.id }); toast("Section deleted"); onSaved(); }
    catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  };
  return (
    <Sheet open onOpenChange={o => !o && onClose()} title={c.id ? "Edit section" : "Add section"} description="Sections group dishes on the guest menu and in the POS.">
      <div className="grid gap-4">
        <Field label="Section name"><Input autoFocus value={name} maxLength={40} onChange={e => setName(e.target.value)} placeholder="e.g. Starters" /></Field>
        <StationField value={station} onChange={setStation} stations={stations} empty="No station (every kitchen screen)" hint="Dishes in this section show on that station's kitchen screen." />
        <label className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-border p-3">
          <span><span className="block text-sm font-semibold text-fg">Show to guests</span><span className="text-[12px] text-fg-2">Switch off to hide the whole section for now.</span></span>
          <Switch checked={active} onChange={setActive} label="Show section to guests" />
        </label>
        <Button size="lg" variant="primary" disabled={busy || !name.trim()} onClick={save}>Save section</Button>
        {c.id && <Button variant="danger" disabled={busy} onClick={del}><Trash2 />Delete section</Button>}
        {c.id && <p className="text-[12px] text-fg-2">A section can only be deleted once it has no dishes.</p>}
      </div>
    </Sheet>
  );
}

function DishSheet({ d, categories, stations, restaurantId, onClose, onSaved }: { d: ItemDraft; categories: MenuCategory[]; stations: string[]; restaurantId: string; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = React.useState<ItemDraft>(d);
  const [busy, setBusy] = React.useState(false);
  const [confirmDel, setConfirmDel] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const set = <K extends keyof ItemDraft>(k: K, v: ItemDraft[K]) => setF(x => ({ ...x, [k]: v }));
  const original = React.useRef(d.photo_url);

  const pick = async (file?: File | null) => {
    if (!file) return;
    setBusy(true);
    try { const url = await uploadPhoto(file, restaurantId); if (f.photo_url && f.photo_url !== original.current) removePhoto(f.photo_url); set("photo_url", url); toast("Photo added. Remember to Save."); }
    catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true);
    try {
      await rpc("owner_save_item", { p: { ...f, id: f.id ?? "", price: Number(f.price) || 0, spice: f.spice ?? "",
        sizes: f.sizes.filter(s => s.name.trim()).map(s => ({ name: s.name.trim(), price: Number(s.price) || 0 })),
        addons: f.addons.filter(s => s.name.trim()).map(s => ({ name: s.name.trim(), price: Number(s.price) || 0 })) } });
      if (original.current && original.current !== f.photo_url) removePhoto(original.current);
      toast("Dish saved"); onSaved();
    } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  };
  const del = async () => {
    setBusy(true);
    try { const ph = await rpc<string | null>("owner_delete_item", { p_id: f.id }); removePhoto(ph); toast("Dish deleted"); onSaved(); }
    catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  };

  return (
    <Sheet open onOpenChange={o => !o && onClose()} title={f.id ? "Edit dish" : "Add dish"} description="What guests see on the QR menu.">
      <div className="grid gap-4">
        <div className="flex items-center gap-3">
          {f.photo_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={f.photo_url} alt="" className="size-20 rounded-[var(--radius-lg)] object-cover" />
            : <span className="grid size-20 place-items-center rounded-[var(--radius-lg)] bg-muted text-fg-2"><Camera className="size-6" aria-hidden /></span>}
          <div className="grid gap-1.5">
            <Button size="sm" disabled={busy} onClick={() => fileRef.current?.click()}><Camera />{f.photo_url ? "Change photo" : "Add photo"}</Button>
            {f.photo_url && <button className="text-left text-[12px] font-semibold text-danger" onClick={() => set("photo_url", "")}>Remove photo</button>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { pick(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
        <Field label="Dish name"><Input value={f.name} maxLength={60} onChange={e => set("name", e.target.value)} placeholder="e.g. Paneer Tikka" /></Field>
        <Field label="Description" hint="One line guests read under the name."><Textarea value={f.description} maxLength={200} onChange={e => set("description", e.target.value)} className="min-h-16" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Section">
            <select value={f.category_id} onChange={e => set("category_id", e.target.value)} className="h-10 rounded-[var(--radius)] border border-border bg-surface px-2 text-sm text-fg">
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Price (₹)" hint={f.sizes.length ? "Sizes set their own prices." : undefined}>
            <Input inputMode="decimal" disabled={f.sizes.length > 0} value={String(f.price)} onChange={e => set("price", Number(e.target.value.replace(/[^\d.]/g, "")) || 0)} className="num" />
          </Field>
        </div>
        <StationField value={f.station ?? ""} onChange={v => set("station", v)} stations={stations}
          empty={`Same as the section${categories.find(c => c.id === f.category_id)?.station ? ` (${categories.find(c => c.id === f.category_id)?.station})` : ""}`}
          hint="Only if this dish is made somewhere else from the rest of its section." />
        <fieldset><legend className="mb-1.5 text-[13px] font-semibold text-fg">Type</legend>
          <Segmented<DietT> value={f.diet} onChange={v => set("diet", v)} options={[
            { value: "veg", label: <span className="flex items-center gap-1.5"><Diet diet="veg" />Veg</span> },
            { value: "nonveg", label: <span className="flex items-center gap-1.5"><Diet diet="nonveg" />Non-veg</span> },
            { value: "egg", label: <span className="flex items-center gap-1.5"><Diet diet="egg" />Egg</span> }]} />
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Spice (0–5)"><Input inputMode="numeric" value={f.spice == null ? "" : String(f.spice)} onChange={e => { const n = e.target.value.replace(/\D/g, ""); set("spice", n === "" ? null : Math.min(5, Number(n))); }} placeholder="None" /></Field>
          <Field label="Contains" hint="Comma separated, e.g. Dairy, Nuts">
            <Input value={f.allergens.join(", ")} onChange={e => set("allergens", e.target.value.split(",").map(x => x.trim()).filter(Boolean))} /></Field>
        </div>
        <Options title="Sizes" hint="e.g. Half / Full. Leave empty for one price." rows={f.sizes} onChange={v => set("sizes", v)} />
        <Options title="Extras" hint="e.g. Extra cheese +₹40." rows={f.addons} onChange={v => set("addons", v)} />
        <label className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-border p-3">
          <span className="text-sm font-semibold text-fg">Bestseller badge</span><Switch checked={f.bestseller} onChange={v => set("bestseller", v)} label="Bestseller badge" />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-border p-3">
          <span className="flex items-center gap-2 text-sm font-semibold text-fg">{f.available ? <Eye className="size-4" /> : <EyeOff className="size-4" />}{f.available ? "On the menu" : "Sold out"}</span>
          <Switch checked={f.available} onChange={v => set("available", v)} label="On the menu" />
        </label>
        <Button size="lg" variant="primary" disabled={busy || !f.name.trim()} onClick={save}>{busy ? "Saving…" : "Save dish"}</Button>
        {f.id && (confirmDel
          ? <div className="grid grid-cols-2 gap-2"><Button onClick={() => setConfirmDel(false)}>Keep it</Button><Button variant="danger" disabled={busy} onClick={del}><Trash2 />Yes, delete</Button></div>
          : <Button variant="danger" onClick={() => setConfirmDel(true)}><Trash2 />Delete dish</Button>)}
      </div>
    </Sheet>
  );
}

function Options({ title, hint, rows, onChange }: { title: string; hint: string; rows: Opt[]; onChange: (v: Opt[]) => void }) {
  return (
    <fieldset className="grid gap-2">
      <legend className="text-[13px] font-semibold text-fg">{title}</legend>
      <p className="-mt-1 text-[12px] text-fg-2">{hint}</p>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_96px_auto] gap-2">
          <Input value={r.name} placeholder="Name" aria-label={`${title} name`} onChange={e => onChange(rows.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
          <Input value={String(r.price)} inputMode="decimal" aria-label={`${title} price`} className="num" onChange={e => onChange(rows.map((x, j) => j === i ? { ...x, price: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 } : x))} />
          <Button size="icon" variant="ghost" aria-label={`Remove ${r.name || title}`} onClick={() => onChange(rows.filter((_, j) => j !== i))}><X /></Button>
        </div>
      ))}
      <Button size="sm" variant="ghost" className="justify-self-start" onClick={() => onChange([...rows, { name: "", price: 0 }])}><Plus />Add {title === "Sizes" ? "size" : "extra"}</Button>
    </fieldset>
  );
}
