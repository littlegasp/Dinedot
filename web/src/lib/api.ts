/* Talking to the database (Supabase) or, with no keys set, to the built-in demo.
   Same calls and session handling as the main app's api.js: plain fetch, no extra library.
   Only the public (publishable) key is ever used here. */

const URL_ = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const KEY = process.env.NEXT_PUBLIC_SUPABASE_KEY ?? "";
const SESSION = "dineos.session";

type Session = { access_token: string; refresh_token: string; expires_at: number; email?: string };
type DemoApi = {
  rpc: (fn: string, args: object) => Promise<unknown>;
  teamAdmin: (body: object) => Promise<unknown>;
  user: () => { email: string } | null; signIn: (email: string) => void; signOut: () => void;
  reset: () => void; TEAM: { id: string; name: string; email: string; role: string }[];
};
declare global { interface Window { Demo?: DemoApi } }

export const isDemo = () =>
  !URL_ || !KEY || (typeof location !== "undefined" && new URLSearchParams(location.search).has("demo"));

const read = <T,>(k: string): T | null => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : null; } catch { return null; } };
const write = (k: string, v: unknown) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch {} };

/* ---------- demo backend (shared demo.js, copied into public/legacy at build) ---------- */
let demoReady: Promise<DemoApi> | null = null;
function loadScript(src: string) {
  return new Promise<void>((ok, bad) => {
    const s = document.createElement("script"); s.src = src; s.onload = () => ok(); s.onerror = () => bad(new Error("Couldn't load the demo."));
    document.head.appendChild(s);
  });
}
export function demo(): Promise<DemoApi> {
  if (!demoReady) demoReady = (async () => {
    if (!window.Demo) { await loadScript("legacy/shim.js"); await loadScript("legacy/demo.js"); }
    return window.Demo!;
  })();
  return demoReady;
}

/* ---------- session ---------- */
let session: Session | null = null;
const listeners = new Set<() => void>();
export const onSignOut = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };

async function auth(path: string, body: object, method = "POST") {
  const h: Record<string, string> = { "Content-Type": "application/json", apikey: KEY };
  if (session && method === "PUT") h.Authorization = "Bearer " + session.access_token;
  let r: Response;
  try { r = await fetch(`${URL_}/auth/v1/${path}`, { method, headers: h, body: JSON.stringify(body) }); }
  catch { throw new Error("No internet. Check the connection and try again."); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error_description || j.msg || j.message || "Something went wrong.");
  return j;
}
function keep(j: { access_token: string; refresh_token: string; expires_at?: number; expires_in?: number; user?: { email?: string } }) {
  session = { access_token: j.access_token, refresh_token: j.refresh_token,
    expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (Number(j.expires_in) || 3600), email: j.user?.email ?? session?.email };
  write(SESSION, session);
}
let refreshing: Promise<void> | null = null;
function refresh() {
  if (!session) return Promise.reject(new Error("signed out"));
  refreshing ??= auth("token?grant_type=refresh_token", { refresh_token: session.refresh_token }).then(keep).finally(() => { refreshing = null; });
  return refreshing;
}
function signedOut() { session = null; write(SESSION, null); listeners.forEach(f => f()); }
async function fresh() {
  if (session && session.expires_at * 1000 - Date.now() < 60_000) {
    try { await refresh(); } catch (e) { if (!(e instanceof TypeError)) signedOut(); }
  }
}

export class ApiError extends Error { status?: number; offline?: boolean }

/** Calls a database function. Errors carry the database's own plain-language message. */
export async function rpc<T>(fn: string, args: object = {}, retried = false): Promise<T> {
  if (isDemo()) return (await demo()).rpc(fn, args) as Promise<T>;
  session ??= read<Session>(SESSION);
  await fresh();
  let r: Response;
  try {
    r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: "POST",
      headers: { "Content-Type": "application/json", apikey: KEY, Authorization: "Bearer " + (session?.access_token ?? KEY) },
      body: JSON.stringify(args) });
  } catch { const e = new ApiError("No internet. Check the connection."); e.offline = true; throw e; }
  if (r.status === 401 && !retried && session) {
    try { await refresh(); return rpc<T>(fn, args, true); } catch { signedOut(); throw new ApiError("Your sign-in has run out. Sign in again."); }
  }
  const j = await r.json().catch(() => null);
  if (!r.ok) { const e = new ApiError(j?.message || `Error ${r.status}`); e.status = r.status; throw e; }
  return j as T;
}

