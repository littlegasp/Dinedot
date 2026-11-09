/* =========================================================
   Dinedot — guest table page (t.html?k=<table QR token>)
   Menu → dish → order → live status + Wi-Fi → call waiter → bill, split, tip, pay → review
   ========================================================= */
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const params = new URLSearchParams(location.search);
const TOKEN = params.get("k") || (API.DEMO ? "demo-T3" : "");
const CART_KEY = "dd.cart." + TOKEN;
const OS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ? "ios" : /Android/i.test(navigator.userAgent) ? "android" : "desktop";

let M = null, S = null, lastSig = "", cart = store.get(CART_KEY) || [], veg = false, q = "", sheetKind = "", tableTab = "orders";
let billForm = null, guests = 2, orderNote = "", sentCalls = {}, prevStatus = {};
const money = n => Money.fmt(n, M ? M.place.currency : "₹");

const IC = {
  bell: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
  receipt: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg>',
  search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>'
};

/* ---------------- helpers ---------------- */
function toast(msg, bad){ const t = $("toast"); t.textContent = msg; t.className = "toast on" + (bad ? " bad" : ""); clearTimeout(t._h); t._h = setTimeout(() => t.className = "toast", 3200); }
const saveCart = () => store.set(CART_KEY, cart);
const item = id => M.items.find(i => i.id === id);
const lineKey = l => l.id + "|" + (l.size || "") + "|" + (l.addons || []).slice().sort().join(",") + "|" + (l.note || "");
function unitPrice(it, size, addons){
  let p = it.price; if (it.sizes && it.sizes.length) { const s = it.sizes.find(x => x.name === size); p = s ? +s.price : +it.sizes[0].price; }
  (addons || []).forEach(a => { const x = (it.addons || []).find(y => y.name === a); if (x) p += +x.price; });
  return p;
}
const cartCount = () => cart.reduce((a, l) => a + l.qty, 0);
const cartTotal = () => cart.reduce((a, l) => { const it = item(l.id); return a + (it ? unitPrice(it, l.size, l.addons) * l.qty : 0); }, 0);
const qtyOf = id => cart.filter(l => l.id === id).reduce((a, l) => a + l.qty, 0);
const customisable = it => (it.sizes && it.sizes.length) || (it.addons && it.addons.length);
const fromPrice = it => it.sizes && it.sizes.length ? Math.min(...it.sizes.map(s => +s.price)) : +it.price;
const dietMark = d => `<i class="diet ${esc(d)}" title="${d === "veg" ? "Vegetarian" : d === "egg" ? "Contains egg" : "Non-vegetarian"}"></i>`;
const chilies = n => n ? `<span class="chili" aria-label="Spice ${n} of 5">${"🌶".repeat(Math.min(n, 3))}</span>` : "";
const photo = (it, cls) => it.photo ? `<img class="${cls}" src="${esc(it.photo)}" alt="" loading="lazy">` : `<div class="${cls} none">${esc(it.name.trim()[0] || "•")}</div>`;
const statusText = { new: "Order received", cooking: "Being cooked", ready: "Ready — on its way", served: "Served · enjoy!", cancelled: "Cancelled" };
const statusStep = { new: 0, cooking: 1, ready: 2, served: 3 };

