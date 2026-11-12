// push — phone alerts for the staff app (web push), the same design as Vroombrite's.
//
//  • The staff app calls it as a signed-in member of staff for the alert key ("key") or to send
//    itself a test ("test").
//  • The database calls it (through pg_net, with a secret) when there's a new order, a call
//    from a table, or an order that is ready; it then alerts the right people's phones
//    (push_hook in migration 0007 decides who and what).
//
// It makes its own key pair the first time and keeps it in the database (push_config), where
// only this function can read it. Nothing secret is in the repo or the app.
//
// Deploy once: Supabase → Edge Functions → Deploy a new function → Via editor, name it  push ,
// paste this file, Deploy. Then open the function's Details and switch OFF "Verify JWT"
// (the database calls it without a sign-in; it checks the secret instead).

import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import webpush from "npm:web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function serviceKey(env: (k: string) => string | undefined): string | undefined {
  const legacy = env("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try {
    const m = JSON.parse(env("SUPABASE_SECRET_KEYS") ?? "{}");
    return m.default ?? Object.values(m)[0] as string | undefined;
  } catch { return undefined; }
}

type Sub = { endpoint: string; p256dh: string; auth: string };

export async function handle(req: Request, env: (k: string) => string | undefined, wp = webpush): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply(405, { error: "Use POST." });
  const url = env("SUPABASE_URL"), key = serviceKey(env);
  if (!url || !key) return reply(500, { error: "The function is missing its Supabase settings." });
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply(400, { error: "Bad request." }); }

  // The key pair: made once, then always the same.
  async function keys(): Promise<{ public_key: string; private_key: string }> {
    const { data, error } = await admin.rpc("push_keys");
    if (error) throw new Error(error.message);
    if (data?.public_key && data?.private_key) return data;
    const k = wp.generateVAPIDKeys();
    const { error: e2 } = await admin.rpc("push_save_keys", { p_public: k.publicKey, p_private: k.privateKey });
    if (e2) throw new Error(e2.message);
    const { data: again } = await admin.rpc("push_keys");   // another call may have saved first
    return again;
  }
  async function send(subs: Sub[], msg: Record<string, unknown>) {
    if (!subs.length) return { sent: 0 };
    const k = await keys();
    wp.setVapidDetails("mailto:alerts@dinedot.app", k.public_key, k.private_key);
    const dead: string[] = []; let sent = 0;
    await Promise.all(subs.map(async (s) => {
      try { await wp.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 600, urgency: "high" }); sent++; }
      catch (e) { const code = (e as { statusCode?: number }).statusCode; if (code === 404 || code === 410) dead.push(s.endpoint); }
    }));
    if (dead.length) await admin.rpc("push_drop", { p_endpoints: dead });
    return { sent, removed: dead.length };
  }

  // 1. From the database: a new order, a call from a table, or an order that is ready.
  if (typeof body.kind === "string" && typeof body.id === "string") {
    const { data, error } = await admin.rpc("push_hook", { p_kind: body.kind, p_id: body.id, p_secret: String(body.secret ?? "") });
    if (error) return reply(500, { error: error.message });
    if (!data) return reply(403, { error: "Not allowed." });
    const r = await send(data.subs ?? [], { title: data.title, body: data.body, url: data.url, tag: data.tag });
    return reply(200, { ok: true, ...r });
  }

  // 2. From the staff app: a signed-in member of staff.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const apikey = req.headers.get("apikey") ?? env("SUPABASE_ANON_KEY") ?? "";
  if (!token || !apikey) return reply(401, { error: "Sign in first." });
  const asUser = createClient(url, apikey, { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: me, error: meErr } = await asUser.rpc("staff_me");
  if (meErr || !me?.id || !me.active) return reply(401, { error: "Your sign-in has run out. Sign in again." });

  if (body.action === "key") {
    try { return reply(200, { key: (await keys()).public_key }); } catch (e) { return reply(500, { error: (e as Error).message }); }
  }
  if (body.action === "test") {
    const { data: subs } = await admin.rpc("push_user_subs", { p_user: me.id });
    const r = await send(subs ?? [], { title: "Phone alerts are on", body: "You'll get a message like this for the things your role needs to know.", url: "./", tag: "test" });
    return reply(200, { ok: true, ...r });
  }
  return reply(400, { error: "Unknown action." });
}

// deno-lint-ignore no-explicit-any
const D = (globalThis as any).Deno;
if (D?.serve && !D.env.get("PUSH_NO_SERVE")) D.serve((req: Request) => handle(req, (k) => D.env.get(k)));
