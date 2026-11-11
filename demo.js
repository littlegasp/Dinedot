/* =========================================================
   Dinedot — built-in demo. Runs the same functions as the database, in this browser only,
   so a restaurant can try the guest page and the staff app side by side before setup.
   Data is kept in localStorage ("dd.demo") and shared between tabs of the same browser.
   When no staff tab is open, a pretend kitchen moves orders along by itself.
   ========================================================= */
const Demo = (() => {
  const KEY = "dd.demo.v4", HB = "dd.demo.hb", WHO = "dd.demo.user";
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "d" + Math.random().toString(36).slice(2) + Date.now().toString(36));
  const now = () => new Date().toISOString();
  const ago = s => new Date(Date.now() - s * 1000).toISOString();
  const err = m => { const e = new Error(m); throw e; };
  const clone = o => JSON.parse(JSON.stringify(o));
  const dayKey = d => { const x = new Date(d); return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0"); };

  const TEAM = [
    { id: "u-owner", name: "Meera", email: "owner@demo", role: "owner" },
    { id: "u-manager", name: "Sana", email: "manager@demo", role: "manager" },
    { id: "u-cashier", name: "Tara", email: "cashier@demo", role: "cashier" },
    { id: "u-waiter", name: "Ravi", email: "waiter@demo", role: "waiter" },
    { id: "u-kitchen", name: "Chef Imran", email: "kitchen@demo", role: "kitchen" }
  ];

  /* ---------- seed ---------- */
  function seed(){
    let r = 7; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
    const pick = a => a[Math.floor(rnd() * a.length)];
    const cats = ["Starters", "Mains", "Breads & Rice", "Drinks", "Desserts"].map((n, i) => ({ id: "c" + (i + 1), name: n, sort: i + 1, active: true,
      station: ["Tandoor", "Curry", "Tandoor", "Bar", "Bar"][i] }));
    const I = (c, name, description, price, diet, spice, allergens, sizes, addons, best) =>
      ({ id: uid(), category_id: c, name, description, price, diet, spice, allergens, sizes: sizes || [], addons: addons || [], photo_url: "",
         bestseller: !!best, available: true, sort: 0, station: "", created_at: now() });
    const items = [
      I("c1", "Paneer Tikka", "Charred cottage cheese, peppers and onion, mint chutney", 290, "veg", 2, ["Dairy"], [], [{ name: "Extra chutney", price: 20 }], true),
      I("c1", "Chicken Seekh Kebab", "Minced chicken, ginger and green chilli, off the grill", 340, "nonveg", 3, [], [], []),
      I("c1", "Crispy Corn", "Sweetcorn tossed with pepper, garlic and spring onion", 220, "veg", 1, [], [], []),
      I("c1", "Tandoori Prawns", "Ajwain-marinated prawns, lemon and onion rings", 520, "nonveg", 2, ["Shellfish", "Dairy"], [], []),
      I("c2", "Chicken Karahi", "Slow-cooked with tomato, ginger and green chilli", 420, "nonveg", 3, ["Dairy"], [{ name: "Half", price: 260 }, { name: "Full", price: 420 }], [], true),
      I("c2", "Dal Makhani", "Black lentils simmered overnight with butter and cream", 280, "veg", 1, ["Dairy"], [], [{ name: "Extra butter", price: 30 }], true),
      I("c2", "Egg Curry", "Boiled eggs in onion-tomato masala", 240, "egg", 2, [], [], []),
      I("c2", "Paneer Butter Masala", "Soft paneer in a mild, creamy tomato gravy", 320, "veg", 1, ["Dairy", "Nuts"], [{ name: "Half", price: 200 }, { name: "Full", price: 320 }], []),
      I("c2", "Mutton Rogan Josh", "Kashmiri chilli, fennel and slow-cooked mutton", 480, "nonveg", 4, [], [], []),
      I("c3", "Butter Naan", "Tandoor-baked, brushed with butter", 60, "veg", null, ["Gluten", "Dairy"], [], [{ name: "Garlic", price: 15 }, { name: "Cheese", price: 40 }]),
      I("c3", "Tandoori Roti", "Whole-wheat, from the clay oven", 30, "veg", null, ["Gluten"], [], []),
      I("c3", "Jeera Rice", "Basmati with cumin and ghee", 180, "veg", null, ["Dairy"], [], []),
      I("c3", "Chicken Biryani", "Dum-cooked basmati, saffron, fried onion, raita", 380, "nonveg", 2, ["Dairy"], [], [{ name: "Extra raita", price: 40 }], true),
      I("c4", "Mint Lemonade", "Fresh lime, mint and soda", 120, "veg", null, [], [{ name: "Glass", price: 120 }, { name: "Jug", price: 320 }], []),
      I("c4", "Masala Chaas", "Spiced buttermilk", 90, "veg", null, ["Dairy"], [], []),
      I("c4", "Cutting Chai", "Strong, sweet, ginger and cardamom", 40, "veg", null, ["Dairy"], [], []),
      I("c5", "Gulab Jamun", "Two warm dumplings in rose syrup", 140, "veg", null, ["Dairy", "Gluten", "Nuts"], [], [{ name: "Vanilla scoop", price: 60 }]),
      I("c5", "Kulfi Falooda", "Malai kulfi, vermicelli, basil seeds, rose", 180, "veg", null, ["Dairy", "Nuts"], [], [])
    ];
    items.forEach((x, i) => { x.sort = i + 1; x.photo_url = "img/menu/" + x.name.toLowerCase().replace(/[^a-z]+/g, "-") + ".jpg"; });
    items.find(x => x.name === "Tandoori Prawns").available = false;
    ["Chicken Biryani", "Jeera Rice"].forEach(n => { items.find(x => x.name === n).station = "Curry"; });
    const tables = ["T1","T2","T3","T4","T5","T6","T7","T8"].map((c, i) => ({ id: "t" + (i + 1), code: c, name: "", area: i < 6 ? "Main" : "Terrace",
      seats: [4, 4, 2, 6, 4, 4, 2, 8][i], sort: i + 1, active: true, token: "demo-" + c }));
    const settings = { restaurant_name: "The Copper Pot", tagline: "North Indian kitchen & grill", currency: "₹", accent: "#F5A524",
      accepting_orders: true, closed_message: "The kitchen is closed right now. Please ask a waiter.",
      wifi_name: "CopperPot-Guest", wifi_password: "welcome123", upi_id: "yourrestaurant@upi", upi_name: "The Copper Pot",
      gst_pct: 5, service_pct: 0, tip_options: [0, 5, 10], pay_cash: true, pay_card: true, pay_upi: true,
      google_review_url: "https://www.google.com/maps", welcome_note: "Order from your phone — we'll bring it to your table.", cover_url: "img/cover.jpg",
      stations: ["Tandoor", "Curry", "Bar"], max_discount_pct: 20, team_notice: "", team_notice_at: null, team_notice_by: "",
      legal_name: "Copper Pot Foods LLP", bill_address: "Shop 4, Saki Vihar Road, Andheri East, Mumbai 400072", gstin: "27ABCDE1234F1Z5",
      fssai: "11521998000123", sac: "996331", gst_composition: false, invoice_prefix: "CP", bill_footer: "Thank you! Please visit again.", receipt_width: 80,
      updated_at: now() };
    const db = { settings, categories: cats, items, tables, visits: [], orders: [], calls: [], reviews: [], activity: [], payments: [], closes: [], no: 100, oi: 0, token: 0, token_day: "",
      staff: TEAM.map(t => Object.assign({ phone: "", active: true, created_at: ago(86400 * 60) }, t)) };

    // 21 days of history for the dashboard
    const comments = ["Lovely karahi!", "Quick service, will come back", "Naan was a bit cold", "Best dal in the area", "", "", "Great biryani", "Loved the QR ordering"];
    for (let d = 21; d >= 0; d--) {
      const base = new Date(); base.setHours(0, 0, 0, 0); base.setDate(base.getDate() - d);
      const count = d === 0 ? 9 : 14 + Math.floor(rnd() * 16);
      for (let k = 0; k < count; k++) {
        const hour = pick([12, 13, 13, 14, 15, 19, 20, 20, 21, 21, 22]);
        const open = new Date(base.getTime() + hour * 3600e3 + Math.floor(rnd() * 3400) * 1000);
        if (open > new Date(Date.now() - 3600e3)) continue;
        const t = pick(tables), guests = 1 + Math.floor(rnd() * 5);
        const v = { id: uid(), table_id: t.id, kind: "dine_in", token_no: null, opened_at: open.toISOString(), status: "paid", guests, split: 1, tip_pct: pick([0, 0, 5, 10]),
          pay_choice: "", bill_at: null, paid_at: new Date(open.getTime() + (35 + rnd() * 50) * 60e3).toISOString(), paid_method: pick(["upi", "upi", "upi", "cash", "card"]),
          paid_by: "u-waiter", void_reason: "" };
        const o = { id: uid(), no: ++db.no, visit_id: v.id, table_id: t.id, source: "guest", created_by: null, status: "served", note: "",
          created_at: open.toISOString(), started_at: new Date(open.getTime() + 90e3).toISOString(),
          ready_at: new Date(open.getTime() + (9 + rnd() * 14) * 60e3).toISOString(), served_at: new Date(open.getTime() + 20 * 60e3).toISOString(), cancel_reason: "", items: [] };
        const n = 2 + Math.floor(rnd() * 4);
        for (let j = 0; j < n; j++) { const it = pick(items.filter(x => x.name !== "Tandoori Prawns")); const size = it.sizes.length ? pick(it.sizes) : null;
          const qty = it.category_id === "c3" ? 1 + Math.floor(rnd() * 4) : 1; const unit = size ? size.price : it.price;
          o.items.push({ id: ++db.oi, item_id: it.id, name: it.name, size: size ? size.name : "", addons: [], diet: it.diet, qty, unit_price: unit, line_total: unit * qty, note: "",
            station: stationOf(it, cats), done_at: o.ready_at }); }
        db.visits.push(v); db.orders.push(o);
        Object.assign(v, freeze(db, v));
        db.payments.push({ id: uid(), visit_id: v.id, method: v.paid_method, amount: v.total, reference: "", status: "captured", created_by: "u-waiter", created_at: v.paid_at });
        if (rnd() < .35) db.reviews.push({ id: uid(), visit_id: v.id, table_id: t.id, stars: pick([5, 5, 5, 4, 4, 3]), comment: pick(comments), created_at: v.paid_at });
      }
    }
    // A few tables busy right now
    const live = (code, mins, lines, status, extra) => {
      const t = tables.find(x => x.code === code);
      const v = Object.assign({ id: uid(), table_id: t.id, kind: "dine_in", token_no: null, opened_at: ago(mins * 60), status: "open", guests: 2, split: 1, tip_pct: 0, pay_choice: "",
        bill_at: null, paid_at: null, paid_method: null, paid_by: null, void_reason: "", subtotal: 0, service: 0, gst: 0, tip: 0, total: 0 }, extra || {});
      db.visits.push(v);
      const o = { id: uid(), no: ++db.no, visit_id: v.id, table_id: t.id, source: "guest", created_by: null, status, note: "",
        created_at: ago(mins * 60), started_at: status !== "new" ? ago(mins * 60 - 60) : null, ready_at: ["ready", "served"].includes(status) ? ago(60) : null,
        served_at: status === "served" ? ago(30) : null, cancel_reason: "", items: [] };
      lines.forEach(([name, qty, size]) => { const it = items.find(x => x.name === name); const unit = size ? it.sizes.find(s => s.name === size).price : it.price;
        o.items.push({ id: ++db.oi, item_id: it.id, name, size: size || "", addons: [], diet: it.diet, qty, unit_price: unit, line_total: unit * qty, note: "",
          station: stationOf(it, cats), done_at: ["ready", "served"].includes(status) ? ago(60) : null }); });
      db.orders.push(o); return v;
    };
    live("T1", 6, [["Paneer Tikka", 1], ["Mint Lemonade", 2, "Glass"]], "new");
    live("T2", 14, [["Chicken Karahi", 1, "Full"], ["Butter Naan", 4]], "cooking", { guests: 3 });
    const v6 = live("T6", 31, [["Chicken Biryani", 2], ["Masala Chaas", 2]], "ready", { guests: 2 });
    db.calls.push({ id: uid(), table_id: "t6", visit_id: v6.id, kind: "water", created_at: ago(70), seen_at: null, seen_by: null, done_at: null });
    live("T4", 52, [["Dal Makhani", 1], ["Paneer Butter Masala", 1, "Full"], ["Jeera Rice", 1], ["Butter Naan", 3]], "served",
      { guests: 4, status: "bill", bill_at: ago(90), split: 2, tip_pct: 10, pay_choice: "upi" });
    const v4 = db.visits.find(v => v.status === "bill");
    db.calls.push({ id: uid(), table_id: v4.table_id, visit_id: v4.id, kind: "bill", created_at: ago(90), seen_at: null, seen_by: null, done_at: null });
    // invoice numbers for the paid history, in the order the bills were paid
    db.visits.filter(v => v.status === "paid").sort((a, b) => a.paid_at < b.paid_at ? -1 : 1).forEach(v => { v.invoice_no = nextInvoice(db, v.paid_at); });
    db.born = now();   // the pretend kitchen leaves the seeded tables alone
    return db;
  }

  /* ---------- storage ---------- */
  let db = null;   // created on first use, so a real (Supabase) setup never seeds anything
  function save(){ store.set(KEY, db); }
  function load(){ const x = store.get(KEY); if (x && x.settings) db = x; else if (!db) { db = seed(); save(); } }

  /* ---------- helpers (mirror the SQL) ---------- */
  /* Financial year code (2627 = Apr 2026–Mar 2027) and the next invoice number, same as 0006 */
  function fyCode(d){ const x = new Date(d); const y = x.getFullYear() - (x.getMonth() < 3 ? 1 : 0); return String(y % 100).padStart(2, "0") + String((y + 1) % 100).padStart(2, "0"); }
  function nextInvoice(d, at){ const fy = fyCode(at || new Date()); d.inv_no = d.inv_fy === fy ? (d.inv_no || 0) + 1 : 1; d.inv_fy = fy;
    return (d.settings.invoice_prefix || "") + fy + "-" + String(d.inv_no).padStart(4, "0"); }
  function receiptJson(vid){ const v = db.visits.find(x => x.id === vid); if (!v) return null; const s = db.settings, b = bill(vid);
    const g = Number(b.gst || 0), c = Math.round(g / 2 * 100) / 100;
    return { place: { name: s.restaurant_name, legal_name: s.legal_name || s.restaurant_name, address: s.bill_address || "", gstin: s.gstin || "", fssai: s.fssai || "",
        sac: s.sac || "996331", composition: !!s.gst_composition, footer: s.bill_footer || "", width: s.receipt_width || 80, currency: s.currency },
      status: v.status, invoice_no: v.invoice_no || null, at: v.paid_at || now(), opened_at: v.opened_at, label: label(v), kind: v.kind || "dine_in", guests: v.guests,
      by: (db.staff.find(x => x.id === v.paid_by) || {}).name || null,
      lines: b.lines.map(l => Object.assign({}, l, { unit: Math.round(l.amount / l.qty * 100) / 100 })), bill: b,
      taxable: r2(b.subtotal - (b.discount || 0) + (b.service || 0)), cgst: c, sgst: Math.round((g - c) * 100) / 100,
      payments: (db.payments || []).filter(p => p.visit_id === vid).map(p => ({ method: p.method, amount: p.amount, reference: p.reference })) }; }
  function stationOf(it, cats){ return it.station || (cats.find(c => c.id === it.category_id) || {}).station || ""; }
  const today = () => dayKey(new Date());
  const dayClosed = d => (db.closes || []).some(c => c.day === (d || today()));
  const label = v => v.table_id ? (db.tables.find(t => t.id === v.table_id) || {}).code : "Token " + v.token_no;
  const discOf = v => v.discount_kind ? { kind: v.discount_kind, value: v.discount_value, reason: v.discount_reason } : null;
  const orderOpen = (o, cancel) => { const v = db.visits.find(x => x.id === o.visit_id) || {};
    return ["open", "bill"].includes(v.status) || (v.status === "paid" && v.kind === "takeaway" && !cancel); };
  const r2 = n => Math.round(n * 100) / 100;
  const myName = () => (me() || {}).name || "";
  const tableBy = token => { const t = db.tables.find(x => x.token === token && x.active); if (!t) err("This QR code isn't active. Please ask a waiter."); return t; };
  const openVisit = tid => db.visits.find(v => v.table_id === tid && (v.status === "open" || v.status === "bill"));
  const orderJson = o => ({ id: o.id, no: o.no, status: o.status, source: o.source, note: o.note, created_at: o.created_at, started_at: o.started_at,
    ready_at: o.ready_at, served_at: o.served_at, cancel_reason: o.cancel_reason,
    items: o.items.map(i => ({ id: i.id, name: i.name, size: i.size, addons: i.addons, qty: i.qty, diet: i.diet, note: i.note, amount: i.line_total,
      station: i.station || "", done: !!i.done_at })) });
  function linesOf(d, vid){
    const g = new Map();
    d.orders.filter(o => o.visit_id === vid && o.status !== "cancelled").sort((a, b) => a.created_at < b.created_at ? -1 : 1).forEach(o => o.items.forEach(i => {
      const k = i.name + "|" + i.size + "|" + i.addons.join(","); const x = g.get(k) || { name: i.name, size: i.size, addons: i.addons, qty: 0, amount: 0 };
      x.qty += i.qty; x.amount += i.line_total; g.set(k, x); }));
    return [...g.values()];
  }
  function freeze(d, v){ const b = Money.bill(linesOf(d, v.id), d.settings, v.tip_pct, v.split, v.discount_kind ? { kind: v.discount_kind, value: v.discount_value } : null);
    return { subtotal: b.subtotal, discount: b.discount, service: b.service, gst: b.gst, tip: b.tip, total: b.grand }; }
  function bill(vid){
    const v = db.visits.find(x => x.id === vid); if (!v) return null;
    const lines = linesOf(db, vid);
    if (v.status === "paid") return { lines, subtotal: v.subtotal, discount: v.discount || 0, discount_kind: v.discount_kind || null, discount_value: v.discount_value || 0,
      discount_reason: v.discount_reason || "", service: v.service, gst: v.gst, tip: v.tip, total: v.total - v.tip, grand: v.total,
      split: v.split, each: Math.ceil(v.total / v.split), tip_pct: v.tip_pct, service_pct: db.settings.service_pct, gst_pct: db.settings.gst_pct,
      payments: (db.payments || []).filter(p => p.visit_id === vid).map(p => ({ method: p.method, amount: p.amount, reference: p.reference })) };
    return Money.bill(lines, db.settings, v.tip_pct, v.split, discOf(v));
  }
  function priceCart(items){
    if (!Array.isArray(items) || !items.length) err("Your order is empty.");
    let count = 0;
    return items.map(it => {
      const m = db.items.find(x => x.id === it.id); const c = m && db.categories.find(x => x.id === m.category_id);
      if (!m || !c || !c.active) err("A dish in your order is no longer on the menu. Please refresh.");
      if (!m.available) err(m.name + " is sold out right now.");
      const qty = +it.qty || 1; if (qty < 1 || qty > 50) err("Check the quantity for " + m.name + ".");
      count += qty;
      let unit = m.price, size = "";
      if (m.sizes.length) { const s = m.sizes.find(x => x.name === it.size); if (!s) err("Pick a size for " + m.name + "."); unit = s.price; size = s.name; }
      const addons = [...new Set(it.addons || [])];
      addons.forEach(a => { const x = m.addons.find(y => y.name === a); if (!x) err("An extra for " + m.name + " is no longer offered. Please refresh."); unit += x.price; });
      return { id: ++db.oi, item_id: m.id, name: m.name, size, addons, diet: m.diet, qty, unit_price: unit, line_total: unit * qty, note: String(it.note || "").slice(0, 200),
        station: stationOf(m, db.categories), done_at: null };
    }).filter(() => { if (count > 60) err("That's a lot of dishes. Please ask a waiter."); return true; });
  }
  function addOrder(tid, items, note, guests, source, request){
    if (request) { const prev = db.orders.find(o => o.request_id === request);
      if (prev) { if (prev.table_id !== tid) err("That order belongs to another table."); return { order: orderJson(prev), visit_id: prev.visit_id, repeat: true }; } }
    if (dayClosed()) err(source === "guest" ? db.settings.closed_message : "Today has been closed. Ask the owner to reopen it to take more orders.");
    const lines = priceCart(items);
    let v = openVisit(tid);
    if (!v) { v = { id: uid(), table_id: tid, kind: "dine_in", token_no: null, opened_at: now(), status: "open", guests: guests >= 1 ? guests : null, split: 1, tip_pct: 0, pay_choice: "",
      bill_at: null, paid_at: null, paid_method: null, paid_by: null, void_reason: "", subtotal: 0, service: 0, gst: 0, tip: 0, total: 0 }; db.visits.push(v); }
    else {
      if (source === "guest" && db.orders.some(o => o.visit_id === v.id && o.source === "guest" && Date.now() - new Date(o.created_at) < 15e3))
        err("Your last order was just sent. Please wait a few seconds before ordering again.");
      v.status = "open"; if (!v.guests && guests >= 1) v.guests = guests;
    }
    const o = { id: uid(), no: ++db.no, visit_id: v.id, table_id: tid, source, created_by: source === "staff" ? me().id : null, status: "new",
      note: String(note || "").slice(0, 300), created_at: now(), started_at: null, ready_at: null, served_at: null, cancel_reason: "", items: lines,
      request_id: request || null };
    db.orders.push(o); save();
    return { order: orderJson(o), visit_id: v.id };
  }
  const me = () => { const u = store.get(WHO); return u ? db.staff.find(s => s.id === u && s.active) : null; };
  const role = () => (me() || {}).role;
  const need = ok => { if (!ok) err("You don't have access to this."); };
  const isManager = () => ["owner", "manager"].includes(role());
  const isFloor = () => ["owner", "manager", "cashier", "waiter"].includes(role());
  const log = (action, detail) => { const m = me() || {}; db.activity.unshift({ id: db.activity.length + 1, at: now(), by_id: m.id, by_name: m.name || "", action, detail: detail || "" }); db.activity = db.activity.slice(0, 300); };
  const inRange = (iso, from, to) => { const k = dayKey(iso); return k >= from && k <= to; };

  /* ---------- pretend kitchen when no staff tab is open ---------- */
  function bot(){
    const hb = +localStorage.getItem(HB) || 0;
    if (Date.now() - hb < 20e3) return;
    let changed = false; const t = Date.now(), born = db.born || "";
    db.orders.forEach(o => { if (o.created_at < born) return;
      const age = s => t - new Date(s).getTime();
      if (o.status === "new" && age(o.created_at) > 8e3) { o.status = "cooking"; o.started_at = now(); changed = true; }
      else if (o.status === "cooking" && age(o.started_at) > 35e3) { o.status = "ready"; o.ready_at = now(); changed = true; }
      else if (o.status === "ready" && age(o.ready_at) > 20e3) { o.status = "served"; o.served_at = now(); changed = true; }
    });
    db.calls.forEach(c => { if (!c.done_at && c.created_at >= born) { const a = t - new Date(c.created_at); if (!c.seen_at && a > 6e3) { c.seen_at = now(); c.seen_by = "u-waiter"; changed = true; }
      if (a > 40e3 && c.kind !== "bill") { c.done_at = now(); changed = true; } } });
    db.visits.forEach(v => { if (v.status === "bill" && v.kind !== "takeaway" && v.bill_at >= born && t - new Date(v.bill_at) > 45e3 && !db.orders.some(o => o.visit_id === v.id && ["new", "cooking"].includes(o.status))) {
      db.orders.filter(o => o.visit_id === v.id && o.status === "ready").forEach(o => { o.status = "served"; o.served_at = now(); });
      Object.assign(v, freeze(db, v), { status: "paid", paid_at: now(), paid_method: v.pay_choice || "upi", paid_by: "u-waiter", invoice_no: nextInvoice(db) });
      db.payments.push({ id: uid(), visit_id: v.id, method: v.paid_method, amount: v.total, reference: "", status: "captured", created_by: "u-waiter", created_at: now() });
      db.calls.forEach(c => { if (c.table_id === v.table_id && !c.done_at) c.done_at = now(); }); changed = true; } });
    if (changed) save();
  }

  /* Payments: one or more parts, each its own payments row (same as pay_visit() in 0005) */
  function payVisit(vid, parts){ need(isFloor());
    if (!Array.isArray(parts)) err("Add how they paid."); if (parts.length < 1 || parts.length > 6) err("Use up to 6 payments on one bill.");
    const v = db.visits.find(x => x.id === vid); if (!v || !["open", "bill"].includes(v.status)) err("This bill is already closed.");
    if (dayClosed()) err("Today has been closed. Ask the owner to reopen it to take payments.");
    if (v.kind !== "takeaway" && db.orders.some(o => o.visit_id === v.id && ["new", "cooking"].includes(o.status))) err("Some dishes are still with the kitchen. Serve or cancel them first.");
    const b = bill(v.id); let tot = 0; const methods = new Set(); let detail = "", refs = "";
    const rows = parts.map(p => { const m = p.method;
      if (!(["upi", "cash", "card"].includes(m) || (m === "mixed" && parts.length === 1))) err("Pick how they paid.");
      const amt = r2(Number(p.amount)); if (p.amount === "" || p.amount == null || isNaN(amt) || amt < 0 || (amt === 0 && parts.length > 1)) err("Check the amounts.");
      const ref = String(p.reference || "").trim(); if (ref.length > 60) err("The reference is too long.");
      tot = r2(tot + amt); methods.add(m); detail += (detail ? " + " : "") + m.toUpperCase() + (parts.length > 1 ? " ₹" + amt : ""); if (ref) refs += " · ref " + ref;
      return { id: uid(), visit_id: v.id, method: m, amount: amt, reference: ref, status: "captured", created_by: me().id, created_at: now() }; });
    if (tot !== b.grand) err("The payments add up to ₹" + tot + " but the bill is ₹" + b.grand + ".");
    Object.assign(v, freeze(db, v), { status: "paid", paid_at: now(), paid_method: methods.size === 1 ? [...methods][0] : "mixed", paid_by: me().id, invoice_no: nextInvoice(db) });
    (db.payments = db.payments || []).push(...rows);
    if (v.kind !== "takeaway") {
      db.orders.filter(o => o.visit_id === v.id && o.status === "ready").forEach(o => { o.status = "served"; o.served_at = o.served_at || now(); });
      db.calls.forEach(c => { if (c.table_id === v.table_id && !c.done_at) c.done_at = now(); }); }
    log("bill_paid", label(v) + " · " + v.invoice_no + " · " + detail + " · ₹" + v.total + refs);
    save(); return Object.assign(bill(v.id), { invoice_no: v.invoice_no }); }

  /* Allowed order steps — same list as order_step_ok() in 0003_hardening.sql */
  const STEPS = ["new>cooking", "new>cancelled", "cooking>ready", "cooking>new", "cooking>cancelled", "ready>served", "ready>cooking", "ready>cancelled", "served>ready"];

  /* ---------- the functions ---------- */
  const F = {
    guest_menu({ p_token }){ const t = tableBy(p_token), s = db.settings;
      return { table: { code: t.code, name: t.name || "Table " + t.code },
        place: { name: s.restaurant_name, tagline: s.tagline, currency: s.currency, accent: s.accent, cover: s.cover_url || "", accepting: s.accepting_orders, closed_message: s.closed_message,
          welcome: s.welcome_note, gst_pct: s.gst_pct, service_pct: s.service_pct, tips: s.tip_options,
          pay: { upi: s.pay_upi && !!s.upi_id, cash: s.pay_cash, card: s.pay_card }, has_wifi: !!s.wifi_name, review_url: s.google_review_url },
        categories: db.categories.filter(c => c.active && db.items.some(i => i.category_id === c.id)).sort((a, b) => a.sort - b.sort).map(c => ({ id: c.id, name: c.name })),
        items: db.items.filter(i => (db.categories.find(c => c.id === i.category_id) || {}).active).sort((a, b) => a.sort - b.sort)
          .map(i => ({ id: i.id, cat: i.category_id, name: i.name, desc: i.description, price: i.price, diet: i.diet, spice: i.spice, allergens: i.allergens,
            sizes: i.sizes, addons: i.addons, photo: i.photo_url, best: i.bestseller, available: i.available })) }; },
    guest_state({ p_token }){ bot(); const t = tableBy(p_token), s = db.settings, v = openVisit(t.id);
      if (!v) { const lp = db.visits.filter(x => x.table_id === t.id && x.status === "paid" && Date.now() - new Date(x.paid_at) < 2 * 3600e3)
          .sort((a, b) => a.paid_at < b.paid_at ? 1 : -1)[0];
        return { visit: null, now: now(), last_paid: lp ? { id: lp.id, paid_at: lp.paid_at, total: lp.total, reviewed: db.reviews.some(r => r.visit_id === lp.id),
          receipt: (({ by, ...r }) => r)(receiptJson(lp.id)) } : null }; }
      return { now: now(), last_paid: null, visit: { id: v.id, status: v.status, guests: v.guests, split: v.split, tip_pct: v.tip_pct, pay_choice: v.pay_choice,
        orders: db.orders.filter(o => o.visit_id === v.id).sort((a, b) => a.created_at < b.created_at ? -1 : 1).map(orderJson),
        calls: db.calls.filter(c => c.visit_id === v.id && !c.done_at).map(c => ({ kind: c.kind, at: c.created_at, seen: !!c.seen_at })),
        bill: bill(v.id), wifi: s.wifi_name ? { name: s.wifi_name, password: s.wifi_password } : null,
        upi: s.pay_upi && s.upi_id ? { id: s.upi_id, name: s.upi_name || s.restaurant_name } : null } }; },
    guest_order({ p_token, p_items, p_note, p_guests, p_request_id }){ const t = tableBy(p_token); if (!db.settings.accepting_orders) err(db.settings.closed_message);
      return addOrder(t.id, p_items, p_note, p_guests, "guest", p_request_id); },
    guest_call({ p_token, p_kind }){ const t = tableBy(p_token); if (!["waiter", "water", "bill", "help"].includes(p_kind)) err("Unknown request.");
      if (db.calls.some(c => c.table_id === t.id && c.kind === p_kind && !c.done_at)) return { ok: true, already: true };
      const v = openVisit(t.id); db.calls.push({ id: uid(), table_id: t.id, visit_id: v ? v.id : null, kind: p_kind, created_at: now(), seen_at: null, seen_by: null, done_at: null });
      save(); return { ok: true, already: false }; },
    guest_bill({ p_token, p_split, p_tip_pct, p_pay }){ const t = tableBy(p_token), v = openVisit(t.id);
      if (!v) err("There's no open bill for this table.");
      if (!db.orders.some(o => o.visit_id === v.id && o.status !== "cancelled")) err("Nothing has been ordered yet.");
      if (p_tip_pct && !db.settings.tip_options.includes(+p_tip_pct)) err("Pick one of the tip options.");
      Object.assign(v, { status: "bill", bill_at: v.bill_at || now(), split: Math.max(1, Math.min(+p_split || 1, 20)), tip_pct: +p_tip_pct || 0, pay_choice: p_pay || "" });
      if (!db.calls.some(c => c.table_id === t.id && c.kind === "bill" && !c.done_at))
        db.calls.push({ id: uid(), table_id: t.id, visit_id: v.id, kind: "bill", created_at: now(), seen_at: null, seen_by: null, done_at: null });
      save(); return bill(v.id); },
    guest_review({ p_token, p_visit, p_stars, p_comment }){ const t = tableBy(p_token);
      const v = db.visits.find(x => x.id === p_visit && x.table_id === t.id && x.status !== "void"); if (!v) err("This visit can't be rated any more.");
      if (!(p_stars >= 1 && p_stars <= 5)) err("Pick 1 to 5 stars.");
      const r = db.reviews.find(x => x.visit_id === v.id);
      if (r) Object.assign(r, { stars: p_stars, comment: String(p_comment || "").slice(0, 600), created_at: now() });
      else db.reviews.push({ id: uid(), visit_id: v.id, table_id: t.id, stars: p_stars, comment: String(p_comment || "").slice(0, 600), created_at: now() });
      save(); return { ok: true }; },

    staff_me(){ const m = me(); return m ? { id: m.id, name: m.name, email: m.email, role: m.role, active: m.active,
      restaurant_id: "demo", restaurant: db.settings.restaurant_name, restaurants: 1 } : null; },
    /* 0004: the demo is one restaurant */
    staff_restaurants(){ const m = me(); return m ? [{ id: "demo", name: db.settings.restaurant_name, role: m.role, active: m.active, current: true }] : []; },
    staff_switch_restaurant({ p_restaurant }){ if (p_restaurant !== "demo" || !role()) err("You don't have access to this."); return F.staff_me(); },
    create_restaurant(){ err("The demo has one restaurant. Connect your own database to add more."); },
    owner_controls_login(){ need(role() === "owner"); return true; },
    staff_live(){ need(role()); localStorage.setItem(HB, String(Date.now())); const s = db.settings, today = dayKey(new Date());
      const paidToday = db.visits.filter(v => v.status === "paid" && dayKey(v.paid_at) === today);
      const flow = {}; db.visits.filter(v => v.status !== "void" && dayKey(v.opened_at) === today).forEach(v => { const h = new Date(v.opened_at).getHours(); flow[h] = (flow[h] || 0) + 1; });
      const rt = db.reviews.filter(r => dayKey(r.created_at) === today);
      return { now: now(), role: role(),
        settings: { name: s.restaurant_name, currency: s.currency, accepting: s.accepting_orders, gst_pct: s.gst_pct, service_pct: s.service_pct, upi_id: s.upi_id, upi_name: s.upi_name,
          stations: s.stations || [], max_discount_pct: s.max_discount_pct ?? 20,
          notice: s.team_notice ? { text: s.team_notice, at: s.team_notice_at, by: s.team_notice_by } : null, day_closed: dayClosed() },
        tables: db.tables.slice().sort((a, b) => a.sort - b.sort).map(t => ({ id: t.id, code: t.code, name: t.name, area: t.area, seats: t.seats, active: t.active })),
        visits: db.visits.filter(v => v.status === "open" || v.status === "bill" || (v.kind === "takeaway" && v.status === "paid"
            && db.orders.some(o => o.visit_id === v.id && ["new", "cooking", "ready"].includes(o.status))))
          .sort((a, b) => a.opened_at < b.opened_at ? -1 : 1)
          .map(v => ({ id: v.id, table_id: v.table_id, kind: v.kind || "dine_in", token: v.token_no ?? null, status: v.status, opened_at: v.opened_at,
          bill_at: v.bill_at, guests: v.guests, split: v.split, tip_pct: v.tip_pct, pay_choice: v.pay_choice, bill: bill(v.id),
          orders: db.orders.filter(o => o.visit_id === v.id).sort((a, b) => a.created_at < b.created_at ? -1 : 1).map(orderJson) })),
        calls: db.calls.filter(c => !c.done_at).sort((a, b) => a.created_at < b.created_at ? -1 : 1)
          .map(c => ({ id: c.id, table_id: c.table_id, kind: c.kind, at: c.created_at, seen_at: c.seen_at, seen_by: (db.staff.find(x => x.id === c.seen_by) || {}).name || null })),
        today: { sales: paidToday.reduce((a, v) => a + v.total, 0), bills: paidToday.length,
          orders: db.orders.filter(o => o.status !== "cancelled" && dayKey(o.created_at) === today).length,
          guests: db.visits.filter(v => v.status !== "void" && dayKey(v.opened_at) === today).reduce((a, v) => a + (v.guests || 0), 0),
          rating: rt.length ? Math.round(rt.reduce((a, r) => a + r.stars, 0) / rt.length * 10) / 10 : null, flow } }; },
    staff_order_status({ p_order, p_status, p_reason }){ const r = role(); need(r);
      const o = db.orders.find(x => x.id === p_order); if (!o) err("That order is gone.");
      if (!["new", "cooking", "ready", "served", "cancelled"].includes(p_status)) err("Unknown status.");
      if (!orderOpen(o, p_status === "cancelled")) err("This bill is already closed, so its orders can't change.");
      if (o.status === p_status) return orderJson(o);
      if (!STEPS.includes(o.status + ">" + p_status)) err("This order is " + o.status + " and can't go to " + p_status + " from there. Refresh the screen.");
      if (p_status === "cancelled") need(["owner", "manager"].includes(r) || (["waiter", "cashier"].includes(r) && o.status === "new"));
      const was = o.status; o.status = p_status;
      if (["ready", "served"].includes(p_status)) o.items.forEach(i => { i.done_at = i.done_at || now(); });
      else if (p_status === "new" || (p_status === "cooking" && ["ready", "served"].includes(was))) o.items.forEach(i => { i.done_at = null; });
      o.started_at = p_status === "new" ? null : (o.started_at || (p_status !== "cancelled" ? now() : null));
      o.ready_at = ["new", "cooking"].includes(p_status) ? null : ["ready", "served"].includes(p_status) ? (o.ready_at || now()) : o.ready_at;
      o.served_at = p_status === "served" ? (o.served_at || now()) : p_status === "cancelled" ? o.served_at : null;
      o.cancel_reason = p_status === "cancelled" ? String(p_reason || "").slice(0, 200) : "";
      if (p_status === "cancelled") log("order_cancelled", "#" + o.no + (p_reason ? " · " + p_reason : ""));
      save(); return orderJson(o); },
    staff_add_order({ p_table, p_items, p_note, p_guests, p_request_id }){ need(isFloor()); if (!db.tables.some(t => t.id === p_table)) err("Unknown table.");
      return addOrder(p_table, p_items, p_note, p_guests, "staff", p_request_id); },
    staff_call({ p_call, p_action }){ need(isFloor()); const c = db.calls.find(x => x.id === p_call); if (!c) return null;
      c.seen_at = c.seen_at || now(); c.seen_by = c.seen_by || me().id; if (p_action === "done") c.done_at = now(); save(); return null; },
    staff_visit_update({ p_visit, p_split, p_tip_pct, p_guests }){ need(isFloor()); const v = db.visits.find(x => x.id === p_visit && (x.status === "open" || x.status === "bill"));
      if (!v) err("This table's bill is already closed.");
      const was = { split: v.split, tip: v.tip_pct };
      if (p_split != null) v.split = Math.max(1, Math.min(+p_split, 20)); if (p_tip_pct != null) v.tip_pct = Math.max(0, Math.min(+p_tip_pct, 30));
      if (p_guests >= 1) v.guests = +p_guests;
      if (was.split !== v.split || was.tip !== v.tip_pct) log("bill_changed", (db.tables.find(t => t.id === v.table_id) || {}).code + " · split " + was.split + "→" + v.split + " · tip " + was.tip + "%→" + v.tip_pct + "%");
      save(); return bill(v.id); },
    staff_mark_paid({ p_visit, p_method, p_reference }){ need(isFloor()); if (!["upi", "cash", "card", "mixed"].includes(p_method)) err("Pick how they paid.");
      const v = db.visits.find(x => x.id === p_visit); if (!v || !["open", "bill"].includes(v.status)) err("This bill is already closed.");
      return payVisit(p_visit, [{ method: p_method, amount: bill(v.id).grand, reference: p_reference }]); },
    staff_pay({ p_visit, p_parts }){ return payVisit(p_visit, p_parts); },
    staff_set_discount({ p_visit, p_kind, p_value, p_reason }){ need(isManager());
      const v = db.visits.find(x => x.id === p_visit && ["open", "bill"].includes(x.status)); if (!v) err("This bill is already closed.");
      if (!p_kind || p_kind === "none" || !+p_value) { const had = !!v.discount_kind;
        Object.assign(v, { discount_kind: null, discount_value: 0, discount_reason: "", discount_by: null }); if (had) log("discount_removed", label(v)); save(); return bill(v.id); }
      if (!["pct", "amount"].includes(p_kind)) err("Pick percent or amount.");
      if (+p_value < 0 || (p_kind === "pct" && +p_value > 100)) err("Check the discount.");
      if (String(p_reason || "").trim().length < 3) err("Write a short reason for the discount.");
      const sub = bill(v.id).subtotal, d = p_kind === "pct" ? r2(sub * p_value / 100) : Math.min(+p_value, sub), lim = db.settings.max_discount_pct ?? 20;
      if (role() !== "owner" && ((p_kind === "pct" && +p_value > lim) || (p_kind === "amount" && d > r2(sub * lim / 100)))) err("Managers can take up to " + lim + "% off a bill. Ask the owner for more.");
      Object.assign(v, { discount_kind: p_kind, discount_value: r2(+p_value), discount_reason: String(p_reason).trim().slice(0, 200), discount_by: me().id });
      log("discount", label(v) + " · ₹" + d + (p_kind === "pct" ? " (" + p_value + "%)" : "") + " · " + String(p_reason).trim()); save(); return bill(v.id); },
    staff_takeaway_order({ p_visit, p_items, p_note, p_request_id }){ need(isFloor());
      if (p_request_id) { const prev = db.orders.find(o => o.request_id === p_request_id);
        if (prev) { if (prev.table_id) err("That order belongs to another table."); return { order: orderJson(prev), visit_id: prev.visit_id, token: (db.visits.find(v => v.id === prev.visit_id) || {}).token_no, repeat: true }; } }
      if (dayClosed()) err("Today has been closed. Ask the owner to reopen it to take more orders.");
      const lines = priceCart(p_items); let v;
      if (!p_visit) { if (db.token_day !== today()) { db.token_day = today(); db.token = 0; }
        v = { id: uid(), table_id: null, kind: "takeaway", token_no: ++db.token, opened_at: now(), status: "open", guests: null, split: 1, tip_pct: 0, pay_choice: "",
          bill_at: null, paid_at: null, paid_method: null, paid_by: null, void_reason: "", subtotal: 0, service: 0, gst: 0, tip: 0, total: 0 }; db.visits.push(v); }
      else { v = db.visits.find(x => x.id === p_visit && x.kind === "takeaway" && ["open", "bill"].includes(x.status)); if (!v) err("This takeaway is already closed."); v.status = "open"; }
      const o = { id: uid(), no: ++db.no, visit_id: v.id, table_id: null, source: "staff", created_by: me().id, status: "new", note: String(p_note || "").slice(0, 300),
        created_at: now(), started_at: null, ready_at: null, served_at: null, cancel_reason: "", items: lines, request_id: p_request_id || null };
      db.orders.push(o); save(); return { order: orderJson(o), visit_id: v.id, token: v.token_no }; },
    staff_item_done({ p_item, p_done }){ need(role());
      const o = db.orders.find(x => x.items.some(i => i.id === p_item)); if (!o) err("That dish is gone.");
      if (!orderOpen(o, false)) err("This bill is already closed, so its orders can't change.");
      if (!["new", "cooking", "ready"].includes(o.status)) err("This order is " + o.status + " so its dishes can't change. Refresh the screen.");
      const it = o.items.find(i => i.id === p_item); it.done_at = p_done ? (it.done_at || now()) : null;
      if (p_done) { if (o.status === "new") { o.status = "cooking"; o.started_at = o.started_at || now(); }
        if (o.items.every(i => i.done_at)) { o.status = "ready"; o.ready_at = o.ready_at || now(); } }
      else if (o.status === "ready") { o.status = "cooking"; o.ready_at = null; }
      save(); return orderJson(o); },
    staff_receipt({ p_visit }){ need(isFloor()); const v = db.visits.find(x => x.id === p_visit && x.status !== "void"); if (!v) err("That bill is gone."); return receiptJson(v.id); },
    owner_save_bill_settings({ p }){ need(role() === "owner"); const g = String(p.gstin ?? db.settings.gstin ?? "").trim().toUpperCase();
      if (g && !/^[0-9]{2}[A-Z0-9]{10}[0-9A-Z]Z[0-9A-Z]$/.test(g)) err("Check the GSTIN: 15 characters, like 27ABCDE1234F1Z5.");
      if (!/^([0-9]{14})?$/.test(String(p.fssai ?? "").trim())) err("The FSSAI licence number has 14 digits.");
      if (!/^[A-Z0-9]{0,5}$/.test(String(p.invoice_prefix ?? "").trim().toUpperCase())) err("Use up to 5 letters or numbers for the bill number prefix.");
      if (p.sac != null && !/^[0-9]{4,8}$/.test(String(p.sac))) err("The SAC code is 4 to 8 digits (996331 for restaurants).");
      if (p.receipt_width != null && ![58, 80].includes(+p.receipt_width)) err("Pick 58 or 80 mm paper.");
      const comp = p.gst_composition ?? db.settings.gst_composition;
      if (comp && db.settings.gst_pct > 0) err("Restaurants in the GST composition scheme can't charge GST. Set GST to 0 % first.");
      Object.assign(db.settings, { legal_name: String(p.legal_name ?? db.settings.legal_name).trim().slice(0, 120), bill_address: String(p.bill_address ?? db.settings.bill_address).trim().slice(0, 300),
        gstin: "gstin" in p ? g : db.settings.gstin, fssai: p.fssai != null ? String(p.fssai).trim() : db.settings.fssai, sac: p.sac || db.settings.sac, gst_composition: !!comp,
        invoice_prefix: p.invoice_prefix != null ? String(p.invoice_prefix).trim().toUpperCase() : db.settings.invoice_prefix,
        bill_footer: String(p.bill_footer ?? db.settings.bill_footer).slice(0, 160), receipt_width: p.receipt_width != null ? +p.receipt_width : db.settings.receipt_width });
      log("bill_settings_changed", "gstin" in p ? "GSTIN " + (g || "removed") : ""); save(); return null; },
    staff_set_notice({ p_text }){ need(isManager()); const t = String(p_text || "").trim(); if (t.length > 300) err("Keep the notice under 300 characters.");
      Object.assign(db.settings, { team_notice: t, team_notice_at: t ? now() : null, team_notice_by: t ? myName() : "" });
      log(t ? "notice_changed" : "notice_cleared", t.slice(0, 120)); save(); return null; },
    staff_day_summary({ p_day } = {}){ need(isManager()); const d = p_day || today();
      const paid = db.visits.filter(v => v.status === "paid" && dayKey(v.paid_at) === d), sum = (a, f) => r2(a.reduce((x, y) => x + f(y), 0));
      const pays = (db.payments || []).filter(p => dayKey(p.created_at) === d && (db.visits.find(v => v.id === p.visit_id) || {}).status === "paid");
      return { day: d, today: today(), closed: clone((db.closes || []).find(c => c.day === d) || null),
        methods: { cash: sum(pays.filter(p => p.method === "cash"), p => p.amount), upi: sum(pays.filter(p => p.method === "upi"), p => p.amount),
                   card: sum(pays.filter(p => ["card", "mixed"].includes(p.method)), p => p.amount) },
        sales: sum(paid, v => v.total), bills: paid.length, discounts: sum(paid, v => v.discount || 0), tips: sum(paid, v => v.tip),
        voids: db.visits.filter(v => v.status === "void" && dayKey(v.opened_at) === d).length,
        open: db.visits.filter(v => ["open", "bill"].includes(v.status)).length,
        recent: clone((db.closes || []).slice().sort((a, b) => a.day < b.day ? 1 : -1).slice(0, 7)) }; },
    staff_close_day({ p_day, p_opening, p_paid_out, p_counted, p_note }){ need(isManager());
      if (!p_day || p_day > today()) err("You can't close a day that hasn't started."); if (dayClosed(p_day)) err("This day is already closed.");
      if (+p_opening < 0 || +p_paid_out < 0 || p_counted == null || p_counted === "" || +p_counted < 0) err("Check the cash amounts.");
      if (String(p_note || "").length > 300) err("Keep the note under 300 characters.");
      const sm = F.staff_day_summary({ p_day }); if (sm.open > 0) err("Take payment for or clear the " + sm.open + " open bill(s) first.");
      const expected = r2((+p_opening || 0) + sm.methods.cash - (+p_paid_out || 0)), counted = r2(+p_counted);
      const c = { id: uid(), day: p_day, opening_cash: +p_opening || 0, cash_sales: sm.methods.cash, upi_sales: sm.methods.upi, card_sales: sm.methods.card,
        sales: sm.sales, bills: sm.bills, discounts: sm.discounts, tips: sm.tips, paid_out: +p_paid_out || 0, expected, counted, difference: r2(counted - expected),
        note: String(p_note || "").trim(), closed_by: me().id, closed_by_name: myName(), closed_at: now() };
      (db.closes = db.closes || []).push(c);
      log("day_closed", p_day + " · expected ₹" + expected + " · counted ₹" + counted + " · " + (counted === expected ? "matches" : counted > expected ? "₹" + r2(counted - expected) + " extra" : "₹" + r2(expected - counted) + " short"));
      save(); return clone(c); },
    owner_reopen_day({ p_day, p_reason }){ need(role() === "owner"); if (String(p_reason || "").trim().length < 3) err("Write a short reason.");
      const c = (db.closes || []).find(x => x.day === p_day); if (!c) err("That day isn't closed.");
      db.closes = db.closes.filter(x => x !== c); log("day_reopened", p_day + " · was counted ₹" + c.counted + " by " + c.closed_by_name + " · " + String(p_reason).trim().slice(0, 120));
      save(); return null; },
    staff_void_visit({ p_visit, p_reason }){ need(isManager()); if (String(p_reason || "").trim().length < 3) err("Write a short reason.");
      const v = db.visits.find(x => x.id === p_visit && ["open", "bill"].includes(x.status)); if (!v) err("This bill is already closed.");
      v.status = "void"; v.void_reason = p_reason;
      db.orders.filter(o => o.visit_id === v.id && ["new", "cooking"].includes(o.status)).forEach(o => { o.status = "cancelled"; o.cancel_reason = "Table cleared"; });
      if (v.table_id) db.calls.forEach(c => { if (c.table_id === v.table_id && !c.done_at) c.done_at = now(); });
      log("table_cleared", label(v) + " · " + p_reason); save(); return null; },
    staff_menu(){ need(role()); return { categories: clone(db.categories).sort((a, b) => a.sort - b.sort), items: clone(db.items).sort((a, b) => a.sort - b.sort) }; },
    staff_item_available({ p_item, p_available }){ need(role()); const i = db.items.find(x => x.id === p_item); if (i) { i.available = !!p_available; log(p_available ? "back_on_menu" : "sold_out", i.name); } save(); return null; },
    staff_bills({ p_from, p_to }){ need(isFloor());
      return db.visits.filter(v => ["paid", "void"].includes(v.status) && inRange(v.paid_at || v.opened_at, p_from, p_to))
        .sort((a, b) => (a.paid_at || a.opened_at) < (b.paid_at || b.opened_at) ? 1 : -1)
        .map(v => ({ id: v.id, table: label(v), kind: v.kind || "dine_in", invoice_no: v.invoice_no || null, gst: v.gst, opened_at: v.opened_at, paid_at: v.paid_at, status: v.status,
          method: v.paid_method, total: v.total, tip: v.tip, discount: v.discount || 0, guests: v.guests, void_reason: v.void_reason, by: (db.staff.find(s => s.id === v.paid_by) || {}).name || null,
          bill: bill(v.id), ref: (db.payments || []).filter(x => x.visit_id === v.id && x.reference).map(x => x.reference).join(", ") || null,
          stars: (db.reviews.find(r => r.visit_id === v.id) || {}).stars || null })); },

    owner_save_category({ p }){ need(isManager()); if (!String(p.name || "").trim() && !p.id) err("Give the section a name.");
      if (p.station && !(db.settings.stations || []).includes(p.station)) err("Pick a kitchen station from Settings.");
      let c = p.id && db.categories.find(x => x.id === p.id);
      if (!c) { c = { id: uid(), name: p.name.trim(), sort: p.sort != null ? +p.sort : Math.max(0, ...db.categories.map(x => x.sort)) + 1, active: p.active !== false, station: p.station || "" }; db.categories.push(c); }
      else { if (p.name != null) c.name = String(p.name).trim(); if (p.sort != null) c.sort = +p.sort; if (p.active != null) c.active = !!p.active; if (p.station != null) c.station = p.station; }
      save(); return c.id; },
    owner_delete_category({ p_id }){ need(isManager()); if (db.items.some(i => i.category_id === p_id)) err("Move or delete the dishes in this section first.");
      db.categories = db.categories.filter(c => c.id !== p_id); save(); return null; },
    owner_save_item({ p }){ need(isManager());
      if ([...(p.sizes || []), ...(p.addons || [])].some(x => !String(x.name || "").trim() || x.price == null || +x.price < 0)) err("Every size and extra needs a name and a price.");
      if (!String(p.name || "").trim()) err("Give the dish a name.");
      if (p.station && !(db.settings.stations || []).includes(p.station)) err("Pick a kitchen station from Settings.");
      const row = { category_id: p.category_id, name: String(p.name).trim(), description: p.description || "", price: +p.price || 0, diet: p.diet || "veg",
        spice: p.spice === "" || p.spice == null ? null : +p.spice, allergens: p.allergens || [], sizes: (p.sizes || []).map(x => ({ name: x.name.trim(), price: +x.price })),
        addons: (p.addons || []).map(x => ({ name: x.name.trim(), price: +x.price })), photo_url: p.photo_url || "", bestseller: !!p.bestseller, available: p.available !== false,
        station: p.station != null ? p.station : ((p.id && (db.items.find(x => x.id === p.id) || {}).station) || "") };
      let i = p.id && db.items.find(x => x.id === p.id);
      if (i) { const sz = JSON.stringify([i.sizes, i.addons]) !== JSON.stringify([row.sizes, row.addons]);
        if (i.price !== row.price || sz) log("price_changed", row.name + " · ₹" + i.price + " → ₹" + row.price + (sz ? " · sizes/extras changed" : ""));
        if (i.name !== row.name) log("dish_renamed", i.name + " → " + row.name);
        Object.assign(i, row, p.sort != null ? { sort: +p.sort } : {}); }
      else { i = Object.assign({ id: uid(), created_at: now(), sort: p.sort != null ? +p.sort : Math.max(0, ...db.items.map(x => x.sort)) + 1 }, row); db.items.push(i);
        log("dish_added", row.name + " · ₹" + row.price); }
      save(); return i.id; },
    owner_delete_item({ p_id }){ need(isManager()); const i = db.items.find(x => x.id === p_id); db.items = db.items.filter(x => x.id !== p_id); if (i) log("dish_deleted", i.name + " · ₹" + i.price); save(); return i ? i.photo_url : null; },
    owner_save_table({ p }){ need(isManager()); const code = String(p.code || "").trim().toUpperCase();
      if (!/^[A-Z0-9-]{1,12}$/.test(code)) err("Use up to 12 letters, numbers or dashes for the table number.");
      if (db.tables.some(t => t.code === code && t.id !== p.id)) err("Another table already uses that number.");
      let t = p.id && db.tables.find(x => x.id === p.id);
      const row = { code, name: p.name || "", area: String(p.area || "").trim() || "Main", seats: +p.seats || 4, active: p.active !== false };
      if (t) Object.assign(t, row, p.sort != null ? { sort: +p.sort } : {});
      else { t = Object.assign({ id: uid(), token: "demo-" + code + "-" + Math.random().toString(36).slice(2, 6), sort: Math.max(0, ...db.tables.map(x => x.sort)) + 1 }, row); db.tables.push(t); }
      save(); return t.id; },
    owner_delete_table({ p_id }){ need(isManager()); if (db.visits.some(v => v.table_id === p_id)) err("This table has bills on record. Switch it off instead.");
      db.tables = db.tables.filter(t => t.id !== p_id); save(); return null; },
    owner_table_tokens(){ need(isManager()); const o = {}; db.tables.forEach(t => o[t.id] = t.token); return o; },
    owner_new_token({ p_id }){ need(isManager()); const t = db.tables.find(x => x.id === p_id); t.token = "demo-" + t.code + "-" + Math.random().toString(36).slice(2, 6);
      log("qr_replaced", t.code); save(); return t.token; },
    owner_settings(){ need(role()); return clone(db.settings); },
    owner_save_settings({ p }){ need(isManager()); if (role() !== "owner" && Object.keys(p).some(k => k !== "accepting_orders")) err("Only the owner can change settings.");
      if (p.accent && !/^#[0-9A-Fa-f]{6}$/.test(p.accent)) err("Pick a colour.");
      if (p.cover_url && !/^(https:\/\/|img\/|data:image\/)/.test(p.cover_url)) err("The cover photo must be an uploaded photo.");
      if (p.gst_pct != null && (+p.gst_pct < 0 || +p.gst_pct > 28)) err("GST must be between 0 and 28%.");
      if (p.tip_options && p.tip_options.some(x => !(x >= 0 && x <= 30))) err("Tip choices must be between 0 and 30%.");
      if (p.service_pct != null && (+p.service_pct < 0 || +p.service_pct > 20)) err("Service charge must be between 0 and 20%.");
      if (db.settings.gst_composition && p.gst_pct != null && +p.gst_pct > 0) err("Restaurants in the GST composition scheme can't charge GST. Set GST to 0 % first.");
      if (p.max_discount_pct != null && (+p.max_discount_pct < 0 || +p.max_discount_pct > 100)) err("The discount limit must be between 0 and 100%.");
      if (p.stations) { const seen = new Set(); p = Object.assign({}, p, { stations: p.stations.map(x => String(x).trim()).filter(x => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase())) });
        if (p.stations.length > 8) err("Use up to 8 kitchen stations."); if (p.stations.some(x => x.length > 24)) err("Keep station names under 24 characters.");
        db.categories.forEach(c => { if (c.station && !p.stations.includes(c.station)) c.station = ""; });
        db.items.forEach(i => { if (i.station && !p.stations.includes(i.station)) i.station = ""; }); }
      Object.keys(p).forEach(k => { if (k in db.settings && p[k] != null && !(k === "restaurant_name" && !String(p[k]).trim())) db.settings[k] = ["gst_pct", "service_pct", "max_discount_pct"].includes(k) ? +p[k] : p[k]; });
      if ("cover_url" in p && !("cover_url" in db.settings)) db.settings.cover_url = p.cover_url;
      if ("accepting_orders" in p) log(p.accepting_orders ? "orders_on" : "orders_off", ""); else log("settings_changed", "");
      db.settings.updated_at = now(); save(); return null; },
    owner_report({ p_from, p_to }){ need(isManager());
      const paid = db.visits.filter(v => v.status === "paid" && inRange(v.paid_at, p_from, p_to));
      const byDay = {}, byHour = {}, methods = {}, top = {};
      paid.forEach(v => { const d = dayKey(v.paid_at); byDay[d] = byDay[d] || { day: d, sales: 0, bills: 0 }; byDay[d].sales += v.total; byDay[d].bills++;
        const h = new Date(v.opened_at).getHours(); byHour[h] = (byHour[h] || 0) + 1;
        const ps = (db.payments || []).filter(x => x.visit_id === v.id);
        (ps.length ? ps : [{ method: v.paid_method, amount: v.total }]).forEach(x => { methods[x.method] = (methods[x.method] || 0) + x.amount; });
        db.orders.filter(o => o.visit_id === v.id && o.status !== "cancelled").forEach(o => o.items.forEach(i => {
          top[i.name] = top[i.name] || { name: i.name, qty: 0, amount: 0 }; top[i.name].qty += i.qty; top[i.name].amount += i.line_total; })); });
      const ords = db.orders.filter(o => o.ready_at && inRange(o.created_at, p_from, p_to));
      const revs = db.reviews.filter(r => inRange(r.created_at, p_from, p_to)).sort((a, b) => a.created_at < b.created_at ? 1 : -1);
      const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
      return { sales: sum(paid, v => v.total), tips: sum(paid, v => v.tip), gst: sum(paid, v => v.gst), discounts: sum(paid, v => v.discount || 0), bills: paid.length, guests: sum(paid, v => v.guests || 0),
        voids: db.visits.filter(v => v.status === "void" && inRange(v.opened_at, p_from, p_to)).length,
        by_day: Object.values(byDay).sort((a, b) => a.day < b.day ? -1 : 1), by_hour: byHour, methods,
        top: Object.values(top).sort((a, b) => b.qty - a.qty || b.amount - a.amount).slice(0, 10),
        prep_mins: ords.length ? Math.round(sum(ords, o => (new Date(o.ready_at) - new Date(o.created_at)) / 60e3) / ords.length * 10) / 10 : null,
        rating: revs.length ? Math.round(sum(revs, r => r.stars) / revs.length * 100) / 100 : null, ratings: revs.length,
        reviews: revs.slice(0, 50).map(r => ({ stars: r.stars, comment: r.comment, at: r.created_at, table: (db.tables.find(t => t.id === r.table_id) || {}).code })) }; },
    owner_team(){ need(role() === "owner"); return { staff: clone(db.staff) }; },
    owner_activity(){ need(role() === "owner"); return clone(db.activity); }
  };

  return {
    rpc(fn, args){
      load();
      return new Promise((ok, bad) => setTimeout(() => { try { if (!F[fn]) err("Not available in the demo: " + fn); ok(clone(F[fn](args) ?? null)); } catch(e){ bad(e); } }, 60));
    },
    user(){ load(); return me(); },
    signIn(email){ load(); const u = db.staff.find(s => s.email === String(email).toLowerCase() && s.active); if (!u) err("Pick a demo login."); store.set(WHO, u.id); },
    signOut(){ store.set(WHO, null); },
    teamAdmin(b){ load(); need(role() === "owner");
      if (b.action === "add") { if (!b.name || !/^\S+@\S+\.\S+$/.test(b.email || "")) err("Enter a name and a valid email.");
        if ((b.password || "").length < 8) err("The password must be at least 8 characters.");
        if (db.staff.some(s => s.email === b.email.toLowerCase())) err("That person is already on your team.");
        db.staff.push({ id: uid(), name: b.name, email: b.email.toLowerCase(), phone: b.phone || "", role: b.role || "waiter", active: true, created_at: now() }); log("login_added", b.name + " (" + b.role + ")"); }
      else if (b.action === "update") { const s = db.staff.find(x => x.id === b.id); if (!s) err("Unknown login.");
        if (s.id === me().id && (b.role !== "owner" || b.active === false)) err("You can't remove your own owner access.");
        Object.assign(s, { name: b.name, email: (b.email || s.email).toLowerCase(), phone: b.phone || "", role: b.role }, typeof b.active === "boolean" ? { active: b.active } : {}); }
      else if (b.action === "delete") { if (b.id === me().id) err("You can't delete your own login."); db.staff = db.staff.filter(x => x.id !== b.id); log("login_deleted", ""); }
      else if (b.action === "password") { if ((b.password || "").length < 8) err("The password must be at least 8 characters."); }
      save(); return Promise.resolve({ ok: true }); },
    reset(){ db = seed(); save(); store.set(WHO, null); },
    TEAM
  };
})();