/* ---------------- load ---------------- */
async function boot(){
  if (!TOKEN) { $("app").innerHTML = `<div class="boot"><h1>Scan the QR on your table</h1><p>This page opens from the QR code on each table.</p></div>`; return; }
  try { M = await API.rpc("guest_menu", { p_token: TOKEN }); }
  catch(e){ $("app").innerHTML = `<div class="boot"><h1>Menu unavailable</h1><p>${esc(e.message)}</p><button class="btn ghost" style="width:auto" onclick="location.reload()">Try again</button></div>`; return; }
  document.documentElement.style.setProperty("--ac", M.place.accent || "#F5A524");
  document.documentElement.style.setProperty("--ac-ink", inkFor(M.place.accent || "#F5A524"));
  document.title = M.place.name + " · " + M.table.name;
  cart = cart.filter(l => { const it = item(l.id); return it && it.available; }); saveCart();
  shell(); renderMenu(); await poll(true);
  setInterval(() => poll(), 5000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });
}
function inkFor(hex){ const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#1A1206" : "#FFFFFF"; }

async function poll(first){
  if (document.hidden && !first) return;
  try {
    const s = await API.rpc("guest_state", { p_token: TOKEN });
    const sig = JSON.stringify(s.visit) + JSON.stringify(s.last_paid);
    if (s.visit) s.visit.orders.forEach(o => { if (prevStatus[o.id] && prevStatus[o.id] !== o.status && o.status === "ready") { toast("Your food is ready — coming to your table!"); try { navigator.vibrate && navigator.vibrate([80, 60, 80]); } catch(e){} }
      prevStatus[o.id] = o.status; });
    S = s;
    if (sig !== lastSig) { lastSig = sig; renderLive(); renderDock(); refreshSheet(); }
    if (!s.visit && s.last_paid && !s.last_paid.reviewed && !store.get("dd.rated." + s.last_paid.id) && sheetKind !== "thanks") openThanks();
  } catch(e){ if (first) toast(e.message, true); }
}

/* ---------------- page ---------------- */
function shell(){
  const p = M.place;
  $("app").innerHTML = `
    ${API.DEMO ? `<div class="demo-band">Demo · <a href="t.html?k=demo-T3">T3</a> · <a href="t.html?k=demo-T5">T5</a> · <a href="staff.html" target="_blank">Open staff app ↗</a></div>` : ""}
    <header class="hero">
      <div class="hero-top"><span class="table-chip">${esc(M.table.name)}</span></div>
      <h1>${esc(p.name)}</h1>${p.tagline ? `<p>${esc(p.tagline)}</p>` : ""}
    </header>
    ${!p.accepting ? `<div class="notice closed">${esc(p.closed_message)}</div>` : p.welcome ? `<div class="notice">${esc(p.welcome)}</div>` : ""}
    <div id="live"></div>
    <div class="search" style="margin-top:14px">${IC.search}<input id="q" type="search" placeholder="Search the menu" autocomplete="off" aria-label="Search the menu"></div>
    <nav class="cats"><div class="cats-in" id="cats"></div></nav>
    <main id="menu"></main>
    <div class="dock" id="dock"></div>`;
  $("q").addEventListener("input", e => { q = e.target.value.trim().toLowerCase(); renderMenu(); });
}

function renderMenu(){
  const match = it => (!veg || it.diet === "veg") && (!q || (it.name + " " + it.desc).toLowerCase().includes(q));
  const cats = M.categories.filter(c => M.items.some(i => i.cat === c.id && match(i)));
  $("cats").innerHTML = `<button class="chip veg ${veg ? "on" : ""}" data-veg>${dietMark("veg")}Veg only</button>` +
    cats.map(c => `<button class="chip" data-cat="${c.id}">${esc(c.name)}</button>`).join("");
  $("menu").innerHTML = cats.length ? cats.map(c => {
    const list = M.items.filter(i => i.cat === c.id && match(i));
    return `<section class="sec" id="sec-${c.id}"><h2>${esc(c.name)} <small>${list.length}</small></h2>${list.map(dishRow).join("")}</section>`;
  }).join("") : `<div class="empty">No dishes match that. Try another word.</div>`;
  spy();
}
function dishRow(it){
  const n = qtyOf(it.id), cust = customisable(it);
  let btn;
  if (!it.available) btn = `<span class="add sold">SOLD OUT</span>`;
  else if (!M.place.accepting) btn = "";
  else if (n) btn = `<span class="add qty"><span data-minus="${it.id}" role="button" aria-label="Remove one">−</span><b>${n}</b><span data-plus="${it.id}" role="button" aria-label="Add one">+</span></span>`;
  else btn = `<span class="add" data-plus="${it.id}" role="button">ADD${cust ? "<small>customisable</small>" : ""}</span>`;
  return `<div class="dish ${it.available ? "" : "out"}" data-dish="${it.id}">
    <div><div class="meta">${dietMark(it.diet)}${it.best ? '<span class="tag">Bestseller</span>' : ""}${chilies(it.spice)}</div>
      <h4>${esc(it.name)}</h4><div class="price">${it.sizes && it.sizes.length ? "from " : ""}${money(fromPrice(it))}</div>
      ${it.desc ? `<p>${esc(it.desc)}</p>` : ""}</div>
    <div class="thumb">${photo(it, "ph")}${btn}</div></div>`;
}
function spy(){
  const chips = [...document.querySelectorAll("[data-cat]")];
  if (window._spy) window._spy.disconnect();
  window._spy = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) chips.forEach(c => c.classList.toggle("on", c.dataset.cat === e.target.id.slice(4))); }),
    { rootMargin: "-90px 0px -70% 0px" });
  document.querySelectorAll(".sec").forEach(s => window._spy.observe(s));
}

