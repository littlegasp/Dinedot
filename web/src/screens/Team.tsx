"use client";
import * as React from "react";
import { KeyRound, Plus, Trash2, UserRound, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, Field, Input, Segmented, Skeleton, Switch } from "@/components/ui/primitives";
import { Sheet, toast } from "@/components/ui/overlay";
import { rpc, teamAdmin } from "@/lib/api";
import { useStaff } from "@/lib/staff";
import type { Role, TeamMember } from "@/lib/types";
import { cn } from "@/lib/utils";

export const ROLE_INFO: Record<Role, { label: string; what: string }> = {
  owner: { label: "Owner", what: "Everything, including Team and Settings" },
  manager: { label: "Manager", what: "Everything except Team and Settings" },
  cashier: { label: "Cashier", what: "POS, takeaway, payments, bills and printing bills. No discounts, no clearing tables" },
  waiter: { label: "Waiter", what: "Floor, POS, Bills and the kitchen screen" },
  kitchen: { label: "Kitchen", what: "Kitchen screen and sold-out switches" },
};

export function TeamScreen() {
  const { me } = useStaff();
  const [team, setTeam] = React.useState<TeamMember[] | null>(null);
  const [open, setOpen] = React.useState<Partial<TeamMember> | null>(null);
  const load = React.useCallback(() => rpc<{ staff: TeamMember[] }>("owner_team").then(r => setTeam(r.staff)).catch(e => toast((e as Error).message, "error")), []);
  React.useEffect(() => { load(); }, [load]);

  if (!team) return <div className="grid gap-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-16" />)}</div>;
  return (
    <div className="grid gap-5">
      <div><Button variant="primary" onClick={() => setOpen({ role: "waiter", active: true })}><Plus />Add login</Button></div>
      {team.length === 0 ? <Card><EmptyState icon={<Users />} title="Just you so far" body="Add a login for each person who works here." /></Card> : (
        <Card className="divide-y divide-border">
          {team.map(m => (
            <button key={m.id} onClick={() => setOpen(m)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-muted/50">
              <span className={cn("grid size-10 shrink-0 place-items-center rounded-full bg-blue-soft font-bold text-blue", !m.active && "bg-muted text-fg-2")}>{m.name[0]?.toUpperCase()}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-fg">{m.name}{m.id === me?.id && <span className="font-normal text-fg-2"> (you)</span>}</span>
                <span className="block truncate text-[12px] text-fg-2">{m.email}</span>
              </span>
              <Badge tone={m.role === "owner" ? "ink" : m.role === "manager" ? "blue" : "neutral"}>{ROLE_INFO[m.role].label}</Badge>
              <Badge tone={m.active ? "success" : "danger"}>{m.active ? "On" : "Switched off"}</Badge>
            </button>
          ))}
        </Card>
      )}
      <Card className="p-5">
        <h2 className="mb-3 text-[15px] font-bold text-fg">What each role can do</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          {(Object.keys(ROLE_INFO) as Role[]).map(r => <div key={r}><dt className="font-semibold text-fg">{ROLE_INFO[r].label}</dt><dd className="text-fg-2">{ROLE_INFO[r].what}</dd></div>)}
        </dl>
      </Card>
      {open && <MemberSheet m={open} self={open.id === me?.id} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load(); }} />}
    </div>
  );
}

function MemberSheet({ m, self, onClose, onSaved }: { m: Partial<TeamMember>; self: boolean; onClose: () => void; onSaved: () => void }) {
  const isNew = !m.id;
  const [f, setF] = React.useState({ name: m.name ?? "", email: m.email ?? "", phone: m.phone ?? "", role: (m.role ?? "waiter") as Role, active: m.active ?? true });
  const [pw, setPw] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [confirmDel, setConfirmDel] = React.useState(false);
  const act = async (fn: () => Promise<unknown>, ok: string, close = true) => {
    setBusy(true);
    try { await fn(); toast(ok); if (close) onSaved(); } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  };
  const save = () => isNew
    ? (async () => {
        setBusy(true);
        try {
          const r = await teamAdmin({ action: "add", ...f, password: pw }) as { existing?: boolean } | null;
          toast(r?.existing ? `${f.name} already had a DineOS login, so they're added to your team. They sign in with their own password.`
                            : `Login added for ${f.name}. Tell them the password in person.`);
          onSaved();
        } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
      })()
    : act(async () => {
        // name, phone, role and on/off go straight to the database; a new email needs the login manager
        if (f.email.trim().toLowerCase() !== (m.email ?? "").toLowerCase()) await teamAdmin({ action: "update", id: m.id, ...f });
        else await rpc("owner_edit_staff", { p_id: m.id, p_name: f.name, p_phone: f.phone, p_role: f.role, p_active: f.active });
      }, "Saved");

  return (
    <Sheet open onOpenChange={o => !o && onClose()} title={isNew ? "Add login" : f.name || "Login"} description={isNew ? "They sign in with this email and password." : m.email}>
      <div className="grid gap-4">
        <Field label="Name"><Input value={f.name} maxLength={60} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Email" hint={isNew ? undefined : "Changing it changes how they sign in."}><Input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Phone (optional)"><Input inputMode="tel" value={f.phone} maxLength={20} onChange={e => setF({ ...f, phone: e.target.value })} /></Field>
        <fieldset><legend className="mb-1.5 text-[13px] font-semibold text-fg">Role</legend>
          <Segmented<Role> value={f.role} onChange={r => setF({ ...f, role: r })} className="flex w-full flex-wrap [&>button]:flex-1"
            options={(Object.keys(ROLE_INFO) as Role[]).map(r => ({ value: r, label: ROLE_INFO[r].label }))} />
          <p className="mt-1.5 text-[12px] text-fg-2">{ROLE_INFO[f.role].what}</p>
        </fieldset>
        {isNew ? (
          <Field label="First password" hint="At least 8 characters. Tell them in person; they can change it later. If they already have a DineOS login, they keep their own."><Input type="text" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} /></Field>
        ) : (
          <label className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-border p-3">
            <span><span className="block text-sm font-semibold text-fg">Can sign in</span><span className="text-[12px] text-fg-2">Switch off when someone leaves or is on leave.</span></span>
            <Switch checked={f.active} disabled={self} onChange={v => setF({ ...f, active: v })} label="Can sign in" />
          </label>
        )}
        <Button size="lg" variant="primary" disabled={busy || !f.name.trim() || !f.email.trim() || (isNew && pw.length < 8)} onClick={save}>{isNew ? "Add login" : "Save"}</Button>

        {!isNew && !self && (
          <div className="grid gap-3 border-t border-border pt-4">
            <div className="flex gap-2">
              <Input type="text" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} placeholder="New password" aria-label="New password" />
              <Button disabled={busy || pw.length < 8} onClick={() => act(() => teamAdmin({ action: "password", id: m.id, password: pw }), "Password set. Tell them in person.", false).then(() => setPw(""))}><KeyRound />Set password</Button>
            </div>
            {confirmDel
              ? <div className="grid grid-cols-2 gap-2"><Button onClick={() => setConfirmDel(false)}>Keep</Button>
                  <Button variant="danger" disabled={busy} onClick={() => act(() => teamAdmin({ action: "delete", id: m.id }), "Login removed")}><Trash2 />Yes, remove</Button></div>
              : <Button variant="danger" onClick={() => setConfirmDel(true)}><Trash2 />Remove login</Button>}
          </div>
        )}
        {self && <p className="flex items-center gap-2 text-[12px] text-fg-2"><UserRound className="size-4" />This is you. You can&apos;t switch off or remove your own owner login.</p>}
      </div>
    </Sheet>
  );
}