export const Auth = {
  signedIn(): boolean {
    if (isDemo()) return !!read<string>("dd.demo.user");
    session ??= read<Session>(SESSION); return !!session;
  },
  email(): string { return isDemo() ? "" : (session ??= read<Session>(SESSION))?.email ?? ""; },
  async signIn(email: string, password: string) {
    if (isDemo()) { (await demo()).signIn(email); return; }
    keep(await auth("token?grant_type=password", { email: email.trim(), password }));
  },
  async signOut() {
    if (isDemo()) { (await demo()).signOut(); return; }
    if (session) fetch(`${URL_}/auth/v1/logout`, { method: "POST", headers: { apikey: KEY, Authorization: "Bearer " + session.access_token } }).catch(() => {});
    session = null; write(SESSION, null);
  },
  async forgot(email: string) {
    if (isDemo()) return;
    await auth("recover", { email: email.trim(), redirect_to: location.href.split("#")[0] });
  },
  /** A "set a new password" email link comes back as #access_token=…&type=recovery. */
  takeRecovery(): boolean {
    if (isDemo() || typeof location === "undefined") return false;
    const h = new URLSearchParams(location.hash.replace(/^#/, ""));
    if (h.get("type") !== "recovery" || !h.get("access_token")) return false;
    keep({ access_token: h.get("access_token")!, refresh_token: h.get("refresh_token") ?? "", expires_in: Number(h.get("expires_in")) || 3600 });
    history.replaceState(null, "", location.pathname + location.search);
    return true;
  },
  async setPassword(password: string) {
    if (isDemo()) return;
    session ??= read<Session>(SESSION); await fresh();
    await auth("user", { password }, "PUT");
  },
};

/** Team logins (add, change, password, delete) go through the team-admin edge function,
    which holds the service key on Supabase's side; the browser never sees it. */
export async function teamAdmin(body: { action: "add" | "update" | "password" | "delete"; id?: string; name?: string; email?: string;
  phone?: string; role?: string; active?: boolean; password?: string }) {
  if (isDemo()) return (await demo()).teamAdmin(body);
  session ??= read<Session>(SESSION); await fresh();
  let r: Response;
  try {
    r = await fetch(`${URL_}/functions/v1/team-admin`, { method: "POST",
      headers: { "Content-Type": "application/json", apikey: KEY, Authorization: "Bearer " + session?.access_token }, body: JSON.stringify(body) });
  } catch { throw new ApiError("No internet. Check the connection."); }
  if (r.status === 404) throw new ApiError("Adding logins isn't switched on yet: the team-admin function needs to be set up in Supabase.");
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(j.error || j.message || "Something went wrong.");
  return j;
}

/* ---------- photos (Supabase Storage, bucket menu-photos) ---------- */
/** Shrinks a photo in the browser to a JPEG no wider/taller than max px. */
function shrink(file: File, max: number): Promise<Blob> {
  return new Promise((ok, bad) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      c.toBlob(b => (b ? ok(b) : bad(new Error("Couldn't read that photo."))), "image/jpeg", 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); bad(new Error("That file isn't a photo we can read.")); };
    img.src = url;
  });
}
/** Uploads into the restaurant's own folder (<restaurant id>/…), as the storage rules require. */
export async function uploadPhoto(file: File, restaurantId: string, max = 1000): Promise<string> {
  const blob = await shrink(file, isDemo() ? 640 : max);
  if (isDemo()) return new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.readAsDataURL(blob); });
  session ??= read<Session>(SESSION); await fresh();
  const path = `${restaurantId}/dish-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}.jpg`;
  const r = await fetch(`${URL_}/storage/v1/object/menu-photos/${path}`, { method: "POST",
    headers: { apikey: KEY, Authorization: "Bearer " + session?.access_token, "Content-Type": "image/jpeg" }, body: blob });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new ApiError(j.message || j.error || "Photo upload failed."); }
  return `${URL_}/storage/v1/object/public/menu-photos/${path}`;
}
export async function removePhoto(url: string | null | undefined) {
  if (isDemo() || !url || !url.includes("/menu-photos/")) return;
  session ??= read<Session>(SESSION);
  await fetch(`${URL_}/storage/v1/object/menu-photos`, { method: "DELETE",
    headers: { apikey: KEY, Authorization: "Bearer " + session?.access_token, "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: [url.split("/menu-photos/")[1]] }) }).catch(() => {});
}

/** One id per order attempt: a retry after a dropped connection is saved once (0003). */
export const newRequestId = (): string =>
  typeof crypto.randomUUID === "function" ? crypto.randomUUID()   // needs https; the fallback covers a phone on the local network
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c => (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16));