function activeOrders(){ return S && S.visit ? S.visit.orders.filter(o => o.status !== "cancelled") : []; }
function renderLive(){
  const el = $("live"); if (!el) return;
  const os = activeOrders();
  if (!os.length) { el.innerHTML = ""; return; }
  const pending = os.filter(o => o.status !== "served");
  const cur = pending.length ? pending.reduce((a, o) => statusStep[o.status] < statusStep[a.status] ? o : a) : os[os.length - 1];
  const st = statusStep[cur.status];
  const billing = S.visit.status === "bill";
  el.innerHTML = `<button class="live" data-open="table">
    <div class="live-row"><div><div class="kick">${billing ? "Bill requested" : os.length > 1 ? os.length + " orders · #" + cur.no : "Order #" + cur.no}</div>
      <h3>${billing ? "A waiter is bringing your bill" : esc(statusText[cur.status])}</h3></div><span class="arrow">›</span></div>
    <div class="steps">${[0, 1, 2, 3].map(i => `<span class="${i <= st ? "on" : ""} ${i === st && st < 3 ? "now" : ""}"></span>`).join("")}</div>
    <div class="step-labels">${["Received", "Cooking", "Ready", "Served"].map((l, i) => i === st ? `<b>${l}</b>` : `<span>${l}</span>`).join("")}</div></button>`;
}
function renderDock(){
  const el = $("dock"); if (!el) return;
  const n = cartCount(), orders = activeOrders().length, pendingCall = S && S.visit && S.visit.calls.length;
  el.innerHTML = (n ? `<button class="cartbar" data-open="cart"><span>${n} item${n > 1 ? "s" : ""} · ${money(cartTotal())}<small>Taxes added on the bill</small></span><span>View order →</span></button>` : "") +
    `<div class="dock-row"><button class="dock-btn" data-open="call">${IC.bell} Call waiter${pendingCall ? '<span class="badge">✓</span>' : ""}</button>
     <button class="dock-btn" data-open="table">${IC.receipt} My table${orders ? `<span class="badge">${orders}</span>` : ""}</button></div>`;
}

/* ---------------- sheets ---------------- */
function openSheet(kind, html){ sheetKind = kind; $("sheetBody").innerHTML = html; $("sheet").hidden = false; document.body.style.overflow = "hidden"; }
function closeSheet(){ $("sheet").hidden = true; sheetKind = ""; document.body.style.overflow = ""; }
function refreshSheet(){ if (sheetKind === "table") renderTable(); else if (sheetKind === "call") renderCall(); }

