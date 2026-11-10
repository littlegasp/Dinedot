/* =========================================================
   Dinedot — talking to the database (Supabase), or to the in-browser demo.
   Plain fetch, no libraries. Loaded after config.js on every page.
   ========================================================= */
const store = {
  get(k){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; }catch(e){ return null; } },
  set(k, v){ try{ v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
};

/* One id per order attempt: a retry after a dropped connection sends the same id, so the order is saved once. */
const newRequestId = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));

/* Same money rules as visit_bill() in the database. Used by the demo and for previews. */
const Money = {
  bill(lines, s, tipPct, split){
    const sub = lines.reduce((a, l) => a + Number(l.amount || 0), 0);
    const svc = Math.round(sub * (s.service_pct || 0)) / 100;
    const tax = Math.round((sub + svc) * (s.gst_pct || 0)) / 100;
    const tot = Math.round(sub + svc + tax);
    const tip = Math.round(sub * (tipPct || 0) / 100);
    split = Math.max(1, split || 1);
    return { lines, subtotal: sub, service: svc, gst: tax, total: tot, tip, grand: tot + tip, split,
             each: Math.ceil((tot + tip) / split), tip_pct: tipPct || 0, service_pct: s.service_pct || 0, gst_pct: s.gst_pct || 0 };
  },
  fmt(n, cur){ n = Number(n || 0); const r = Math.round(n * 100) / 100;
    return (cur || "₹") + r.toLocaleString("en-IN", { minimumFractionDigits: r % 1 ? 2 : 0, maximumFractionDigits: 2 }); }
};

const API = (() => {
  const URL_ = (SITE.supabaseUrl || "").replace(/\/$/, ""), KEY = SITE.supabaseKey || "";
  const DEMO = !URL_ || !KEY || new URLSearchParams(location.search).has("demo");
  let session = DEMO ? null : store.get("dd.session");
  const listeners = new Set();

  async function auth(path, body, method){
    const h = { "Content-Type": "application/json", apikey: KEY };
    if (session && method === "PUT") h.Authorization = "Bearer " + session.access_token;
    let r; try { r = await fetch(URL_ + "/auth/v1/" + path, { method: method || "POST", headers: h, body: JSON.stringify(body) }); }
    catch(e){ throw new Error("No internet. Check the connection and try again."); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error_description || j.msg || j.message || "Something went wrong");
    return j;
  }
  function keep(j){
    session = { access_token: j.access_token, refresh_token: j.refresh_token,
      expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (+j.expires_in || 3600), email: (j.user || {}).email || (session || {}).email };
    store.set("dd.session", session);
  }
  let refreshing = null;
  function refresh(){ if (!session) return Promise.reject(new Error("signed out"));
    refreshing = refreshing || auth("token?grant_type=refresh_token", { refresh_token: session.refresh_token }).then(keep).finally(() => refreshing = null);
    return refreshing; }
  async function fresh(){ if (session && session.expires_at * 1000 - Date.now() < 60e3) { try { await refresh(); } catch(e){ if (!(e instanceof TypeError)) signedOut(); } } }
  function signedOut(){ session = null; store.set("dd.session", null); listeners.forEach(f => f("signedout")); }

  async function rpc(fn, args, retried){
    if (DEMO) return Demo.rpc(fn, args || {});
    await fresh();
    let r;
    try { r = await fetch(URL_ + "/rest/v1/rpc/" + fn, { method: "POST",
      headers: { "Content-Type": "application/json", apikey: KEY, Authorization: "Bearer " + (session ? session.access_token : KEY) },
      body: JSON.stringify(args || {}) }); }
    catch(e){ const x = new Error("No internet. Check the connection."); x.offline = true; throw x; }
    if (r.status === 401 && !retried && session) { try { await refresh(); return rpc(fn, args, true); } catch(e){ signedOut(); throw new Error("signed out"); } }
    const j = await r.json().catch(() => null);
    if (!r.ok) { const e = new Error((j && j.message) || ("Error " + r.status)); e.status = r.status; throw e; }
    return j;
  }

  async function teamAdmin(body){
    if (DEMO) return Demo.teamAdmin(body);
    await fresh(); let r;
    try { r = await fetch(URL_ + "/functions/v1/team-admin", { method: "POST",
      headers: { "Content-Type": "application/json", apikey: KEY, Authorization: "Bearer " + session.access_token }, body: JSON.stringify(body) }); }
    catch(e){ throw new Error("Couldn't reach the login manager. Check your internet."); }
    if (r.status === 404) throw new Error("The login manager isn't set up yet. See README → Supabase setup → team-admin.");
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || j.message || "Couldn't save the login.");
    return j;
  }

  /* Dish photos (public bucket menu-photos). Shrinks to 1000 px JPEG in the browser first. */
  function shrink(file, max){
    return new Promise((ok, bad) => {
      const img = new Image(), u = URL.createObjectURL(file);
      img.onload = () => { const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
        c.toBlob(b => b ? ok(b) : bad(new Error("Couldn't read that photo.")), "image/jpeg", .82); };
      img.onerror = () => bad(new Error("That file isn't a photo we can use."));
      img.src = u;
    });
  }
  async function uploadPhoto(file, max){
    const blob = await shrink(file, DEMO ? 640 : (max || 1000));
    if (DEMO) return await new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(blob); });
    await fresh();
    const path = "dish-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7) + ".jpg";
    const r = await fetch(URL_ + "/storage/v1/object/menu-photos/" + path, { method: "POST",
      headers: { apikey: KEY, Authorization: "Bearer " + session.access_token, "Content-Type": "image/jpeg" }, body: blob });
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.message || j.error || "Photo upload failed."); }
    return URL_ + "/storage/v1/object/public/menu-photos/" + path;
  }
  async function removePhoto(url){
    if (DEMO || !url || url.indexOf("/menu-photos/") < 0) return;
    const path = url.split("/menu-photos/")[1];
    await fetch(URL_ + "/storage/v1/object/menu-photos", { method: "DELETE",
      headers: { apikey: KEY, Authorization: "Bearer " + session.access_token, "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: [path] }) }).catch(() => {});
  }

  return {
    DEMO,
    rpc, teamAdmin, uploadPhoto, removePhoto,
    onAuth(f){ listeners.add(f); },
    signedIn(){ return DEMO ? !!Demo.user() : !!session; },
    async signIn(email, password){ if (DEMO) return Demo.signIn(email); keep(await auth("token?grant_type=password", { email, password })); },
    async signOut(){ if (DEMO) { Demo.signOut(); return; }
      if (session) fetch(URL_ + "/auth/v1/logout", { method: "POST", headers: { apikey: KEY, Authorization: "Bearer " + session.access_token } }).catch(() => {});
      session = null; store.set("dd.session", null); },
    async forgot(email){ if (DEMO) return; await auth("recover", { email, redirect_to: location.href.split("#")[0] }); },
    async setPassword(password){ if (DEMO) return; await fresh(); await auth("user", { password }, "PUT"); },
    /* Password-reset links come back as #access_token=…&type=recovery */
    takeRecovery(){
      if (DEMO) return false;
      const h = new URLSearchParams(location.hash.replace(/^#/, ""));
      if (h.get("access_token") && h.get("type") === "recovery") {
        keep({ access_token: h.get("access_token"), refresh_token: h.get("refresh_token"), expires_in: h.get("expires_in") });
        history.replaceState(null, "", location.pathname + location.search); return true;
      }
      return false;
    },
    email(){ return DEMO ? (Demo.user() || {}).email : (session || {}).email; }
  };
})();
