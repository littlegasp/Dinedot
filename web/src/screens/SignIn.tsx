"use client";
import * as React from "react";
import { ChefHat, Crown, LogIn, Store, UserRound, Utensils, Wallet } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Card, Field, Input } from "@/components/ui/primitives";
import { Auth, demo, isDemo, rpc } from "@/lib/api";
import { useStaff } from "@/lib/staff";

const DEMO_LOGINS = [
  { email: "owner@demo", name: "Meera", role: "Owner", Icon: Crown },
  { email: "manager@demo", name: "Sana", role: "Manager", Icon: Store },
  { email: "cashier@demo", name: "Tara", role: "Cashier", Icon: Wallet },
  { email: "waiter@demo", name: "Ravi", role: "Waiter", Icon: Utensils },
  { email: "kitchen@demo", name: "Chef Imran", role: "Kitchen", Icon: ChefHat },
];

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex justify-center"><Logo /></div>
        {children}
      </div>
    </div>
  );
}

export function SignIn({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const demoMode = isDemo();

  const go = async (e?: React.FormEvent, as?: string) => {
    e?.preventDefault(); setErr(""); setBusy(true);
    try { await Auth.signIn(as ?? email, password); onDone(); }
    catch (x) { setErr((x as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <Frame>
      <Card className="p-6">
        <h1 className="text-2xl font-extrabold text-fg">Sign in</h1>
        {demoMode ? (
          <>
            <p className="mt-1 text-sm text-fg-2">This is the demo restaurant, The Copper Pot. Pick who you want to be. Everything stays in this browser.</p>
            <div className="mt-5 grid gap-2">
              {DEMO_LOGINS.map(d => (
                <button key={d.email} disabled={busy} onClick={() => go(undefined, d.email)}
                  className="flex h-14 items-center gap-3 rounded-[var(--radius)] border border-border bg-surface px-4 text-left hover:border-border-strong hover:bg-muted">
                  <span className="grid size-9 place-items-center rounded-full bg-coral-soft text-coral-strong"><d.Icon className="size-4" aria-hidden /></span>
                  <span className="flex-1"><span className="block text-sm font-bold text-fg">{d.role}</span><span className="text-[12px] text-fg-2">{d.name}</span></span>
                  <LogIn className="size-4 text-fg-2" aria-hidden />
                </button>
              ))}
            </div>
            <button className="mt-4 text-[13px] font-semibold text-blue" onClick={async () => { (await demo()).reset(); setErr("Demo reset to the start."); }}>Reset the demo</button>
          </>
        ) : (
          <form onSubmit={go} className="mt-5 grid gap-4">
            <Field label="Email"><Input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></Field>
            <Field label="Password"><Input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></Field>
            <Button type="submit" size="lg" variant="primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
            <button type="button" className="text-[13px] font-semibold text-blue" disabled={!email}
              onClick={async () => { try { await Auth.forgot(email); setSent(true); } catch (x) { setErr((x as Error).message); } }}>
              Forgot password?
            </button>
            {sent && <p className="text-[13px] text-success">We&apos;ve emailed a link to set a new password.</p>}
          </form>
        )}
        {err && <p role="alert" className="mt-4 rounded-[var(--radius)] bg-danger-soft px-3 py-2 text-[13px] font-semibold text-danger">{err}</p>}
      </Card>
      <p className="mt-4 text-center text-[12px] text-fg-2">Guests never sign in. They order by scanning the QR code on their table.</p>
    </Frame>
  );
}

/** Signed in, but not working anywhere yet (or switched off). */
export function NoRestaurant() {
  const { me, reloadMe, signOut } = useStaff();
  const [name, setName] = React.useState("");
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const waiting = !!me?.restaurant_id;   // has a membership that is switched off
  return (
    <Frame>
      <Card className="p-6">
        <div className="mb-3 grid size-11 place-items-center rounded-full bg-muted text-fg-2"><UserRound className="size-5" aria-hidden /></div>
        {waiting ? (
          <>
            <h1 className="text-xl font-extrabold text-fg">Waiting for the owner</h1>
            <p className="mt-1 text-sm text-fg-2">You&apos;re on the team at <b>{me?.restaurant}</b>, but your login is switched off. Ask the owner to switch it on in Team, then tap Check again.</p>
            <Button className="mt-5 w-full" size="lg" onClick={() => reloadMe()}>Check again</Button>
          </>
        ) : (
          <form onSubmit={async e => { e.preventDefault(); setErr(""); setBusy(true);
              try { await rpc("create_restaurant", { p_name: name }); await reloadMe(); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); } }}>
            <h1 className="text-xl font-extrabold text-fg">Set up your restaurant</h1>
            <p className="mt-1 text-sm text-fg-2">You&apos;re signed in as {me?.email}. Name your restaurant to start; you&apos;ll be its owner. If you were meant to join someone&apos;s team, ask them to add you from Team instead.</p>
            <div className="mt-5"><Field label="Restaurant name"><Input required minLength={2} maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. The Copper Pot" /></Field></div>
            <Button type="submit" className="mt-4 w-full" size="lg" variant="primary" disabled={busy}>{busy ? "Creating…" : "Create restaurant"}</Button>
          </form>
        )}
        {err && <p role="alert" className="mt-4 rounded-[var(--radius)] bg-danger-soft px-3 py-2 text-[13px] font-semibold text-danger">{err}</p>}
        <button className="mt-4 text-[13px] font-semibold text-fg-2" onClick={signOut}>Sign out</button>
      </Card>
    </Frame>
  );
}

/** Opened from the "set a new password" email link (Auth.takeRecovery() kept its sign-in). */
export function NewPassword({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = React.useState("");
  const [pw2, setPw2] = React.useState("");
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  return (
    <Frame>
      <Card className="p-6">
        <h1 className="text-2xl font-extrabold text-fg">Set a new password</h1>
        <p className="mt-1 text-sm text-fg-2">At least 8 characters. You&apos;ll stay signed in on this device.</p>
        <form className="mt-5 grid gap-4" onSubmit={async e => { e.preventDefault(); setErr("");
          if (pw.length < 8) return setErr("Use at least 8 characters.");
          if (pw !== pw2) return setErr("The two passwords don't match.");
          setBusy(true); try { await Auth.setPassword(pw); onDone(); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); } }}>
          <Field label="New password"><Input type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} /></Field>
          <Field label="Type it again"><Input type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} /></Field>
          <Button type="submit" size="lg" variant="primary" disabled={busy}>{busy ? "Saving…" : "Save new password"}</Button>
        </form>
        {err && <p role="alert" className="mt-4 rounded-[var(--radius)] bg-danger-soft px-3 py-2 text-[13px] font-semibold text-danger">{err}</p>}
      </Card>
    </Frame>
  );
}