/* Dish */
let dishForm = null;
function openDish(id){
  const it = item(id); if (!it) return;
  dishForm = { id, qty: 1, size: it.sizes && it.sizes.length ? it.sizes[0].name : "", addons: [], note: "" };
  sheetKind = "dish"; renderDish(); $("sheet").hidden = false; document.body.style.overflow = "hidden";
}
function renderDish(){
  const it = item(dishForm.id), f = dishForm, unit = unitPrice(it, f.size, f.addons);
  $("sheetBody").innerHTML = `${photo(it, "bigph")}
    <div class="meta" style="display:flex;gap:8px;align-items:center">${dietMark(it.diet)}${it.best ? '<span class="tag">Bestseller</span>' : ""}</div>
    <h2 style="margin-top:8px">${esc(it.name)}</h2>
    <div class="sub" style="font-weight:600;color:var(--tx)">${money(unit)}</div>
    ${it.desc ? `<p class="sub">${esc(it.desc)}</p>` : ""}
    ${it.allergens && it.allergens.length ? `<div class="label">Allergens</div><div class="pills">${it.allergens.map(a => `<span class="pill al">${esc(a)}</span>`).join("")}</div>` : ""}
    ${it.spice ? `<div class="label">Spice level</div><div class="meter">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= it.spice ? "on" : ""}"></i>`).join("")}</div>` : ""}
    ${it.sizes && it.sizes.length ? `<div class="label">Size</div><div class="seg">${it.sizes.map(s => `<button class="opt ${f.size === s.name ? "on" : ""}" data-size="${esc(s.name)}">${esc(s.name)}<small>${money(s.price)}</small></button>`).join("")}</div>` : ""}
    ${it.addons && it.addons.length ? `<div class="label">Extras</div>${it.addons.map(a => `<button class="check ${f.addons.includes(a.name) ? "on" : ""}" data-addon="${esc(a.name)}"><i class="box"></i><span>${esc(a.name)}</span><em>+${money(a.price)}</em></button>`).join("")}` : ""}
    <div class="label">Note for the kitchen</div>
    <textarea id="dishNote" rows="2" maxlength="200" placeholder="e.g. less oil, no onion">${esc(f.note)}</textarea>
    ${it.available && M.place.accepting ? `<div class="row-end"><div class="stepper"><button data-dq="-1" aria-label="Less">−</button><b>${f.qty}</b><button data-dq="1" aria-label="More">+</button></div>
      <button class="btn" data-addcart>Add · ${money(unit * f.qty)}</button></div>` : `<div class="row-end"><button class="btn ghost" data-close>${it.available ? "Ordering is closed" : "Sold out right now"}</button></div>`}`;
  const ta = $("dishNote"); if (ta) ta.addEventListener("input", e => dishForm.note = e.target.value);
}
function addToCart(l){
  const k = lineKey(l), ex = cart.find(x => lineKey(x) === k);
  if (ex) ex.qty = Math.min(50, ex.qty + l.qty); else cart.push(l);
  saveCart(); renderMenu(); renderDock();
}
function minusOne(id){
  for (let i = cart.length - 1; i >= 0; i--) if (cart[i].id === id) { cart[i].qty--; if (cart[i].qty <= 0) cart.splice(i, 1); break; }
  saveCart(); renderMenu(); renderDock(); if (sheetKind === "cart") cart.length ? renderCart() : closeSheet();
}

/* Cart */
function renderCart(){
  const first = !activeOrders().length;
  openSheet("cart", `<h2>Your order</h2><p class="sub">${esc(M.table.name)} · goes straight to the kitchen</p>
    <div style="margin-top:10px">${cart.map((l, i) => { const it = item(l.id); if (!it) return "";
      return `<div class="line">${dietMark(it.diet)}<div class="nm">${esc(it.name)}<small>${[l.size, ...(l.addons || [])].filter(Boolean).map(esc).join(" · ")}${l.note ? " · “" + esc(l.note) + "”" : ""}</small>
        <div class="stepper sm" style="margin-top:8px"><button data-cq="${i}:-1">−</button><b>${l.qty}</b><button data-cq="${i}:1">+</button></div></div>
        <div class="amt">${money(unitPrice(it, l.size, l.addons) * l.qty)}</div></div>`; }).join("")}</div>
    <div class="totals"><div class="grand"><span>Item total</span><span>${money(cartTotal())}</span></div></div>
    <p class="hint">${M.place.gst_pct ? "GST " + M.place.gst_pct + "% " : ""}${M.place.service_pct ? "and service " + M.place.service_pct + "% " : ""}${M.place.gst_pct || M.place.service_pct ? "added on the bill. " : ""}You pay at the end.</p>
    ${first ? `<div class="label">How many at the table?</div><div class="stepper"><button data-g="-1">−</button><b id="gN">${guests}</b><button data-g="1">+</button></div>` : ""}
    <div class="label">Anything else for the kitchen?</div>
    <textarea id="oNote" rows="2" maxlength="300" placeholder="Allergies, timing, ‘starters first’…">${esc(orderNote)}</textarea>
    <div class="row-end"><button class="btn" id="placeBtn" data-place>Place order · ${money(cartTotal())}</button></div>`);
  $("oNote").addEventListener("input", e => orderNote = e.target.value);
}
async function placeOrder(){
  const b = $("placeBtn"); b.disabled = true; b.textContent = "Sending to the kitchen…";
  try {
    const first = !activeOrders().length;
    await API.rpc("guest_order", { p_token: TOKEN, p_items: cart.map(l => ({ id: l.id, qty: l.qty, size: l.size || "", addons: l.addons || [], note: l.note || "" })),
      p_note: orderNote, p_guests: first ? guests : null });
    cart = []; orderNote = ""; saveCart(); renderMenu();
    await poll(true); lastSig = ""; await poll();
    confetti(); tableTab = "orders"; renderTable(); toast("Order sent to the kitchen!");
  } catch(e){ toast(e.message, true); b.disabled = false; b.textContent = "Place order · " + money(cartTotal()); }
}

/* My table: orders + Wi-Fi, bill */
function renderTable(){
  const v = S && S.visit;
  const head = `<h2>${esc(M.table.name)}</h2><p class="sub">${esc(M.place.name)}</p>
    <div class="tabs"><button class="${tableTab === "orders" ? "on" : ""}" data-tab="orders">Orders</button><button class="${tableTab === "bill" ? "on" : ""}" data-tab="bill">Bill</button></div>`;
  if (!v) { openSheet("table", head + `<div class="empty">Nothing ordered yet.<br>Pick dishes from the menu and they'll show up here.</div><button class="btn ghost" data-close>Back to the menu</button>`); return; }
  let body = "";
  if (tableTab === "orders") {
    body = v.orders.slice().reverse().map(o => `<div class="card"><div class="order-head"><b>#${o.no} · ${new Date(o.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</b>
        <span class="status st-${o.status}">${esc(o.status === "new" ? "received" : o.status)}</span></div>
        ${o.items.map(i => `<div class="line" style="grid-template-columns:auto 1fr auto">${dietMark(i.diet)}<div class="nm">${i.qty} × ${esc(i.name)}<small>${[i.size, ...(i.addons || [])].filter(Boolean).map(esc).join(" · ")}</small></div><div class="amt">${money(i.amount)}</div></div>`).join("")}
        ${o.status === "cancelled" && o.cancel_reason ? `<p class="mini">${esc(o.cancel_reason)}</p>` : ""}</div>`).join("");
    if (v.wifi) body = `<div class="card"><div class="kick" style="margin-bottom:10px">While you wait · Guest Wi-Fi</div><div class="wifi">
        <span class="k">Network</span><span class="v">${esc(v.wifi.name)}</span><span class="k">Password</span><span class="v">${esc(v.wifi.password)}</span>
        ${v.wifi.password ? `<button class="btn" data-copy="${esc(v.wifi.password)}">Copy password</button>` : ""}</div></div>` + body;
    body += `<div class="row-end"><button class="btn ghost" data-close>Order more</button><button class="btn" data-tab="bill">See the bill</button></div>`;
  } else body = billHtml(v);
  openSheet("table", head + body);
}
function billHtml(v){
  const p = M.place, b0 = v.bill;
  if (!billForm || billForm.visit !== v.id) billForm = { visit: v.id, split: v.split || 1, tip: v.tip_pct || 0, pay: v.pay_choice || (p.pay.upi ? "upi" : p.pay.cash ? "cash" : "card"), edit: false };
  const f = billForm, asked = v.status === "bill" && !f.edit;
  const b = asked ? b0 : Money.bill(b0.lines, p, f.tip, f.split);
  const pending = v.orders.some(o => o.status === "new" || o.status === "cooking");
  let h = `<div style="margin-top:8px">${b.lines.map(l => `<div class="line" style="grid-template-columns:1fr auto"><div class="nm">${l.qty} × ${esc(l.name)}<small>${[l.size, ...(l.addons || [])].filter(Boolean).map(esc).join(" · ")}</small></div><div class="amt">${money(l.amount)}</div></div>`).join("")}</div>
    <div class="totals"><div><span>Item total</span><span>${money(b.subtotal)}</span></div>
      ${b.service ? `<div><span>Service charge ${b.service_pct}%</span><span>${money(b.service)}</span></div>` : ""}
      ${b.gst ? `<div><span>GST ${b.gst_pct}%</span><span>${money(b.gst)}</span></div>` : ""}
      ${b.tip ? `<div><span>Tip ${b.tip_pct}%</span><span>${money(b.tip)}</span></div>` : ""}
      <div class="grand"><span>Total</span><span>${money(b.grand)}</span></div>
      ${b.split > 1 ? `<div class="each"><span>Split ${b.split} ways</span><span>${money(b.each)} each</span></div>` : ""}</div>`;
  if (!asked) {
    h += `<div class="label">Split the bill</div><div class="seg">${[1, 2, 3, 4].map(n => `<button class="opt ${f.split === n ? "on" : ""}" data-split="${n}">${n === 1 ? "Whole" : n + " ways"}</button>`).join("")}
        <div class="stepper sm" style="margin-left:auto"><button data-splitn="-1">−</button><b>${f.split}</b><button data-splitn="1">+</button></div></div>
      ${(p.tips || []).length > 1 ? `<div class="label">Add a tip for the team</div><div class="seg">${p.tips.map(t => `<button class="opt ${f.tip === t ? "on" : ""}" data-tip="${t}">${t ? t + "%" : "No tip"}</button>`).join("")}</div>` : ""}
      <div class="label">Pay with</div><div class="seg">${[["upi", "UPI"], ["cash", "Cash"], ["card", "Card"]].filter(([k]) => p.pay[k]).map(([k, n]) => `<button class="opt ${f.pay === k ? "on" : ""}" data-pay="${k}">${n}</button>`).join("")}</div>
      ${pending ? `<p class="hint">Some dishes are still being made — you can ask for the bill now, it'll come once they're served.</p>` : ""}
      <div class="row-end"><button class="btn" data-askbill ${b.subtotal ? "" : "disabled"}>Ask for the bill${b.split > 1 ? " · " + money(b.each) + " each" : " · " + money(b.grand)}</button></div>`;
  } else {
    h += `<div class="card" style="text-align:center"><div class="kick">Bill requested</div><h3 style="font:700 19px var(--fd);margin-top:4px">A waiter is on the way</h3>
      <p class="mini">You chose ${v.pay_choice === "upi" ? "UPI" : v.pay_choice === "card" ? "card" : "cash"}${v.split > 1 ? ", split " + v.split + " ways" : ""}.</p></div>`;
    if (v.pay_choice === "upi" && v.upi) h += upiHtml(b.each, v.upi);
    h += `<div class="row-end"><button class="btn ghost" data-editbill>Change split, tip or payment</button></div>`;
  }
  return h;
}
function upiHtml(amount, upi){
  const qs = "pa=" + encodeURIComponent(upi.id) + "&pn=" + encodeURIComponent(upi.name) + "&am=" + amount + "&cu=INR&tn=" + encodeURIComponent(M.table.name + " bill");
  const intent = pkg => "intent://pay?" + qs + "#Intent;scheme=upi;package=" + pkg + ";end";
  const apps = [["Google Pay", "tez://upi/pay?" + qs, intent("com.google.android.apps.nbu.paisa.user")], ["PhonePe", "phonepe://pay?" + qs, intent("com.phonepe.app")],
    ["Paytm", "paytmmp://pay?" + qs, intent("net.one97.paytm")], ["Other UPI app", "upi://pay?" + qs, "upi://pay?" + qs]];
  let h = `<div class="card"><div class="kick">Pay ${money(amount)}${billForm && billForm.split > 1 ? " (your share)" : ""} by UPI</div>`;
  if (OS === "desktop") {
    let svg = ""; try { const qr = qrcode(0, "M"); qr.addData("upi://pay?" + qs); qr.make(); svg = qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true }); } catch(e){}
    h += `<div class="qr">${svg}</div><p class="mini" style="text-align:center">Scan with any UPI app · ${esc(upi.id)}</p>`;
  } else h += `<div class="pay-apps">${apps.map(a => `<a class="${a[0] === "Other UPI app" ? "alt" : ""}" ${API.DEMO ? 'data-demopay href="#"' : `href="${esc(OS === "ios" ? a[1] : a[2])}"`}>${a[0]}</a>`).join("")}</div>`;
  return h + `<p class="mini">After paying, show the waiter your payment screen. They'll close the table.</p></div>`;
}
async function askBill(){
  const f = billForm;
  try { await API.rpc("guest_bill", { p_token: TOKEN, p_split: f.split, p_tip_pct: f.tip, p_pay: f.pay }); f.edit = false; lastSig = ""; await poll(); toast("Bill requested — a waiter is coming."); }
  catch(e){ toast(e.message, true); }
}

