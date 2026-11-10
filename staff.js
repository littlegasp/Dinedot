/* =========================================================
   Dinedot — staff app (staff.html)
   Screens (hash routes): #dash · #floor · #kitchen · #bills · #menu · #tables · #settings/<tab> · #help
   Roles: owner (all) · manager (all but Settings) · waiter (floor, kitchen, bills) · kitchen (kitchen, sold-out)
   Live data comes from staff_live every 4 s. Any visible change must update staff-guide.js in the same commit.
   ========================================================= */
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ic = p => `<svg class="i" viewBox="0 0 24 24">${p}</svg>`;
const I = {
  dash: ic('<rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/>'),
  floor: ic('<circle cx="7" cy="7" r="3"/><circle cx="17" cy="7" r="3"/><circle cx="7" cy="17" r="3"/><circle cx="17" cy="17" r="3"/>'),
  kitchen: ic('<path d="M6 13.9A5 5 0 0 1 7.5 4.1 6 6 0 0 1 16.5 4.1 5 5 0 0 1 18 13.9V20H6z"/><path d="M6 17h12"/>'),
  bills: ic('<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>'),
  menu: ic('<path d="M4 6h16M4 12h16M4 18h10"/>'),
  tables: ic('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/>'),
  settings: ic('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
  help: ic('<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>'),
  bell: ic('<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>'),
  sun: ic('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: ic('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
  out: ic('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'),
  x: ic('<path d="M6 6l12 12M18 6L6 18"/>'),
  plus: ic('<path d="M12 5v14M5 12h14"/>'),
  print: ic('<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>'),
  sound: ic('<path d="M11 5L6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>'),
  mute: ic('<path d="M11 5L6 9H2v6h4l5 4zM23 9l-6 6M17 9l6 6"/>'),
  full: ic('<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>'),
  key: ic('<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3L21 2M16 7l3 3M18 5l2 2"/>')
};

/* ---------------- state ---------------- */
let ME = null, LIVE = null, MENU = null, SET = null, TOKENS = null, REPORT = {}, BILLS = null, TEAM = null, ACT = null;
let route = "", sub = "", drawerFn = null, skew = 0, firstLive = true, kdsTab = "new", range = "7", menuQ = "", confirmKey = "", confirmT = 0;
let billFrom = today(), billTo = today(), soundOn = store.get("dd.sound") !== false, audio = null, wake = null;
const seenOrders = new Set(), seenCalls = new Set();
const NAV = {
  dash: { label: "Dashboard", icon: I.dash, roles: ["owner", "manager"] },
  floor: { label: "Floor", icon: I.floor, roles: ["owner", "manager", "waiter"] },
  kitchen: { label: "Kitchen", icon: I.kitchen, roles: ["owner", "manager", "waiter", "kitchen"] },
  bills: { label: "Bills", icon: I.bills, roles: ["owner", "manager", "waiter"] },
  menu: { label: "Menu", icon: I.menu, roles: ["owner", "manager", "kitchen"] },
  tables: { label: "Tables & QR", icon: I.tables, roles: ["owner", "manager"] },
  settings: { label: "Settings", icon: I.settings, roles: ["owner"] },
  help: { label: "Help", icon: I.help, roles: ["owner", "manager", "waiter", "kitchen"] }
};
const HOME = { owner: "dash", manager: "floor", waiter: "floor", kitchen: "kitchen" };
const LIVE_SCREENS = ["dash", "floor", "kitchen"];
const role = () => ME ? ME.role : "";
const can = { floor: () => ["owner", "manager", "waiter"].includes(role()), manage: () => ["owner", "manager"].includes(role()), own: () => role() === "owner" };

function today(){ const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function dayOffset(n){ const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
const cur = () => (LIVE && LIVE.settings.currency) || (SET && SET.currency) || "₹";
const money = n => Money.fmt(n, cur());
const nowMs = () => Date.now() + skew;
const mins = iso => Math.max(0, Math.floor((nowMs() - new Date(iso).getTime()) / 60e3));
const ago = iso => { const m = mins(iso); return m < 1 ? "just now" : m < 60 ? m + " min" : Math.floor(m / 60) + " h " + (m % 60) + " min"; };
const clock = iso => iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
const dateTxt = iso => new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" });
const dietMark = d => `<i class="diet ${esc(d)}"></i>`;
const tableOf = id => LIVE && LIVE.tables.find(t => t.id === id);
const visitOf = tid => LIVE && LIVE.visits.find(v => v.table_id === tid);
const callsOf = tid => LIVE ? LIVE.calls.filter(c => c.table_id === tid) : [];
const callName = { waiter: "Waiter", water: "Water", bill: "Bill", help: "Help" };
const guestBase = () => SITE.guestUrl || location.href.split("#")[0].replace(/staff\.html.*$/, "t.html").replace(/\/$/, "/t.html");
const guestLink = token => guestBase() + "?k=" + encodeURIComponent(token);

function toast(msg, bad){ const t = $("toast"); t.textContent = msg; t.className = "toast on" + (bad ? " bad" : ""); clearTimeout(t._h); t._h = setTimeout(() => t.className = "toast", 3400); }
const fail = e => { if (e && e.message !== "signed out") toast(e.message, true); };
/* Tap-twice confirm for things that can't be undone */
function confirmTap(key, btn, text){
  if (confirmKey === key && Date.now() - confirmT < 4000) { confirmKey = ""; return true; }
  confirmKey = key; confirmT = Date.now(); if (btn) { btn._t = btn.innerHTML; btn.innerHTML = text || "Tap again to confirm"; setTimeout(() => { if (btn._t) btn.innerHTML = btn._t; }, 4000); }
  return false;
}

/* ---------------- sound ---------------- */
function beep(kind){
  if (!soundOn) return;
  try { audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const notes = kind === "call" ? [880, 660, 880] : [660, 880];
    notes.forEach((f, i) => { const o = audio.createOscillator(), g = audio.createGain(); o.frequency.value = f; o.type = "sine";
      g.gain.setValueAtTime(.0001, audio.currentTime + i * .16); g.gain.exponentialRampToValueAtTime(.25, audio.currentTime + i * .16 + .02);
      g.gain.exponentialRampToValueAtTime(.0001, audio.currentTime + i * .16 + .15); o.connect(g).connect(audio.destination); o.start(audio.currentTime + i * .16); o.stop(audio.currentTime + i * .16 + .16); });
  } catch(e){}
}

/* ---------------- start ---------------- */
async function start(){
  const recovering = API.takeRecovery();
  if (!API.signedIn()) return showLogin();
  try { ME = await API.rpc("staff_me"); } catch(e){ if (e.offline) { ME = store.get("dd.me"); } else return showLogin(e.message); }
  if (!ME) return showLogin();
  if (!ME.active) return showLogin("Your login isn't switched on yet. Ask the owner to switch it on in Settings → Team.");
  store.set("dd.me", ME);
  if (recovering) setTimeout(() => openPassword(true), 400);
  addEventListener("hashchange", go);
  go(); tick(); setInterval(tick, 4000); setInterval(() => { if (route === "dash") loadReport(true); }, 60e3);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });
}
API.onAuth(ev => { if (ev === "signedout") showLogin("Please sign in again."); });

function showLogin(msg){
  ME = null; $("root").innerHTML = `<div class="login"><div class="login-card">
    <div class="logo"><img src="favicon.svg" alt="">${esc(SITE.product || "Dinedot")}</div>
    <h1>Staff sign-in</h1><p class="sub">${API.DEMO ? "This is the demo. Pick who you want to be." : "Use the email and password the owner gave you."}</p>
    ${msg ? `<p class="sub" style="color:var(--red);margin-top:10px">${esc(msg)}</p>` : ""}
    ${API.DEMO ? `<div class="demo-roles">${Demo.TEAM.map(t => `<button data-demo="${t.email}"><b>${esc(t.name)}</b><small>${t.role === "owner" ? "Owner · sees everything" : t.role === "manager" ? "Manager · menu, tables, numbers" : t.role === "waiter" ? "Waiter · floor, bills" : "Kitchen · tickets, sold out"}</small></button>`).join("")}</div>
      <p class="sub" style="font-size:13px;margin-top:16px">Open the <a href="t.html?k=demo-T3" target="_blank">guest page for T3</a> next to it and place an order to watch it arrive.</p>`
    : `<form id="loginForm"><label class="field"><span>Email</span><input class="in" name="email" type="email" autocomplete="username" required></label>
      <label class="field"><span>Password</span><input class="in" name="password" type="password" autocomplete="current-password" required></label>
      <button class="btn lg block" style="margin-top:18px">Sign in</button></form>
      <button class="btn ghost block" style="margin-top:8px" data-forgot>Forgot password?</button>`}</div></div>`;
  const f = $("loginForm");
  if (f) f.addEventListener("submit", async e => { e.preventDefault(); const b = f.querySelector("button"); b.disabled = true; b.textContent = "Signing in…";
    try { await API.signIn(f.email.value.trim(), f.password.value); location.hash = ""; start(); } catch(err){ toast(err.message, true); b.disabled = false; b.textContent = "Sign in"; } });
}

/* ---------------- live polling ---------------- */
async function tick(){
  if (!ME || document.hidden) return;
  try {
    const L = await API.rpc("staff_live");
    skew = new Date(L.now).getTime() - Date.now();
    // New orders and calls: sound + toast (not on the first load)
    const fresh = [];
    L.visits.forEach(v => v.orders.forEach(o => { if (!seenOrders.has(o.id)) { seenOrders.add(o.id); if (!firstLive && o.status === "new") fresh.push({ t: v.table_id, o }); } }));
    const freshCalls = L.calls.filter(c => !seenCalls.has(c.id)); freshCalls.forEach(c => seenCalls.add(c.id));
    LIVE = L;
    if (!firstLive) {
      if (fresh.length) { beep("order"); const t = tableOf(fresh[0].t); toast(`New order #${fresh[0].o.no} · ${t ? t.code : ""}`); }
      if (freshCalls.length && role() !== "kitchen") { beep("call"); const c = freshCalls[0], t = tableOf(c.table_id); toast(`${t ? t.code : "A table"} asks for ${callName[c.kind].toLowerCase()}`); }
    }
    firstLive = false;
    navCounts();
    if (LIVE_SCREENS.includes(route)) paint();
    if (drawerFn && drawerFn.live && !typing()) drawerFn();
  } catch(e){ if (e.offline) { const b = document.querySelector(".top .sub"); if (b) b.textContent = "Offline — retrying…"; } else if (e.message !== "signed out") console.warn(e); }
}
const typing = () => { const a = document.activeElement; return a && $("drawer").contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName); };

/* ---------------- shell + routing ---------------- */
function go(){
  const h = location.hash.replace(/^#/, "").split("/");
  let r = h[0] || HOME[role()]; sub = h[1] || "";
  if (!NAV[r] || !NAV[r].roles.includes(role())) r = HOME[role()];
  const changed = r !== route; route = r;
  if (route !== "kitchen" && wake) { wake.release().catch(() => {}); wake = null; }
  shell(); paint(true);
  if (changed) scrollTo(0, 0);
  load(route);
}
function shell(){
  const items = Object.keys(NAV).filter(k => NAV[k].roles.includes(role()));
  const accepting = LIVE ? LIVE.settings.accepting : true;
  const tabItems = items.slice(0, 4).concat(items.length > 4 ? ["help"] : []).filter((v, i, a) => a.indexOf(v) === i).slice(0, 5);
  $("root").innerHTML = `${API.DEMO ? `<div class="demo-band">Demo · saved in this browser only · <a href="t.html?k=demo-T3" target="_blank">open guest page ↗</a> · <button data-resetdemo>reset demo</button></div>` : ""}
  <div class="mobile-top"><div class="logo"><img src="favicon.svg" alt=""><span id="placeNameM">${esc(LIVE ? LIVE.settings.name : SITE.product)}</span></div>
    <button class="iconbtn" data-sound title="Sound">${soundOn ? I.sound : I.mute}</button><button class="iconbtn" data-theme title="Light / dark">${document.documentElement.dataset.theme === "dark" ? I.sun : I.moon}</button>
    <button class="iconbtn" data-me title="Account">${esc((ME.name || "?")[0])}</button></div>
  <div class="shell"><aside class="sidebar"><div class="logo"><img src="favicon.svg" alt=""><span id="placeName">${esc(LIVE ? LIVE.settings.name : SITE.product)}</span></div>
    <nav class="nav">${items.map(k => `<a href="#${k}" class="${route === k ? "on" : ""}" data-nav="${k}">${NAV[k].icon}${NAV[k].label}<span class="count" data-count="${k}" hidden></span></a>`).join("")}</nav>
    <div class="side-foot">
      ${can.manage() ? `<div class="switch-row"><span>Taking orders<small id="accTxt">${accepting ? "Guests can order" : "QR ordering is paused"}</small></span><button class="tgl ${accepting ? "on" : ""}" id="accTgl" data-accept aria-label="Taking orders"></button></div>` : ""}
      <div class="switch-row"><span>Sound alerts<small>New orders and calls</small></span><button class="tgl ${soundOn ? "on" : ""}" data-sound aria-label="Sound alerts"></button></div>
      <div class="me"><span class="avatar">${esc((ME.name || "?")[0])}</span><div><b>${esc(ME.name)}</b><small>${esc(ME.role)}</small></div>
        <button class="iconbtn" data-theme title="Light / dark">${document.documentElement.dataset.theme === "dark" ? I.sun : I.moon}</button><button class="iconbtn" data-me title="Account">${I.key}</button></div>
    </div></aside>
    <main class="main" id="main"></main></div>
  <nav class="tabbar">${tabItems.map(k => `<a href="#${k}" class="${route === k ? "on" : ""}">${NAV[k].icon}${NAV[k].label.split(" ")[0]}<span class="count" data-count="${k}" hidden></span></a>`).join("")}</nav>`;
  navCounts();
}
function navCounts(){
  if (!LIVE) return;
  const kitchen = LIVE.visits.reduce((a, v) => a + v.orders.filter(o => o.status === "new" || o.status === "cooking").length, 0);
  const calls = LIVE.calls.filter(c => !c.seen_at).length, ready = LIVE.visits.reduce((a, v) => a + v.orders.filter(o => o.status === "ready").length, 0);
  const set = (k, n, red) => document.querySelectorAll(`[data-count="${k}"]`).forEach(el => { el.hidden = !n; el.textContent = n; el.classList.toggle("red", !!red); });
  set("kitchen", kitchen); set("floor", calls + ready, calls > 0);
  ["placeName", "placeNameM"].forEach(id => { const pn = $(id); if (pn) pn.textContent = LIVE.settings.name; });
  const t = $("accTgl"); if (t) { t.classList.toggle("on", LIVE.settings.accepting); $("accTxt").textContent = LIVE.settings.accepting ? "Guests can order" : "QR ordering is paused"; }
}
async function load(r){
  try {
    if (r === "menu" || r === "tables") { MENU = await API.rpc("staff_menu"); if (r === "tables" && can.manage()) TOKENS = await API.rpc("owner_table_tokens"); }
    if (r === "dash") await loadReport();
    if (r === "bills") BILLS = await API.rpc("staff_bills", { p_from: billFrom, p_to: billTo });
    if (r === "settings") { SET = await API.rpc("owner_settings"); if (sub === "team") TEAM = await API.rpc("owner_team"); if (sub === "activity") ACT = await API.rpc("owner_activity", { p_limit: 200 }); }
    if (route === r) paint();
  } catch(e){ fail(e); }
}
async function loadReport(again){
  const from = range === "1" ? today() : range === "month" ? today().slice(0, 8) + "01" : dayOffset(+range - 1);
  if (!REPORT[range] || again) REPORT[range] = await API.rpc("owner_report", { p_from: from, p_to: today() });
  if (again && route === "dash") paint();
}
function paint(first){
  const m = $("main"); if (!m) return;
  const f = SCREENS[route]; if (!f) return;
  const y = scrollY; m.innerHTML = f(first); if (!first) scrollTo(0, y);
}
const pageTop = (title, subText, actions) => `<div class="top"><div style="flex:1;min-width:0"><h1>${title}</h1>${subText ? `<p class="sub">${subText}</p>` : ""}</div><div class="top-actions">${actions || ""}</div></div>`;
const loading = () => `<div class="empty">Loading…</div>`;
function callsStrip(){
  if (!LIVE || !LIVE.calls.length || role() === "kitchen") return "";
  return `<div class="calls">${LIVE.calls.map(c => { const t = tableOf(c.table_id);
    return `<div class="callchip ${c.seen_at ? "seen" : ""}"><span>${esc(t ? t.code : "?")} · ${callName[c.kind]}<br><small>${ago(c.at)}${c.seen_by ? " · " + esc(c.seen_by) + " going" : ""}</small></span>
      ${c.seen_at ? "" : `<button class="btn sm ghost" data-call="${c.id}:seen">On it</button>`}<button class="btn sm ok" data-call="${c.id}:done">Done</button></div>`; }).join("")}</div>`;
}

/* ---------------- table status ---------------- */
function tableState(t){
  const v = visitOf(t.id);
  if (!v) return { k: t.active ? "free" : "off", label: t.active ? "Free" : "Switched off" };
  const os = v.orders.filter(o => o.status !== "cancelled");
  if (v.status === "bill") return { k: "bill", label: "Bill asked", v };
  if (os.some(o => o.status === "ready")) return { k: "ready", label: "Ready to serve", v };
  if (os.some(o => o.status === "new")) return { k: "new", label: "New order", v };
  if (os.some(o => o.status === "cooking")) return { k: "cooking", label: "Cooking", v };
  return { k: "eating", label: os.length ? "Eating" : "Seated", v };
}

/* ============================ SCREENS ============================ */
const SCREENS = {
  /* ---------- Dashboard ---------- */
  dash(){
    if (!LIVE) return pageTop("Dashboard") + loading();
    const T = LIVE.today, active = LIVE.visits.length, tables = LIVE.tables.filter(t => t.active).length;
    const live = LIVE.visits.reduce((a, v) => a + v.orders.filter(o => ["new", "cooking", "ready"].includes(o.status)).length, 0);
    const R = REPORT[range];
    const hours = []; for (let h = 11; h <= 23; h++) hours.push(h);
    const flowMax = Math.max(1, ...hours.map(h => T.flow[h] || 0)), nowH = new Date().getHours();
    return pageTop("Dashboard", "Today at " + esc(LIVE.settings.name)) + callsStrip() + `
      <div class="kpis">
        <div class="kpi"><div class="k">Live orders</div><div class="v">${live}</div><div class="s">${LIVE.visits.reduce((a, v) => a + v.orders.filter(o => o.status === "ready").length, 0)} ready to serve</div></div>
        <div class="kpi"><div class="k">Tables active</div><div class="v">${active}/${tables}</div><div class="s">${LIVE.visits.filter(v => v.status === "bill").length} waiting for the bill</div></div>
        <div class="kpi"><div class="k">Today's sales</div><div class="v">${money(T.sales)}</div><div class="s">${T.bills} bill${T.bills === 1 ? "" : "s"} paid${T.bills ? " · avg " + money(T.sales / T.bills) : ""}</div></div>
        <div class="kpi"><div class="k">Guests today</div><div class="v">${T.guests}</div><div class="s">${T.orders} orders${T.rating ? " · ★ " + T.rating : ""}</div></div>
      </div>
      <div class="card" style="margin-bottom:14px"><h2>Guest flow today <small>tables opened per hour</small></h2>
        <div class="bars">${hours.map(h => `<div class="b ${h === nowH ? "hi" : ""}"><em>${T.flow[h] || ""}</em><i style="height:${(T.flow[h] || 0) / flowMax * 100}%"></i><span>${h > 12 ? h - 12 : h}${h >= 12 ? "p" : "a"}</span></div>`).join("")}</div></div>
      <div class="top" style="margin:22px 0 12px"><h2 style="flex:1">Numbers</h2><div class="seg">${[["1", "Today"], ["7", "7 days"], ["30", "30 days"], ["month", "This month"]].map(([k, n]) => `<button class="${range === k ? "on" : ""}" data-range="${k}">${n}</button>`).join("")}</div></div>
      ${R ? report(R) : loading()}`;
  },

  /* ---------- Floor ---------- */
  floor(){
    if (!LIVE) return pageTop("Floor") + loading();
    const areas = [...new Set(LIVE.tables.map(t => t.area))];
    return pageTop("Floor", `${LIVE.visits.length} of ${LIVE.tables.filter(t => t.active).length} tables in use`) + callsStrip() + `
      <div class="legend"><span><i style="background:var(--ac)"></i>New / cooking</span><span><i style="background:var(--ok)"></i>Ready to serve</span><span><i style="background:var(--blue)"></i>Bill asked</span><span><i style="background:var(--red)"></i>Calling</span></div>
      ${areas.map(a => `<div class="area"><h3>${esc(a)}</h3><div class="tiles">${LIVE.tables.filter(t => t.area === a).map(t => {
        const s = tableState(t), cs = callsOf(t.id), v = s.v;
        return `<button class="tile ${s.k}" data-table="${t.id}">${cs.length ? `<span class="ring"></span><span class="callflag">${cs.map(c => callName[c.kind]).join(" · ")}</span>` : ""}
          <span class="code">${esc(t.code)}</span><span class="seats">${t.seats}</span>
          <span class="state">${s.label}</span><span class="meta">${v ? (v.guests ? v.guests + " guests · " : "") + ago(v.opened_at) + " · " + money(v.bill.grand) : esc(t.name || "")}</span></button>`; }).join("")}</div></div>`).join("")}`;
  },

  /* ---------- Kitchen ---------- */
  kitchen(){
    if (!LIVE) return pageTop("Kitchen") + loading();
    keepAwake();
    const all = []; LIVE.visits.forEach(v => v.orders.forEach(o => all.push(Object.assign({ table: tableOf(v.table_id) }, o))));
    const col = (st, title) => { const list = all.filter(o => o.status === st).sort((a, b) => a.created_at < b.created_at ? -1 : 1);
      return `<div class="col ${kdsTab === st ? "show" : ""}"><div class="col-head"><span>${title}</span><b>${list.length}</b></div>${list.length ? list.map(ticket).join("") : `<div class="empty">${st === "new" ? "No new orders" : st === "cooking" ? "Nothing on the stove" : "Nothing waiting"}</div>`}</div>`; };
    const n = st => all.filter(o => o.status === st).length;
    return pageTop("Kitchen", "Tap a ticket's button to move it along", `<button class="btn ghost sm" data-soldout>Sold out…</button><button class="btn ghost sm" data-fullscreen>${I.full} Full screen</button>`) +
      `<div class="seg kds-tabs">${[["new", "New"], ["cooking", "Cooking"], ["ready", "Ready"]].map(([k, t]) => `<button class="${kdsTab === k ? "on" : ""}" data-kds="${k}">${t} ${n(k)}</button>`).join("")}</div>
      <div class="kds tabbed">${col("new", "New")}${col("cooking", "Cooking")}${col("ready", "Ready")}</div>`;
  },

  /* ---------- Bills ---------- */
  bills(){
    const list = BILLS;
    const sum = list ? list.filter(b => b.status === "paid").reduce((a, b) => a + b.total, 0) : 0;
    return pageTop("Bills", list ? `${list.filter(b => b.status === "paid").length} paid · ${money(sum)}` : "", can.own() ? `<button class="btn ghost sm" data-csv>Download CSV</button>` : "") + `
      <div class="toolbar"><label class="field" style="margin:0"><span>From</span><input class="in" type="date" id="bFrom" value="${billFrom}" max="${today()}"></label>
        <label class="field" style="margin:0"><span>To</span><input class="in" type="date" id="bTo" value="${billTo}" max="${today()}"></label>
        <button class="btn ghost" style="align-self:flex-end" data-billgo>Show</button></div>
      ${!list ? loading() : !list.length ? `<div class="card empty">No bills in these dates.</div>` : `<div class="list">${list.map(b => `<div class="li" data-bill="${b.id}">
        <div class="grow"><div class="t1">${esc(b.table)} · ${b.status === "void" ? "Cleared" : clock(b.paid_at)}${b.stars ? ` <span class="stars">${"★".repeat(b.stars)}</span>` : ""}</div>
        <div class="t2">${dateTxt(b.paid_at || b.opened_at)} · ${b.guests ? b.guests + " guests · " : ""}${b.status === "void" ? esc(b.void_reason) : (b.method || "").toUpperCase() + (b.by ? " · " + esc(b.by) : "")}</div></div>
        <div class="amt">${b.status === "void" ? '<span class="badge red">void</span>' : money(b.total)}</div></div>`).join("")}</div>`}`;
  },

  /* ---------- Menu ---------- */
  menu(){
    if (!MENU) return pageTop("Menu") + loading();
    const edit = can.manage(), q = menuQ.toLowerCase();
    const out = MENU.items.filter(i => !i.available).length;
    return pageTop("Menu", `${MENU.items.length} dishes · ${out} sold out`, edit ? `<button class="btn ghost sm" data-newcat>${I.plus} Section</button><button class="btn sm" data-newitem>${I.plus} Dish</button>` : "") + `
      <div class="toolbar"><input class="in" id="menuQ" placeholder="Search dishes" value="${esc(menuQ)}"></div>
      ${MENU.categories.map(c => { const items = MENU.items.filter(i => i.category_id === c.id && (!q || i.name.toLowerCase().includes(q)));
        if (q && !items.length) return "";
        return `<div class="sec-head"><h2>${esc(c.name)} ${c.active ? "" : '<span class="badge">hidden</span>'}</h2>${edit ? `<button class="btn ghost sm" data-editcat="${c.id}">Edit</button>` : ""}</div>
        <div class="list">${items.length ? items.map(i => `<div class="li" ${edit ? `data-item="${i.id}"` : ""}>
          ${i.photo_url ? `<img class="thumb" src="${esc(i.photo_url)}" alt="">` : `<span class="thumb">${esc(i.name[0])}</span>`}
          <div class="grow"><div class="t1">${dietMark(i.diet)} ${esc(i.name)} ${i.bestseller ? '<span class="badge ac">best</span>' : ""}</div>
            <div class="t2">${i.sizes.length ? i.sizes.map(s => esc(s.name) + " " + money(s.price)).join(" · ") : money(i.price)}${i.addons.length ? " · " + i.addons.length + " extras" : ""}</div></div>
          <span class="t2" style="font-size:12px">${i.available ? "On" : "Sold out"}</span><button class="tgl ${i.available ? "on" : ""}" data-avail="${i.id}" aria-label="Available"></button></div>`).join("") : `<div class="empty">No dishes in this section yet.</div>`}</div>`; }).join("")}`;
  },

  /* ---------- Tables & QR ---------- */
  tables(){
    if (!LIVE) return pageTop("Tables & QR") + loading();
    return pageTop("Tables & QR", "Each table has its own QR code. Print them and stick one on every table.",
      `<button class="btn ghost sm" data-printqr>${I.print} Print QR codes</button><button class="btn sm" data-newtable>${I.plus} Table</button>`) + `
      <div class="list">${LIVE.tables.map(t => `<div class="li" data-edittable="${t.id}"><span class="thumb">${esc(t.code)}</span>
        <div class="grow"><div class="t1">${esc(t.name || "Table " + t.code)} ${t.active ? "" : '<span class="badge">off</span>'}</div><div class="t2">${esc(t.area)} · ${t.seats} seats</div></div>
        <button class="btn ghost sm" data-qr="${t.id}">QR</button></div>`).join("")}</div>`;
  },

  /* ---------- Settings (owner) ---------- */
  settings(){
    const tabs = [["place", "Restaurant"], ["pay", "Bill & payments"], ["team", "Team"], ["activity", "Activity"]];
    const t = sub || "place";
    let body = loading();
    if (t === "place" && SET) body = `<form class="card" id="setForm">
        <div class="lbl" style="margin-top:0">Cover photo (top of the guest page)</div>
        ${SET.cover_url ? `<img class="phototile" src="${esc(SET.cover_url)}" data-coverpick alt="">` : `<div class="phototile" data-coverpick>Add a cover photo — your dining room or a signature dish</div>`}
        <input type="file" id="coverIn" accept="image/*" hidden><input type="hidden" name="cover_url" value="${esc(SET.cover_url || "")}">
        ${SET.cover_url ? `<button type="button" class="btn ghost sm" style="margin-top:8px" data-rmcover>Remove cover photo</button>` : ""}
        <div class="formgrid">
        <label class="field"><span>Restaurant name</span><input class="in" name="restaurant_name" value="${esc(SET.restaurant_name)}" required maxlength="60"></label>
        <label class="field"><span>Short line under the name</span><input class="in" name="tagline" value="${esc(SET.tagline)}" maxlength="80"></label>
        <label class="field full"><span>Welcome note on the guest page</span><input class="in" name="welcome_note" value="${esc(SET.welcome_note)}" maxlength="160"></label>
        <label class="field full"><span>Message when ordering is paused</span><input class="in" name="closed_message" value="${esc(SET.closed_message)}" maxlength="160"></label>
        <label class="field"><span>Brand colour (guest page)</span><input class="in" name="accent" type="color" value="${esc(SET.accent)}" style="height:44px;padding:4px"></label>
        <label class="field"><span>Google review link</span><input class="in" name="google_review_url" value="${esc(SET.google_review_url)}" placeholder="https://g.page/r/…/review"></label>
        <label class="field"><span>Guest Wi-Fi name</span><input class="in" name="wifi_name" value="${esc(SET.wifi_name)}" maxlength="60"></label>
        <label class="field"><span>Guest Wi-Fi password</span><input class="in" name="wifi_password" value="${esc(SET.wifi_password)}" maxlength="60"></label>
      </div><div class="d-foot"><button class="btn lg">Save</button></div></form>`;
    if (t === "pay" && SET) body = `<form class="card" id="setForm"><div class="formgrid">
        <label class="field"><span>GST %</span><input class="in" name="gst_pct" type="number" min="0" max="28" step="0.5" value="${SET.gst_pct}"></label>
        <label class="field"><span>Service charge % (0 = none)</span><input class="in" name="service_pct" type="number" min="0" max="20" step="0.5" value="${SET.service_pct}"></label>
        <label class="field full"><span>Tip choices guests see (%, comma separated, 0 = no tip)</span><input class="in" name="tip_options" value="${esc(SET.tip_options.join(", "))}"></label>
        <label class="field"><span>UPI ID</span><input class="in" name="upi_id" value="${esc(SET.upi_id)}" placeholder="name@bank"></label>
        <label class="field"><span>Name shown in the UPI app</span><input class="in" name="upi_name" value="${esc(SET.upi_name)}"></label>
        <label class="field"><span>Currency sign</span><input class="in" name="currency" value="${esc(SET.currency)}" maxlength="4"></label>
      </div>
      <label class="check"><input type="checkbox" name="pay_upi" ${SET.pay_upi ? "checked" : ""}> Guests can pay by UPI</label>
      <label class="check"><input type="checkbox" name="pay_cash" ${SET.pay_cash ? "checked" : ""}> Guests can pay cash</label>
      <label class="check"><input type="checkbox" name="pay_card" ${SET.pay_card ? "checked" : ""}> Guests can pay by card</label>
      <div class="d-foot"><button class="btn lg">Save</button></div></form>`;
    if (t === "team") body = !TEAM ? loading() : `<div class="toolbar"><button class="btn sm" data-newstaff>${I.plus} Add a login</button></div><div class="list">${TEAM.staff.map(s => `<div class="li" data-staff="${s.id}">
        <span class="avatar">${esc((s.name || "?")[0])}</span><div class="grow"><div class="t1">${esc(s.name)} ${s.active ? "" : '<span class="badge red">off</span>'}</div><div class="t2">${esc(s.email || "")}${s.phone ? " · " + esc(s.phone) : ""}</div></div>
        <span class="badge ${s.role === "owner" ? "ac" : s.role === "kitchen" ? "blue" : ""}">${esc(s.role)}</span></div>`).join("")}</div>
      <p class="t2" style="color:var(--muted);font-size:13px;margin-top:12px">Owner: everything · Manager: everything except Settings · Waiter: Floor, Kitchen, Bills · Kitchen: Kitchen screen and sold-out switches.</p>`;
    if (t === "activity") body = !ACT ? loading() : `<div class="list">${ACT.length ? ACT.map(a => `<div class="li" style="cursor:default"><div class="grow"><div class="t1">${esc(actText(a.action))}${a.detail ? " · " + esc(a.detail) : ""}</div><div class="t2">${esc(a.by_name || "")} · ${dateTxt(a.at)} ${clock(a.at)}</div></div></div>`).join("") : `<div class="empty">Nothing yet.</div>`}</div>`;
    return pageTop("Settings") + `<div class="seg" style="margin-bottom:16px;flex-wrap:wrap">${tabs.map(([k, n]) => `<button class="${t === k ? "on" : ""}" data-settab="${k}">${n}</button>`).join("")}</div>` + body;
  },

  /* ---------- Help ---------- */
  help(){
    const g = GUIDE.filter(s => s.roles.includes(role()));
    return pageTop("Help", "How everything works. Check here first — then ask the owner.") + `<div class="guide"><nav>${g.map(s => `<a href="#help" data-goto="g-${s.id}">${esc(s.title)}</a>`).join("")}<a href="#help" data-goto="g-new">What's new</a></nav>
      <article>${g.map(s => `<section class="card" id="g-${s.id}"><h2>${esc(s.title)}</h2>${s.body}</section>`).join("")}
        <section class="card" id="g-new"><h2>What's new</h2><div class="rows new-list">${WHATS_NEW.map(w => `<div class="r"><span class="badge">${esc(w.date)}</span><span class="grow">${esc(w.text)}</span></div>`).join("")}</div></section></article></div>`;
  }
};

function report(R){
  const days = R.by_day, max = Math.max(1, ...days.map(d => d.sales));
  const topMax = Math.max(1, ...R.top.map(t => t.qty));
  const methTotal = Object.values(R.methods).reduce((a, b) => a + b, 0) || 1;
  return `<div class="kpis">
      <div class="kpi"><div class="k">Sales</div><div class="v">${money(R.sales)}</div><div class="s">incl. GST ${money(R.gst)} · tips ${money(R.tips)}</div></div>
      <div class="kpi"><div class="k">Bills</div><div class="v">${R.bills}</div><div class="s">avg ${R.bills ? money(R.sales / R.bills) : "—"} · ${R.guests} guests</div></div>
      <div class="kpi"><div class="k">Kitchen time</div><div class="v">${R.prep_mins != null ? R.prep_mins + "<small style='font-size:15px'> min</small>" : "—"}</div><div class="s">order to ready, on average</div></div>
      <div class="kpi"><div class="k">Rating</div><div class="v">${R.rating != null ? "★ " + R.rating : "—"}</div><div class="s">${R.ratings} review${R.ratings === 1 ? "" : "s"}${R.voids ? " · " + R.voids + " cleared" : ""}</div></div></div>
    <div class="grid2">
      <div class="card"><h2>Sales by day</h2>${days.length ? `<div class="bars">${days.slice(-31).map(d => `<div class="b ${d.day === today() ? "hi" : ""}" title="${d.day}: ${money(d.sales)} · ${d.bills} bills"><i style="height:${d.sales / max * 100}%"></i><span>${+d.day.slice(8)}</span></div>`).join("")}</div>` : `<div class="empty">No paid bills yet.</div>`}</div>
      <div class="card"><h2>Paid by</h2><div class="rows">${["upi", "cash", "card", "mixed"].filter(k => R.methods[k]).map(k => `<div class="r"><div class="grow"><b>${k.toUpperCase()}</b><div class="meterbar"><i style="width:${R.methods[k] / methTotal * 100}%"></i></div></div><span>${money(R.methods[k])}</span></div>`).join("") || `<div class="empty">—</div>`}</div></div>
      <div class="card"><h2>Top dishes</h2><div class="rows">${R.top.map(t => `<div class="r"><div class="grow">${esc(t.name)}<div class="meterbar"><i style="width:${t.qty / topMax * 100}%"></i></div></div><span class="muted">${t.qty} sold</span><b>${money(t.amount)}</b></div>`).join("") || `<div class="empty">—</div>`}</div></div>
      <div class="card"><h2>What guests said</h2><div class="rows">${R.reviews.filter(r => r.comment).slice(0, 8).map(r => `<div class="r"><div class="grow"><span class="stars">${"★".repeat(r.stars)}</span> ${esc(r.comment)}<div class="muted">${esc(r.table || "")} · ${dateTxt(r.at)}</div></div></div>`).join("") || `<div class="empty">No comments yet.</div>`}</div></div>
    </div>`;
}
const actText = a => ({ bill_paid: "Bill paid", bill_changed: "Bill split/tip changed", price_changed: "Price changed", dish_added: "Dish added", dish_renamed: "Dish renamed", order_cancelled: "Order cancelled", table_cleared: "Table cleared", sold_out: "Marked sold out", back_on_menu: "Back on the menu", dish_deleted: "Dish deleted",
  qr_replaced: "QR code replaced", orders_on: "QR ordering switched on", orders_off: "QR ordering paused", settings_changed: "Settings changed", login_added: "Login added",
  login_changed: "Login changed", login_deleted: "Login deleted", login_password: "Password changed" })[a] || a;

function ticket(o){
  const m = mins(o.created_at), late = m >= 20 ? "very-late" : m >= 10 ? "late" : "";
  const t = o.table;
  let act = "";
  if (o.status === "new") act = `<button class="btn" data-ost="${o.id}:cooking">Start cooking</button>`;
  else if (o.status === "cooking") act = `<button class="btn ghost sm" data-ost="${o.id}:new" title="Back to New">↩</button><button class="btn ok" data-ost="${o.id}:ready">Ready</button>`;
  else if (o.status === "ready") act = `<button class="btn ghost sm" data-ost="${o.id}:cooking" title="Back to Cooking">↩</button>` + (can.floor() ? `<button class="btn" data-ost="${o.id}:served">Served</button>` : `<span class="btn ghost" style="pointer-events:none">Waiting for pickup</span>`);
  return `<div class="ticket ${o.status !== "ready" ? late : ""}"><div class="t-head"><span class="tb">${esc(t ? t.code : "?")}</span><span class="no">#${o.no}</span>${o.source === "staff" ? '<span class="src">waiter</span>' : ""}<span class="timer">${m}m</span></div>
    ${o.note ? `<div class="t-note">${esc(o.note)}</div>` : ""}
    <div class="t-items">${o.items.map(i => `<div class="t-item"><span class="q">${i.qty}×</span><span>${esc(i.name)}${i.size || i.addons.length ? `<small>${[i.size, ...i.addons].filter(Boolean).map(esc).join(" · ")}</small>` : ""}${i.note ? `<span class="nt">“${esc(i.note)}”</span>` : ""}</span></div>`).join("")}</div>
    <div class="t-actions">${act}</div></div>`;
}
async function keepAwake(){ try { if (!wake && navigator.wakeLock) { wake = await navigator.wakeLock.request("screen"); wake.addEventListener("release", () => wake = null); } } catch(e){} }

/* ============================ DRAWERS ============================ */
function openDrawer(fn, live){ drawerFn = fn; drawerFn.live = !!live; $("drawer").hidden = false; fn(); }
function closeDrawer(){ $("drawer").hidden = true; drawerFn = null; $("drawerBody").innerHTML = ""; }
const dHead = (title, subText) => `<div class="d-head"><div style="flex:1"><h2>${title}</h2>${subText ? `<p class="sub">${subText}</p>` : ""}</div><button class="iconbtn" data-dclose aria-label="Close">${I.x}</button></div>`;

/* Table */
let tdForm = null;
function tableDrawer(tid){
  openDrawer(function draw(){
    const t = tableOf(tid); if (!t) return closeDrawer();
    const v = visitOf(tid), cs = callsOf(tid), s = tableState(t);
    let h = dHead(esc(t.code) + (t.name ? " · " + esc(t.name) : ""), `${esc(t.area)} · ${t.seats} seats · ${s.label}${v ? " · open " + ago(v.opened_at) : ""}`);
    if (cs.length) h += `<div class="lbl">Calling</div>` + cs.map(c => `<div class="o-card" style="display:flex;align-items:center;gap:8px"><b style="flex:1">${callName[c.kind]} <small style="color:var(--muted);font-weight:500">${ago(c.at)}${c.seen_by ? " · " + esc(c.seen_by) : ""}</small></b>
      ${c.seen_at ? "" : `<button class="btn ghost sm" data-call="${c.id}:seen">On it</button>`}<button class="btn ok sm" data-call="${c.id}:done">Done</button></div>`).join("");
    if (!v) {
      h += `<div class="empty">No one is seated here yet.</div><div class="d-foot">${can.floor() ? `<button class="btn lg" data-take="${tid}">${I.plus} Take an order</button>` : ""}</div>`;
      $("drawerBody").innerHTML = h; return;
    }
    h += `<div class="lbl">Orders</div>` + v.orders.map(o => {
      const btn = o.status === "new" ? `<button class="btn sm ghost" data-ost="${o.id}:cooking">Start</button>` : o.status === "cooking" ? `<button class="btn sm ok" data-ost="${o.id}:ready">Ready</button>` : o.status === "ready" && can.floor() ? `<button class="btn sm" data-ost="${o.id}:served">Served</button>` : "";
      const canCancel = o.status !== "cancelled" && o.status !== "served" && (can.manage() || (role() === "waiter" && o.status === "new"));
      return `<div class="o-card"><div class="oh"><b>#${o.no} · ${clock(o.created_at)}</b><span class="badge ${o.status === "ready" ? "ok" : o.status === "cancelled" ? "red" : o.status === "served" ? "" : "ac"}">${o.status}</span>${o.source === "staff" ? '<span class="src">waiter</span>' : ""}
        <span class="btns">${btn}${canCancel ? `<button class="btn sm danger" data-cancel="${o.id}" title="Cancel order">${I.x}</button>` : ""}</span></div>
        ${o.items.map(i => `<div class="o-line">${dietMark(i.diet)}<span class="grow">${i.qty} × ${esc(i.name)} <small>${[i.size, ...i.addons].filter(Boolean).map(esc).join(" · ")}${i.note ? " · “" + esc(i.note) + "”" : ""}</small></span><span>${money(i.amount)}</span></div>`).join("")}
        ${o.note ? `<div class="t-note" style="margin:6px 0 0">${esc(o.note)}</div>` : ""}${o.cancel_reason ? `<small style="color:var(--muted)">${esc(o.cancel_reason)}</small>` : ""}</div>`; }).join("");
    const b = v.bill;
    h += `<div class="lbl">Bill${v.status === "bill" ? ` · asked ${ago(v.bill_at)} · wants ${esc((v.pay_choice || "—").toUpperCase())}` : ""}</div>
      <div class="tot"><div><span>Item total</span><span>${money(b.subtotal)}</span></div>${b.service ? `<div><span>Service ${b.service_pct}%</span><span>${money(b.service)}</span></div>` : ""}
        ${b.gst ? `<div><span>GST ${b.gst_pct}%</span><span>${money(b.gst)}</span></div>` : ""}${b.tip ? `<div><span>Tip ${b.tip_pct}%</span><span>${money(b.tip)}</span></div>` : ""}
        <div class="g"><span>Total</span><span>${money(b.grand)}</span></div>${b.split > 1 ? `<div class="e"><span>Split ${b.split} ways</span><span>${money(b.each)} each</span></div>` : ""}</div>`;
    if (can.floor()) {
      h += `<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-top:12px;font-size:13px;color:var(--muted)">
          <span>Split <span class="stepper"><button data-vu="split:-1">−</button><b>${v.split}</b><button data-vu="split:1">+</button></span></span>
          <span>Guests <span class="stepper"><button data-vu="guests:-1">−</button><b>${v.guests || "–"}</b><button data-vu="guests:1">+</button></span></span></div>
        <div class="chips" style="margin-top:10px">${[0, 5, 10, 15].map(p => `<button class="chip ${v.tip_pct == p ? "on" : ""}" data-vtip="${p}">${p ? "Tip " + p + "%" : "No tip"}</button>`).join("")}</div>
        <div class="lbl">Mark paid</div>
        <input class="in" id="payRef" maxlength="60" placeholder="UPI ref (UTR) or card slip no. — optional" style="margin-bottom:8px" autocomplete="off">
        <div class="paybtns"><button class="btn ok" data-paid="upi">UPI</button><button class="btn ok" data-paid="cash">Cash</button><button class="btn ok" data-paid="card">Card</button></div>
        <div class="d-foot"><button class="btn ghost" data-take="${tid}">${I.plus} Add to order</button>${LIVE.settings.upi_id ? `<button class="btn ghost" data-upiqr>UPI QR</button>` : ""}<button class="btn ghost" data-printbill>${I.print} Print</button></div>
        <div id="upiBox"></div>
        ${can.manage() ? `<div class="d-foot"><button class="btn danger" data-void>Clear table without payment…</button></div>` : ""}`;
    }
    $("drawerBody").innerHTML = h;
    $("drawerBody").dataset.visit = v.id; $("drawerBody").dataset.table = tid;
  }, true);
}

/* Take an order (waiter) */
let pick = null;
function takeOrder(tid){
  pick = { table: tid, lines: [], q: "", open: null, size: "", addons: [], note: "", guests: 2, request: null };
  if (!MENU) API.rpc("staff_menu").then(m => { MENU = m; if (drawerFn === drawPick) drawPick(); }).catch(fail);
  openDrawer(drawPick, false);
}
function drawPick(){
  const t = tableOf(pick.table), v = visitOf(pick.table);
  const q = pick.q.toLowerCase();
  const unit = (i, size, adds) => (i.sizes.length ? +(i.sizes.find(s => s.name === size) || i.sizes[0]).price : +i.price) + adds.reduce((a, n) => a + +((i.addons.find(x => x.name === n) || {}).price || 0), 0);
  const total = pick.lines.reduce((a, l) => a + l.unit * l.qty, 0);
  let h = dHead("Order for " + esc(t ? t.code : ""), "Goes straight to the kitchen") +
    `<input class="in" id="pickQ" placeholder="Search dishes" value="${esc(pick.q)}">`;
  if (!MENU) h += loading();
  else h += `<div class="picker">${MENU.categories.filter(c => c.active).map(c => { const items = MENU.items.filter(i => i.category_id === c.id && (!q || i.name.toLowerCase().includes(q)));
    if (!items.length) return "";
    return `<div class="lbl">${esc(c.name)}</div>` + items.map(i => {
      const open = pick.open === i.id;
      return `<div class="pi ${i.available ? "" : "out"}">${dietMark(i.diet)}<div class="grow"><b>${esc(i.name)}</b> <small>${i.sizes.length ? "from " + money(Math.min(...i.sizes.map(s => s.price))) : money(i.price)}${i.available ? "" : " · sold out"}</small>
        ${open ? `<div class="sizebtns">${i.sizes.map(s => `<button class="chip ${pick.size === s.name ? "on" : ""}" data-psize="${esc(s.name)}">${esc(s.name)} ${money(s.price)}</button>`).join("")}
          ${i.addons.map(a => `<button class="chip ${pick.addons.includes(a.name) ? "on" : ""}" data-padd="${esc(a.name)}">+ ${esc(a.name)} ${money(a.price)}</button>`).join("")}</div>
          <div style="display:flex;gap:6px;margin-top:6px"><input class="in" id="pickNote" placeholder="Note (optional)" value="${esc(pick.note)}" style="padding:7px 10px"><button class="btn sm" data-padd-go="${i.id}">Add · ${money(unit(i, pick.size, pick.addons))}</button></div>` : ""}</div>
        ${i.available && !open ? `<button class="btn sm ghost" data-pick="${i.id}">${I.plus}</button>` : ""}</div>`; }).join(""); }).join("")}</div>`;
  h += `<div class="lbl">This order</div>${pick.lines.length ? pick.lines.map((l, k) => `<div class="o-line"><span class="grow">${esc(l.name)} <small>${[l.size, ...l.addons].filter(Boolean).map(esc).join(" · ")}${l.note ? " · “" + esc(l.note) + "”" : ""}</small></span>
      <span class="stepper"><button data-pq="${k}:-1">−</button><b>${l.qty}</b><button data-pq="${k}:1">+</button></span><span style="min-width:64px;text-align:right">${money(l.unit * l.qty)}</span></div>`).join("") : `<div class="empty" style="padding:10px">Tap + next to a dish.</div>`}
    ${!v ? `<div style="margin-top:10px;font-size:13px;color:var(--muted)">Guests <span class="stepper"><button data-pg="-1">−</button><b>${pick.guests}</b><button data-pg="1">+</button></span></div>` : ""}
    <div class="d-foot"><button class="btn ghost" data-backtable="${pick.table}">Back</button><button class="btn lg" data-sendorder ${pick.lines.length ? "" : "disabled"}>Send to kitchen · ${money(total)}</button></div>`;
  $("drawerBody").innerHTML = h;
  const pq = $("pickQ"); pq.addEventListener("input", e => { pick.q = e.target.value; const pos = e.target.selectionStart; drawPick(); const n = $("pickQ"); n.focus(); n.setSelectionRange(pos, pos); });
  const pn = $("pickNote"); if (pn) pn.addEventListener("input", e => pick.note = e.target.value);
  drawPick.unit = unit;
}

/* Sold-out switches (kitchen) */
function soldOutDrawer(){
  const draw = () => {
    if (!MENU) { $("drawerBody").innerHTML = dHead("Sold out") + loading(); return; }
    $("drawerBody").innerHTML = dHead("Sold out", "Switch a dish off and guests can't order it until you switch it back on.") +
      MENU.categories.map(c => `<div class="lbl">${esc(c.name)}</div>` + MENU.items.filter(i => i.category_id === c.id).map(i => `<div class="o-line" style="align-items:center;padding:7px 0">${dietMark(i.diet)}<span class="grow">${esc(i.name)}</span><small>${i.available ? "On" : "Sold out"}</small><button class="tgl ${i.available ? "on" : ""}" data-avail="${i.id}"></button></div>`).join("")).join("");
  };
  API.rpc("staff_menu").then(m => { MENU = m; if (drawerFn === draw) draw(); }).catch(fail);
  openDrawer(draw, false);
}

/* Bill details (Bills screen) */
function billDrawer(id){
  const b = BILLS.find(x => x.id === id); if (!b) return;
  openDrawer(() => {
    const B = b.bill;
    $("drawerBody").innerHTML = dHead(esc(b.table) + " · " + (b.status === "void" ? "Cleared" : money(b.total)), `${dateTxt(b.paid_at || b.opened_at)} · opened ${clock(b.opened_at)}${b.paid_at ? " · paid " + clock(b.paid_at) : ""}${b.by ? " · " + esc(b.by) : ""}`) +
      (b.status === "void" ? `<div class="t-note">${esc(b.void_reason)}</div>` : "") +
      B.lines.map(l => `<div class="o-line"><span class="grow">${l.qty} × ${esc(l.name)} <small>${[l.size, ...(l.addons || [])].filter(Boolean).map(esc).join(" · ")}</small></span><span>${money(l.amount)}</span></div>`).join("") +
      `<div class="tot"><div><span>Item total</span><span>${money(B.subtotal)}</span></div>${B.service ? `<div><span>Service</span><span>${money(B.service)}</span></div>` : ""}${B.gst ? `<div><span>GST</span><span>${money(B.gst)}</span></div>` : ""}
        ${B.tip ? `<div><span>Tip</span><span>${money(B.tip)}</span></div>` : ""}<div class="g"><span>Total</span><span>${money(B.grand)}</span></div></div>
      ${b.status === "paid" ? `<p style="margin-top:10px;color:var(--muted);font-size:13.5px">Paid by ${esc((b.method || "").toUpperCase())}${b.ref ? " · ref " + esc(b.ref) : ""}${b.stars ? ` · rated <span class="stars">${"★".repeat(b.stars)}</span>` : ""}</p>
      <div class="d-foot"><button class="btn ghost" data-printpaid="${b.id}">${I.print} Print bill</button></div>` : ""}`;
  });
}

/* Menu: section + dish forms */
function catDrawer(id){
  const c = id ? MENU.categories.find(x => x.id === id) : { name: "", sort: MENU.categories.length + 1, active: true };
  openDrawer(() => {
    $("drawerBody").innerHTML = dHead(id ? "Edit section" : "New section") + `<form id="catForm">
      <label class="field"><span>Name</span><input class="in" name="name" value="${esc(c.name)}" required maxlength="60"></label>
      <label class="field"><span>Order on the menu (lower comes first)</span><input class="in" name="sort" type="number" value="${c.sort}"></label>
      <label class="check"><input type="checkbox" name="active" ${c.active ? "checked" : ""}> Show this section to guests</label>
      <div class="d-foot">${id ? `<button type="button" class="btn danger" data-delcat="${id}">Delete</button>` : ""}<button class="btn lg">Save</button></div></form>`;
    $("catForm").addEventListener("submit", async e => { e.preventDefault(); const f = e.target;
      try { await API.rpc("owner_save_category", { p: { id: id || null, name: f.name.value, sort: +f.sort.value, active: f.active.checked } }); closeDrawer(); toast("Saved"); load("menu"); } catch(err){ fail(err); } });
  });
}
const ALLERGENS = ["Dairy", "Gluten", "Nuts", "Peanuts", "Egg", "Soy", "Fish", "Shellfish", "Sesame", "Mustard"];
let IF = null;
function itemDrawer(id){
  const it = id ? JSON.parse(JSON.stringify(MENU.items.find(x => x.id === id))) : { name: "", category_id: (MENU.categories[0] || {}).id, description: "", price: "", diet: "veg", spice: null, allergens: [], sizes: [], addons: [], photo_url: "", bestseller: false, available: true, sort: null };
  if (!MENU.categories.length) { toast("Add a section first (e.g. Starters).", true); return; }
  IF = it; openDrawer(drawItem);
}
function readItem(){
  const f = $("itemForm"); if (!f) return;
  Object.assign(IF, { name: f.name.value, category_id: f.category_id.value, description: f.description.value, price: f.price.value, diet: f.diet.value,
    spice: f.spice.value, bestseller: f.bestseller.checked, available: f.available.checked, sort: f.sort.value === "" ? null : +f.sort.value,
    allergens: [...f.querySelectorAll("[data-al].on")].map(b => b.dataset.al) });
  ["sizes", "addons"].forEach(k => { IF[k] = [...f.querySelectorAll(`[data-rows="${k}"] .rl`)].map(r => ({ name: r.querySelector("[data-n]").value, price: r.querySelector("[data-p]").value })); });
}
function drawItem(){
  const i = IF, rows = k => `<div class="rowlist" data-rows="${k}">${i[k].map((r, n) => `<div class="rl"><input class="in" data-n placeholder="${k === "sizes" ? "e.g. Half" : "e.g. Extra cheese"}" value="${esc(r.name)}"><input class="in" data-p type="number" min="0" placeholder="${k === "sizes" ? "Price" : "+ Price"}" value="${esc(r.price)}"><button type="button" class="iconbtn" data-rmrow="${k}:${n}">${I.x}</button></div>`).join("")}</div>
    <button type="button" class="btn ghost sm" data-addrow="${k}">${I.plus} ${k === "sizes" ? "Size" : "Extra"}</button>`;
  $("drawerBody").innerHTML = dHead(i.id ? "Edit dish" : "New dish") + `<form id="itemForm">
    ${i.photo_url ? `<img class="phototile" src="${esc(i.photo_url)}" data-photo alt="">` : `<div class="phototile" data-photo>Add a photo</div>`}
    <input type="file" id="photoIn" accept="image/*" hidden>
    ${i.photo_url ? `<button type="button" class="btn ghost sm" style="margin-top:8px" data-rmphoto>Remove photo</button>` : ""}
    <div class="formgrid"><label class="field full"><span>Name</span><input class="in" name="name" value="${esc(i.name)}" required maxlength="80"></label>
      <label class="field"><span>Section</span><select class="in" name="category_id">${MENU.categories.map(c => `<option value="${c.id}" ${c.id === i.category_id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
      <label class="field"><span>Price${i.sizes.length ? " (sizes set the price)" : ""}</span><input class="in" name="price" type="number" min="0" step="1" value="${esc(i.price)}" required></label>
      <label class="field"><span>Type</span><select class="in" name="diet">${[["veg", "Veg"], ["nonveg", "Non-veg"], ["egg", "Egg"]].map(([k, n]) => `<option value="${k}" ${i.diet === k ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <label class="field"><span>Spice level</span><select class="in" name="spice"><option value="">Not spicy / don't show</option>${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${+i.spice === n ? "selected" : ""}>${n} of 5</option>`).join("")}</select></label>
      <label class="field full"><span>Description</span><textarea class="in" name="description" rows="2" maxlength="240">${esc(i.description)}</textarea></label></div>
    <div class="lbl">Allergens</div><div class="chips">${ALLERGENS.map(a => `<button type="button" class="chip ${i.allergens.includes(a) ? "on" : ""}" data-al="${a}">${a}</button>`).join("")}</div>
    <div class="lbl">Sizes (optional — e.g. Half / Full)</div>${rows("sizes")}
    <div class="lbl">Extras (optional — added on top of the price)</div>${rows("addons")}
    <label class="check"><input type="checkbox" name="bestseller" ${i.bestseller ? "checked" : ""}> Show a “Bestseller” tag</label>
    <label class="check"><input type="checkbox" name="available" ${i.available ? "checked" : ""}> Available now (untick = sold out)</label>
    <label class="field"><span>Order in its section (lower comes first)</span><input class="in" name="sort" type="number" value="${i.sort == null ? "" : i.sort}"></label>
    <div class="d-foot">${i.id ? `<button type="button" class="btn danger" data-delitem="${i.id}">Delete</button>` : ""}<button class="btn lg">Save dish</button></div></form>`;
  $("itemForm").addEventListener("submit", async e => { e.preventDefault(); readItem();
    const p = Object.assign({}, IF, { price: +IF.price || 0, spice: IF.spice === "" ? null : +IF.spice,
      sizes: IF.sizes.filter(s => s.name.trim() || s.price !== ""), addons: IF.addons.filter(s => s.name.trim() || s.price !== "") });
    if (p.sizes.length && !p.price) p.price = Math.min(...p.sizes.map(s => +s.price || 0));
    try { await API.rpc("owner_save_item", { p }); closeDrawer(); toast("Dish saved"); load("menu"); } catch(err){ fail(err); } });
  $("photoIn").addEventListener("change", async e => { const f = e.target.files[0]; if (!f) return; readItem(); toast("Uploading photo…");
    try { const old = IF.photo_url; IF.photo_url = await API.uploadPhoto(f); if (old) API.removePhoto(old); drawItem(); toast("Photo added — remember to Save"); } catch(err){ fail(err); } });
}

/* Tables */
function tableEdit(id){
  const t = id ? LIVE.tables.find(x => x.id === id) : { code: "", name: "", area: (LIVE.tables[LIVE.tables.length - 1] || {}).area || "Main", seats: 4, active: true };
  openDrawer(() => {
    $("drawerBody").innerHTML = dHead(id ? "Table " + esc(t.code) : "New table") + `<form id="tblForm"><div class="formgrid">
      <label class="field"><span>Table number</span><input class="in" name="code" value="${esc(t.code)}" required maxlength="12" placeholder="T9"></label>
      <label class="field"><span>Seats</span><input class="in" name="seats" type="number" min="1" max="40" value="${t.seats}"></label>
      <label class="field"><span>Area</span><input class="in" name="area" value="${esc(t.area)}" list="areas" placeholder="Main, Terrace…"><datalist id="areas">${[...new Set(LIVE.tables.map(x => x.area))].map(a => `<option value="${esc(a)}">`).join("")}</datalist></label>
      <label class="field"><span>Name (optional)</span><input class="in" name="name" value="${esc(t.name)}" placeholder="Window booth"></label></div>
      <label class="check"><input type="checkbox" name="active" ${t.active ? "checked" : ""}> Switched on (guests can order from its QR)</label>
      <div class="d-foot">${id ? `<button type="button" class="btn danger" data-deltable="${id}">Delete</button>` : ""}<button class="btn lg">Save</button></div></form>`;
    $("tblForm").addEventListener("submit", async e => { e.preventDefault(); const f = e.target;
      try { await API.rpc("owner_save_table", { p: { id: id || null, code: f.code.value, seats: +f.seats.value, area: f.area.value, name: f.name.value, active: f.active.checked } });
        closeDrawer(); toast("Saved"); await tick(); TOKENS = await API.rpc("owner_table_tokens"); paint(); } catch(err){ fail(err); } });
  });
}
function qrSvg(text, cell){ try { const q = qrcode(0, "M"); q.addData(text); q.make(); return q.createSvgTag({ cellSize: cell || 5, margin: 2, scalable: true }); } catch(e){ return ""; } }
function qrDrawer(id){
  const t = LIVE.tables.find(x => x.id === id), link = guestLink(TOKENS[id]);
  openDrawer(() => {
    $("drawerBody").innerHTML = dHead("QR for " + esc(t.code), "Guests scan this to open the menu for this table.") + `<div class="qrbox">${qrSvg(link)}</div>
      <p style="text-align:center;font-size:12px;color:var(--muted);word-break:break-all">${esc(link)}</p>
      <div class="d-foot"><a class="btn ghost" href="${esc(link)}" target="_blank">Open guest page</a><button class="btn ghost" data-copylink="${esc(link)}">Copy link</button><button class="btn" data-printone="${id}">${I.print} Print</button></div>
      <div class="lbl">If a QR photo gets shared outside</div><p style="font-size:13.5px;color:var(--muted)">Replace the code: the old QR stops working at once, and you print and stick the new one.</p>
      <div class="d-foot"><button class="btn danger" data-newtoken="${id}">Replace this QR code</button></div>`;
  });
}
function printQr(ids){
  const name = LIVE.settings.name;
  $("print").innerHTML = `<div class="qr-sheet">${ids.map(id => { const t = LIVE.tables.find(x => x.id === id);
    return `<div class="qr-card"><h3>${esc(name)}</h3><p>Scan to see the menu & order</p><div class="tcode">${esc(t.code)}</div>${qrSvg(guestLink(TOKENS[id]), 6)}<p>Call a waiter · pay · from your phone</p></div>`; }).join("")}</div>`;
  setTimeout(() => print(), 80);
}
function printBill(b, tcode, paid){
  const s = LIVE.settings;
  $("print").innerHTML = `<div class="receipt"><h3>${esc(s.name)}</h3><div class="rl"><span>${esc(tcode)}</span><span>${new Date().toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span></div><hr>
    ${b.lines.map(l => `<div class="rl"><span>${l.qty} ${esc(l.name)}${l.size ? " (" + esc(l.size) + ")" : ""}</span><span>${Money.fmt(l.amount, "")}</span></div>`).join("")}<hr>
    <div class="rl"><span>Item total</span><span>${Money.fmt(b.subtotal, "")}</span></div>${b.service ? `<div class="rl"><span>Service ${b.service_pct}%</span><span>${Money.fmt(b.service, "")}</span></div>` : ""}
    ${b.gst ? `<div class="rl"><span>GST ${b.gst_pct}%</span><span>${Money.fmt(b.gst, "")}</span></div>` : ""}${b.tip ? `<div class="rl"><span>Tip</span><span>${Money.fmt(b.tip, "")}</span></div>` : ""}<hr>
    <div class="rl" style="font-weight:800"><span>TOTAL</span><span>${money(b.grand)}</span></div>${b.split > 1 ? `<div class="rl"><span>Split ${b.split}</span><span>${money(b.each)} each</span></div>` : ""}
    ${paid ? `<p>Paid by ${esc(paid.toUpperCase())}. Thank you!</p>` : s.upi_id ? `<div style="text-align:center;margin-top:3mm">${qrSvg("upi://pay?pa=" + encodeURIComponent(s.upi_id) + "&pn=" + encodeURIComponent(s.upi_name || s.name) + "&am=" + b.grand + "&cu=INR&tn=" + encodeURIComponent(tcode + " bill"), 3)}<p>Scan to pay by UPI</p></div>` : ""}</div>`;
  setTimeout(() => print(), 80);
}

/* Team */
function staffDrawer(id){
  const s = id ? TEAM.staff.find(x => x.id === id) : { name: "", email: "", phone: "", role: "waiter", active: true };
  openDrawer(() => {
    $("drawerBody").innerHTML = dHead(id ? esc(s.name) : "Add a login", id ? "" : "They sign in with this email and password. Give them the password in person.") + `<form id="staffForm">
      <label class="field"><span>Name</span><input class="in" name="name" value="${esc(s.name)}" required></label>
      <label class="field"><span>Email</span><input class="in" name="email" type="email" value="${esc(s.email || "")}" required></label>
      <label class="field"><span>Phone (optional)</span><input class="in" name="phone" value="${esc(s.phone || "")}"></label>
      <label class="field"><span>Access</span><select class="in" name="role">${[["waiter", "Waiter — floor, kitchen, bills"], ["kitchen", "Kitchen — kitchen screen, sold out"], ["manager", "Manager — all but Settings"], ["owner", "Owner — everything"]].map(([k, n]) => `<option value="${k}" ${s.role === k ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      ${id ? `<label class="check"><input type="checkbox" name="active" ${s.active ? "checked" : ""}> Switched on (can sign in)</label>` : `<label class="field"><span>Password (8+ characters)</span><input class="in" name="password" type="text" minlength="8" required autocomplete="new-password"></label>`}
      <div class="d-foot">${id && id !== ME.id ? `<button type="button" class="btn danger" data-delstaff="${id}">Delete login</button>` : ""}<button class="btn lg">Save</button></div></form>
      ${id ? `<div class="lbl">New password</div><div style="display:flex;gap:8px"><input class="in" id="newPw" type="text" minlength="8" placeholder="8+ characters" autocomplete="new-password"><button class="btn ghost" data-setpw="${id}">Set</button></div>` : ""}`;
    $("staffForm").addEventListener("submit", async e => { e.preventDefault(); const f = e.target;
      const body = { action: id ? "update" : "add", id, name: f.name.value.trim(), email: f.email.value.trim(), phone: f.phone.value.trim(), role: f.role.value };
      if (id) body.active = f.active.checked; else body.password = f.password.value;
      try { await API.teamAdmin(body); closeDrawer(); toast("Saved"); load("settings"); } catch(err){ fail(err); } });
  });
}
function openPassword(recovered){
  openDrawer(() => {
    $("drawerBody").innerHTML = dHead(recovered ? "Choose a new password" : esc(ME.name), recovered ? "" : esc(ME.email || "") + " · " + esc(ME.role)) + `<form id="pwForm">
      ${API.DEMO ? `<p style="color:var(--muted)">Passwords aren't used in the demo.</p>` : `<label class="field"><span>New password (8+ characters)</span><input class="in" name="pw" type="password" minlength="8" required autocomplete="new-password"></label><div class="d-foot"><button class="btn lg">Change password</button></div>`}</form>
      <div class="d-foot"><button class="btn ghost" data-signout>${I.out} Sign out</button></div>`;
    $("pwForm").addEventListener("submit", async e => { e.preventDefault(); try { await API.setPassword(e.target.pw.value); closeDrawer(); toast("Password changed"); } catch(err){ fail(err); } });
  });
}

/* CSV of bills (owner) */
function downloadCsv(){
  const rows = [["Date", "Opened", "Paid", "Table", "Guests", "Status", "Paid by", "Reference", "Item total", "Service", "GST", "Tip", "Total", "Staff", "Rating"]];
  BILLS.forEach(b => rows.push([(b.paid_at || b.opened_at).slice(0, 10), clock(b.opened_at), clock(b.paid_at), b.table, b.guests || "", b.status, b.method || "", b.ref || "", b.bill.subtotal, b.bill.service, b.bill.gst, b.bill.tip, b.status === "paid" ? b.total : 0, b.by || "", b.stars || ""]));
  const csv = rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" })); a.download = `bills-${billFrom}-to-${billTo}.csv`; a.click();
}

/* ============================ CLICKS ============================ */
async function act(fn, args, okMsg){ try { const r = await API.rpc(fn, args); if (okMsg) toast(okMsg); await tick(); return r; } catch(e){ fail(e); throw e; } }
document.addEventListener("click", async e => {
  const el = e.target.closest("[data-dclose],button,a[data-goto],[data-table],[data-bill],[data-item],[data-edittable],[data-staff],[data-photo],[data-demo]"); if (!el) return;
  const d = el.dataset;
  if (d.dclose !== undefined) return closeDrawer();
  if (d.demo) { try { await API.signIn(d.demo); location.hash = ""; firstLive = true; LIVE = null; start(); } catch(err){ fail(err); } return; }
  if (d.forgot !== undefined) { const em = ($("loginForm") || {}).email; if (!em || !em.value) return toast("Type your email first, then tap Forgot password.", true);
    try { await API.forgot(em.value.trim()); toast("Check your email for a reset link."); } catch(err){ fail(err); } return; }
  if (d.resetdemo !== undefined) { if (!confirmTap("reset", el, "Tap again to reset")) return; Demo.reset(); location.reload(); return; }
  if (d.theme !== undefined) { const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = t; store.set("dd.theme", t); shell(); paint(); return; }
  if (d.sound !== undefined) { soundOn = !soundOn; store.set("dd.sound", soundOn); if (soundOn) beep("order"); shell(); paint(); return; }
  if (d.me !== undefined) return openPassword(false);
  if (d.signout !== undefined) { await API.signOut(); closeDrawer(); location.hash = ""; return showLogin(); }
  if (d.accept !== undefined) { const on = !LIVE.settings.accepting; try { await API.rpc("owner_save_settings", { p: { accepting_orders: on } }); toast(on ? "Guests can order again" : "QR ordering paused"); await tick(); } catch(err){ fail(err); } return; }
  if (d.goto) { e.preventDefault(); const s = $(d.goto); if (s) s.scrollIntoView({ behavior: "smooth" }); return; }
  if (d.call) { const [id, a] = d.call.split(":"); act("staff_call", { p_call: id, p_action: a }, a === "done" ? "Done" : "Marked — you're on it").catch(() => {}); return; }
  if (d.range) { range = d.range; paint(); try { await loadReport(); paint(); } catch(err){ fail(err); } return; }
  if (d.table) return tableDrawer(d.table);
  if (d.kds) { kdsTab = d.kds; paint(); return; }
  if (d.ost) { const [id, st] = d.ost.split(":"); el.disabled = true; act("staff_order_status", { p_order: id, p_status: st }).catch(() => {}); return; }
  if (d.cancel) { if (!confirmTap("c" + d.cancel, el, "Cancel?")) return; const reason = can.manage() ? "Cancelled by " + ME.name : "Cancelled before cooking";
    act("staff_order_status", { p_order: d.cancel, p_status: "cancelled", p_reason: reason }, "Order cancelled").catch(() => {}); return; }
  if (d.soldout !== undefined) return soldOutDrawer();
  if (d.fullscreen !== undefined) { (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => toast("Full screen isn't available here.", true)); return; }
  if (d.avail) { const it = MENU.items.find(x => x.id === d.avail); it.available = !it.available; el.classList.toggle("on", it.available);
    try { await API.rpc("staff_item_available", { p_item: it.id, p_available: it.available }); toast(it.available ? it.name + " is back on" : it.name + " marked sold out"); if (route === "menu") paint(); if (drawerFn) drawerFn(); }
    catch(err){ it.available = !it.available; fail(err); paint(); } return; }

  /* table drawer */
  const vid = $("drawerBody").dataset.visit;
  if (d.vu) { const [k, n] = d.vu.split(":"); const v = LIVE.visits.find(x => x.id === vid);
    const args = { p_visit: vid, p_split: null, p_tip_pct: null, p_guests: null };
    if (k === "split") args.p_split = Math.max(1, v.split + +n); else args.p_guests = Math.max(1, (v.guests || 1) + +n);
    act("staff_visit_update", args).catch(() => {}); return; }
  if (d.vtip !== undefined) { act("staff_visit_update", { p_visit: vid, p_split: null, p_tip_pct: +d.vtip, p_guests: null }).catch(() => {}); return; }
  if (d.paid) { if (!confirmTap("p" + d.paid, el, "Confirm " + d.paid.toUpperCase())) return;
    const ref = (($("payRef") || {}).value || "").trim();
    try { await API.rpc("staff_mark_paid", { p_visit: vid, p_method: d.paid, p_reference: ref }); closeDrawer(); toast("Paid by " + d.paid.toUpperCase() + (ref ? " · ref saved" : "") + " · table is free"); await tick(); } catch(err){ fail(err); } return; }
  if (d.upiqr !== undefined) { const v = LIVE.visits.find(x => x.id === vid), s = LIVE.settings, t = tableOf(v.table_id);
    $("upiBox").innerHTML = `<div class="qrbox">${qrSvg("upi://pay?pa=" + encodeURIComponent(s.upi_id) + "&pn=" + encodeURIComponent(s.upi_name || s.name) + "&am=" + v.bill.grand + "&cu=INR&tn=" + encodeURIComponent(t.code + " bill"))}</div><p style="text-align:center;font-weight:700">${money(v.bill.grand)} to ${esc(s.upi_id)}</p>`; return; }
  if (d.printbill !== undefined) { const v = LIVE.visits.find(x => x.id === vid); printBill(v.bill, tableOf(v.table_id).code); return; }
  if (d.printpaid) { const b = BILLS.find(x => x.id === d.printpaid); printBill(b.bill, b.table, b.method); return; }
  if (d.void !== undefined) { const why = await askText("Why are you clearing this table?", "e.g. guests left, test order"); if (!why) return;
    try { await API.rpc("staff_void_visit", { p_visit: vid, p_reason: why }); closeDrawer(); toast("Table cleared"); await tick(); } catch(err){ fail(err); } return; }
  if (d.take) return takeOrder(d.take);
  if (d.backtable) return tableDrawer(d.backtable);

  /* take order */
  if (d.pick) { pick.request = null; const i = MENU.items.find(x => x.id === d.pick);
    if (!i.sizes.length && !i.addons.length) { const k = pick.lines.find(l => l.id === i.id && !l.size && !l.addons.length && !l.note); if (k) k.qty++; else pick.lines.push({ id: i.id, name: i.name, size: "", addons: [], note: "", qty: 1, unit: +i.price }); }
    else { pick.open = i.id; pick.size = i.sizes.length ? i.sizes[0].name : ""; pick.addons = []; pick.note = ""; }
    drawPick(); return; }
  if (d.psize) { pick.size = d.psize; drawPick(); return; }
  if (d.padd) { const a = pick.addons, n = a.indexOf(d.padd); n < 0 ? a.push(d.padd) : a.splice(n, 1); drawPick(); return; }
  if (d.paddGo) { pick.request = null; const i = MENU.items.find(x => x.id === d.paddGo); pick.lines.push({ id: i.id, name: i.name, size: pick.size, addons: pick.addons.slice(), note: pick.note.trim(), qty: 1, unit: drawPick.unit(i, pick.size, pick.addons) }); pick.open = null; drawPick(); return; }
  if (d.pq) { pick.request = null; const [k, n] = d.pq.split(":").map(Number); pick.lines[k].qty += n; if (pick.lines[k].qty <= 0) pick.lines.splice(k, 1); drawPick(); return; }
  if (d.pg) { pick.guests = Math.max(1, pick.guests + +d.pg); drawPick(); return; }
  if (d.sendorder !== undefined) { el.disabled = true; pick.request = pick.request || newRequestId();
    try { await API.rpc("staff_add_order", { p_table: pick.table, p_items: pick.lines.map(l => ({ id: l.id, qty: l.qty, size: l.size, addons: l.addons, note: l.note })), p_note: "", p_guests: visitOf(pick.table) ? null : pick.guests, p_request_id: pick.request });
      toast("Sent to the kitchen"); await tick(); tableDrawer(pick.table); } catch(err){ fail(err); el.disabled = false; } return; }

  /* bills */
  if (d.billgo !== undefined) { billFrom = $("bFrom").value || today(); billTo = $("bTo").value || billFrom; if (billTo < billFrom) [billFrom, billTo] = [billTo, billFrom]; BILLS = null; paint(); load("bills"); return; }
  if (d.bill) return billDrawer(d.bill);
  if (d.csv !== undefined) { if (!BILLS || !BILLS.length) return toast("No bills to download in these dates.", true); downloadCsv(); return; }

  /* menu */
  if (d.newcat !== undefined) return catDrawer(null);
  if (d.editcat) return catDrawer(d.editcat);
  if (d.delcat) { if (!confirmTap("dc", el)) return; try { await API.rpc("owner_delete_category", { p_id: d.delcat }); closeDrawer(); toast("Section deleted"); load("menu"); } catch(err){ fail(err); } return; }
  if (d.newitem !== undefined) return itemDrawer(null);
  if (d.item && !e.target.closest("[data-avail]")) return itemDrawer(d.item);
  if (d.al) { el.classList.toggle("on"); return; }
  if (d.addrow) { readItem(); IF[d.addrow].push({ name: "", price: "" }); drawItem(); return; }
  if (d.rmrow) { readItem(); const [k, n] = d.rmrow.split(":"); IF[k].splice(+n, 1); drawItem(); return; }
  if (d.photo !== undefined) { $("photoIn").click(); return; }
  if (d.rmphoto !== undefined) { readItem(); API.removePhoto(IF.photo_url); IF.photo_url = ""; drawItem(); return; }
  if (d.delitem) { if (!confirmTap("di", el)) return; try { const ph = await API.rpc("owner_delete_item", { p_id: d.delitem }); API.removePhoto(ph); closeDrawer(); toast("Dish deleted"); load("menu"); } catch(err){ fail(err); } return; }

  /* tables */
  if (d.newtable !== undefined) return tableEdit(null);
  if (d.edittable && !e.target.closest("[data-qr]")) return tableEdit(d.edittable);
  if (d.qr) { if (!TOKENS) TOKENS = await API.rpc("owner_table_tokens"); return qrDrawer(d.qr); }
  if (d.deltable) { if (!confirmTap("dt", el)) return; try { await API.rpc("owner_delete_table", { p_id: d.deltable }); closeDrawer(); toast("Table deleted"); await tick(); } catch(err){ fail(err); } return; }
  if (d.printqr !== undefined) { if (!TOKENS) TOKENS = await API.rpc("owner_table_tokens"); printQr(LIVE.tables.filter(t => t.active).map(t => t.id)); return; }
  if (d.printone) return printQr([d.printone]);
  if (d.copylink) { navigator.clipboard.writeText(d.copylink).then(() => toast("Link copied"), () => toast(d.copylink)); return; }
  if (d.newtoken) { if (!confirmTap("nt", el, "Old QR stops working — tap again")) return;
    try { const tok = await API.rpc("owner_new_token", { p_id: d.newtoken }); TOKENS[d.newtoken] = tok; qrDrawer(d.newtoken); toast("New QR code ready — print it"); } catch(err){ fail(err); } return; }

  /* settings + team */
  if (d.coverpick !== undefined) { $("coverIn").click(); return; }
  if (d.rmcover !== undefined) { const f = $("setForm"); API.removePhoto(f.cover_url.value); f.cover_url.value = ""; SET.cover_url = ""; paint(); toast("Cover removed — tap Save"); return; }
  if (d.settab) { location.hash = "settings/" + d.settab; return; }
  if (d.newstaff !== undefined) return staffDrawer(null);
  if (d.staff) return staffDrawer(d.staff);
  if (d.setpw) { const pw = $("newPw").value; try { await API.teamAdmin({ action: "password", id: d.setpw, password: pw }); toast("Password set — tell them in person"); $("newPw").value = ""; } catch(err){ fail(err); } return; }
  if (d.delstaff) { if (!confirmTap("ds", el)) return; try { await API.teamAdmin({ action: "delete", id: d.delstaff }); closeDrawer(); toast("Login deleted"); load("settings"); } catch(err){ fail(err); } return; }
});
document.addEventListener("change", async e => {
  if (e.target.id !== "coverIn") return; const f = e.target.files[0]; if (!f) return; toast("Uploading cover…");
  try { const url = await API.uploadPhoto(f, 1600); const form = $("setForm"); SET.cover_url = url;
    [...form.elements].forEach(x => { if (x.name && x.name !== "cover_url" && x.name in SET) SET[x.name] = x.type === "checkbox" ? x.checked : x.value; });
    paint(); toast("Cover added — tap Save"); } catch(err){ fail(err); }
});
document.addEventListener("input", e => { if (e.target.id === "menuQ") { menuQ = e.target.value; const pos = e.target.selectionStart; paint(); const n = $("menuQ"); n.focus(); n.setSelectionRange(pos, pos); } });
document.addEventListener("submit", async e => {
  if (e.target.id !== "setForm") return; e.preventDefault();
  const f = e.target, p = {};
  [...f.elements].forEach(x => { if (!x.name) return; p[x.name] = x.type === "checkbox" ? x.checked : x.value; });
  if ("tip_options" in p) p.tip_options = [...new Set(p.tip_options.split(/[,\s]+/).filter(Boolean).map(Number).filter(n => n >= 0 && n <= 30))].sort((a, b) => a - b);
  if ("gst_pct" in p) { p.gst_pct = +p.gst_pct; p.service_pct = +p.service_pct; }
  try { await API.rpc("owner_save_settings", { p }); toast("Saved"); SET = await API.rpc("owner_settings"); await tick(); } catch(err){ fail(err); }
});
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("drawer").hidden) closeDrawer(); });
function askText(title, ph){
  return new Promise(ok => {
    const prev = drawerFn; drawerFn = null;
    const box = document.createElement("div"); box.className = "o-card"; box.style.marginTop = "14px";
    box.innerHTML = `<b>${esc(title)}</b><input class="in" style="margin-top:8px" placeholder="${esc(ph)}"><div class="d-foot"><button class="btn ghost" data-x>Back</button><button class="btn danger" data-ok>Clear table</button></div>`;
    $("drawerBody").appendChild(box); const inp = box.querySelector("input"); inp.focus(); box.scrollIntoView({ behavior: "smooth" });
    box.querySelector("[data-x]").onclick = ev => { ev.stopPropagation(); box.remove(); drawerFn = prev; ok(""); };
    box.querySelector("[data-ok]").onclick = ev => { ev.stopPropagation(); const v = inp.value.trim(); if (v.length < 3) { toast("Write a short reason.", true); return; } drawerFn = prev; ok(v); };
  });
}
start();
