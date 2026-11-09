// team-admin — lets the owner manage staff logins from the staff app (Team screen):
// add a login, change name / email / phone / role, set a new password, delete a login.
//
// These need Supabase's master (service) key, which must never reach a browser. Supabase
// gives the key to this function by itself; it is never in the repo or the app.
// The function only acts for a signed-in, active owner, checked through the database.
//
// Deploy once: Supabase dashboard → Edge Functions → Deploy a new function → Via editor,
// name it  team-admin , paste this file, Deploy.

import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const MIN_PASSWORD = 8;
const UUID = /^[0-9a-f-]{36}$/i;
const ROLES = ["owner", "manager", "waiter", "kitchen"];
const roleOf = (r: string) => (ROLES.includes(r) ? r : "waiter");
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
  try {   // newer projects: a JSON map of secret keys
    const m = JSON.parse(env("SUPABASE_SECRET_KEYS") ?? "{}");
    return m.default ?? Object.values(m)[0] as string | undefined;
  } catch { return undefined; }
}

export async function handle(req: Request, env: (k: string) => string | undefined): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply(405, { error: "Use POST." });

  const url = env("SUPABASE_URL");
  const key = serviceKey(env);
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const apikey = req.headers.get("apikey") ?? env("SUPABASE_ANON_KEY") ?? "";
  if (!url || !key) return reply(500, { error: "The function is missing its Supabase settings." });
  if (!token) return reply(401, { error: "Sign in first." });
  if (!apikey) return reply(400, { error: "Missing the project key (apikey header)." });

  // The owner's own session: every database change below goes through the owner-only
  // functions in the database, so the database's own rules decide.
  const asOwner = createClient(url, apikey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: me, error: meErr } = await asOwner.rpc("staff_me");
  if (meErr || !me) return reply(401, { error: "Your sign-in has run out. Sign in again." });
  if (me.role !== "owner" || !me.active) return reply(403, { error: "Only the owner can do this." });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply(400, { error: "Bad request." }); }
  const s = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
  const pw = typeof body.password === "string" ? body.password : "";
  const fail = (e: { message?: string } | null, fallback = "Something went wrong.") =>
    reply(400, { error: e?.message ?? fallback });

  if (body.action === "add") {
    const name = s("name"), email = s("email").toLowerCase(), role = roleOf(s("role"));
    if (!name || !/^\S+@\S+\.\S+$/.test(email)) return reply(400, { error: "Enter a name and a valid email." });
    if (pw.length < MIN_PASSWORD) return reply(400, { error: `The password must be at least ${MIN_PASSWORD} characters.` });
    const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: name } });
    if (error || !data.user) return reply(400, { error: /already|exists|registered/i.test(error?.message ?? "") ? "That email already has a login." : error?.message ?? "Couldn't add the login." });
    // New logins start switched off as waiters; set them up as asked, switched on.
    const { error: e2 } = await asOwner.rpc("owner_edit_staff", { p_id: data.user.id, p_name: name, p_phone: s("phone"), p_role: role, p_active: true });
    if (e2) return reply(400, { error: `Login added, but setting it up failed: ${e2.message}` });
    await asOwner.rpc("owner_log", { p_action: "login_added", p_detail: `${name} (${role})` });
    return reply(200, { ok: true, id: data.user.id });
  }

  if (body.action === "update") {
    const id = s("id"), name = s("name"), email = s("email").toLowerCase(), role = roleOf(s("role"));
    if (!UUID.test(id)) return reply(400, { error: "Unknown login." });
    if (!name || !/^\S+@\S+\.\S+$/.test(email)) return reply(400, { error: "Enter a name and a valid email." });
    const { data: u, error: ue } = await admin.auth.admin.getUserById(id);
    if (ue || !u.user) return reply(404, { error: "Unknown login." });
    if ((u.user.email ?? "").toLowerCase() !== email) {
      const { error } = await admin.auth.admin.updateUserById(id, { email, email_confirm: true });
      if (error) return reply(400, { error: /already|exists|registered/i.test(error.message) ? "That email already has a login." : error.message });
    }
    const { error } = await asOwner.rpc("owner_edit_staff", { p_id: id, p_name: name, p_phone: s("phone"), p_role: role,
      p_active: typeof body.active === "boolean" ? body.active : null });
    if (error) return fail(error);
    return reply(200, { ok: true });
  }

  if (body.action === "password") {
    const id = s("id");
    if (!UUID.test(id)) return reply(400, { error: "Unknown login." });
    if (pw.length < MIN_PASSWORD) return reply(400, { error: `The password must be at least ${MIN_PASSWORD} characters.` });
    const { data: team, error: te } = await asOwner.rpc("owner_team");
    const who = (team?.staff ?? []).find((x: { id: string }) => x.id === id);
    if (te || !who) return reply(404, { error: "Unknown login." });
    const { error } = await admin.auth.admin.updateUserById(id, { password: pw });
    if (error) return fail(error);
    await asOwner.rpc("owner_log", { p_action: "login_password", p_detail: who.name });
    return reply(200, { ok: true });
  }

  if (body.action === "delete") {
    const id = s("id");
    if (!UUID.test(id)) return reply(400, { error: "Unknown login." });
    if (id === me.id) return reply(400, { error: "You can't delete your own login." });
    // Switches them off and logs it; refuses for your own login.
    const { error: pe } = await asOwner.rpc("owner_prepare_delete", { p_id: id });
    if (pe) return fail(pe);
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) return fail(error);
    return reply(200, { ok: true });
  }

  return reply(400, { error: "Unknown action." });
}

// Supabase entry point (skipped when imported by local tests).
// deno-lint-ignore no-explicit-any
const D = (globalThis as any).Deno;
if (D?.serve && !D.env.get("TEAM_ADMIN_NO_SERVE")) D.serve((req: Request) => handle(req, (k) => D.env.get(k)));