/* Call waiter */
function renderCall(){
  const calls = (S && S.visit ? S.visit.calls : []);
  const has = k => calls.find(c => c.kind === k) || (sentCalls[k] && Date.now() - sentCalls[k] < 120e3 ? { seen: false } : null);
  const w = has("waiter");
  openSheet("call", `<h2 style="text-align:center">${esc(M.table.name)}</h2><p class="sub" style="text-align:center">Need something? We're here.</p>
    <div class="callwrap"><button class="callbtn ${w ? "sent" : ""}" data-call="waiter" style="margin-top:18px">${w ? (w.seen ? "On the<br>way" : "Called") : "Call<br>waiter"}</button>
      ${w ? `<span class="okpill">✓ ${w.seen ? "A waiter has seen it and is coming" : "Waiter notified"}</span>` : ""}</div>
    <div class="quick">${[["water", "Water"], ["bill", "Bill"], ["help", "Help"]].map(([k, n]) => { const c = has(k);
      return `<button class="${c ? "sent" : ""}" data-call="${k}">${c ? "✓ " : ""}${n}</button>`; }).join("")}</div>
    <button class="btn ghost" data-close style="margin-top:16px">Close</button>`);
}
async function call(kind){
  if (kind === "bill" && S && S.visit && activeOrders().length) { tableTab = "bill"; renderTable(); return; }
  try { const r = await API.rpc("guest_call", { p_token: TOKEN, p_kind: kind }); sentCalls[kind] = Date.now();
    toast(r.already ? "Already on it — a waiter is coming." : kind === "water" ? "Water is on its way." : "Waiter notified."); lastSig = ""; await poll(); renderCall(); }
  catch(e){ toast(e.message, true); }
}

/* Thanks + review */
let stars = 0;
function openThanks(){
  const lp = S.last_paid; stars = 0;
  openSheet("thanks", `<div class="thanks"><div class="tick">✓</div><h2>Paid — thank you!</h2><p class="sub">${money(lp.total)} · ${esc(M.place.name)}</p>
    <div class="label" style="margin-top:22px">How was everything?</div><div class="stars" id="stars">${[1, 2, 3, 4, 5].map(i => `<button data-star="${i}" aria-label="${i} stars">★</button>`).join("")}</div>
    <div id="revMore"></div><button class="btn ghost" data-skiprev style="margin-top:14px">Not now</button></div>`);
}
function renderStars(){
  document.querySelectorAll("[data-star]").forEach(b => b.classList.toggle("on", +b.dataset.star <= stars));
  $("revMore").innerHTML = `<textarea id="revText" rows="3" maxlength="600" style="margin-top:16px" placeholder="${stars >= 4 ? "What did you love? (optional)" : "What could we do better? Only the team sees this."}"></textarea>
    <button class="btn" data-sendrev style="margin-top:10px">Send</button>`;
}
async function sendReview(){
  const lp = S.last_paid;
  try { await API.rpc("guest_review", { p_token: TOKEN, p_visit: lp.id, p_stars: stars, p_comment: ($("revText") || {}).value || "" });
    store.set("dd.rated." + lp.id, 1);
    const url = M.place.review_url;
    openSheet("thanks", `<div class="thanks"><div class="tick">♥</div><h2>Thanks for the feedback</h2>
      ${stars >= 4 && url ? `<p class="sub">Would you share it on Google? It really helps a small restaurant.</p><a class="btn" style="margin-top:18px;text-decoration:none" href="${esc(url)}" target="_blank" rel="noopener">Post on Google</a>` : `<p class="sub">The team will read every word.</p>`}
      <button class="btn ghost" data-close style="margin-top:10px">Done</button></div>`);
  } catch(e){ toast(e.message, true); }
}

/* Confetti on a placed order */
function confetti(){
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const c = document.createElement("canvas"); c.className = "confetti"; c.width = innerWidth; c.height = innerHeight; document.body.appendChild(c);
  const x = c.getContext("2d"), ac = getComputedStyle(document.documentElement).getPropertyValue("--ac").trim() || "#F5A524";
  const bits = Array.from({ length: 90 }, () => ({ x: innerWidth / 2, y: innerHeight * .7, vx: (Math.random() - .5) * 13, vy: -Math.random() * 15 - 5, r: Math.random() * 6 + 3,
    c: [ac, "#F4F1EA", "#34C77B", "#D9473F"][Math.floor(Math.random() * 4)], a: Math.random() * 6 }));
  let t = 0; (function f(){ x.clearRect(0, 0, c.width, c.height); bits.forEach(b => { b.x += b.vx; b.y += b.vy; b.vy += .45; b.a += .2; x.save(); x.translate(b.x, b.y); x.rotate(b.a); x.fillStyle = b.c; x.fillRect(-b.r / 2, -b.r / 4, b.r, b.r / 2); x.restore(); });
    if (++t < 90) requestAnimationFrame(f); else c.remove(); })();
}

/* ---------------- clicks ---------------- */
document.addEventListener("click", e => {
  if (e.target.closest("[data-close]")) { if (sheetKind === "thanks" && S && S.last_paid) store.set("dd.rated." + S.last_paid.id, 1); closeSheet(); return; }
  const t = e.target.closest("button, [data-plus], [data-minus], [data-dish], a[data-demopay]"); if (!t) return;
  const d = t.dataset;
  if (d.plus) { e.stopPropagation(); const it = item(d.plus); if (customisable(it)) openDish(it.id); else addToCart({ id: it.id, qty: 1, size: "", addons: [], note: "" }); return; }
  if (d.minus) { e.stopPropagation(); minusOne(d.minus); return; }
  if (d.dish) { openDish(d.dish); return; }
  if (d.veg !== undefined) { veg = !veg; renderMenu(); return; }
  if (d.cat) { const s = $("sec-" + d.cat); if (s) scrollTo({ top: s.getBoundingClientRect().top + scrollY - 56, behavior: "smooth" }); return; }
  if (d.open === "cart") { if (cart.length) renderCart(); return; }
  if (d.open === "table") { tableTab = "orders"; renderTable(); return; }
  if (d.open === "call") { renderCall(); return; }
  if (d.size) { dishForm.size = d.size; renderDish(); return; }
  if (d.addon) { const a = dishForm.addons, i = a.indexOf(d.addon); i < 0 ? a.push(d.addon) : a.splice(i, 1); renderDish(); return; }
  if (d.dq) { dishForm.qty = Math.max(1, Math.min(20, dishForm.qty + +d.dq)); renderDish(); return; }
  if (d.addcart !== undefined) { addToCart({ id: dishForm.id, qty: dishForm.qty, size: dishForm.size, addons: dishForm.addons.slice(), note: dishForm.note.trim() }); closeSheet(); toast("Added to your order"); return; }
  if (d.cq) { const [i, dd] = d.cq.split(":").map(Number); cart[i].qty += dd; if (cart[i].qty <= 0) cart.splice(i, 1); else cart[i].qty = Math.min(50, cart[i].qty);
    saveCart(); renderMenu(); renderDock(); cart.length ? renderCart() : closeSheet(); return; }
  if (d.g) { guests = Math.max(1, Math.min(40, guests + +d.g)); $("gN").textContent = guests; return; }
  if (d.place !== undefined) { placeOrder(); return; }
  if (d.tab) { tableTab = d.tab; renderTable(); return; }
  if (d.copy) { (navigator.clipboard ? navigator.clipboard.writeText(d.copy) : Promise.reject()).then(() => toast("Password copied")).catch(() => toast("Password: " + d.copy)); return; }
  if (d.split) { billForm.split = +d.split; renderTable(); return; }
  if (d.splitn) { billForm.split = Math.max(1, Math.min(20, billForm.split + +d.splitn)); renderTable(); return; }
  if (d.tip !== undefined) { billForm.tip = +d.tip; renderTable(); return; }
  if (d.pay) { billForm.pay = d.pay; renderTable(); return; }
  if (d.askbill !== undefined) { askBill(); return; }
  if (d.editbill !== undefined) { billForm.edit = true; renderTable(); return; }
  if (d.demopay !== undefined) { e.preventDefault(); toast("Demo: your UPI app would open here with the amount filled in."); return; }
  if (d.call) { call(d.call); return; }
  if (d.star) { stars = +d.star; renderStars(); return; }
  if (d.sendrev !== undefined) { sendReview(); return; }
  if (d.skiprev !== undefined) { store.set("dd.rated." + S.last_paid.id, 1); closeSheet(); return; }
});
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("sheet").hidden) closeSheet(); });
boot();
