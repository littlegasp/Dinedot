/* Demo backend helpers: local storage, request ids and the money rules (same as visit_bill() in the database).
   Loaded only in demo mode (no Supabase keys), before demo.js. */
const store = {
  get(k){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; }catch(e){ return null; } },
  set(k, v){ try{ v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
};

/* One id per order attempt: a retry after a dropped connection sends the same id, so the order is saved once. */
const newRequestId = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));

/* Same money rules as visit_bill() in the database. Used by the demo and for previews. */
const Money = {
  /* disc (optional, 0005): { kind: "pct" | "amount", value, reason }. Discount comes off the subtotal
     before service, GST and tip. */
  bill(lines, s, tipPct, split, disc, tipAmount){
    const sub = lines.reduce((a, l) => a + Number(l.amount || 0), 0);
    const d = disc && disc.kind === "pct" ? Math.round(sub * disc.value) / 100 : disc && disc.kind === "amount" ? Math.min(+disc.value || 0, sub) : 0;
    const net = sub - d;
    const svc = Math.round(net * (s.service_pct || 0)) / 100;
    const tax = Math.round((net + svc) * (s.gst_pct || 0)) / 100;
    const tot = Math.round(net + svc + tax);
    const tip = tipAmount > 0 ? Math.round(tipAmount) : Math.round(net * (tipPct || 0) / 100);   // 0009: an amount tip wins
    split = Math.max(1, split || 1);
    return { lines, subtotal: sub, discount: d, discount_kind: disc && disc.kind || null, discount_value: disc && +disc.value || 0,
             discount_reason: disc && disc.reason || "", service: svc, gst: tax, total: tot, tip, grand: tot + tip, split,
             each: Math.ceil((tot + tip) / split), tip_pct: tipPct || 0, tip_amount: tipAmount > 0 ? +tipAmount : 0, service_pct: s.service_pct || 0, gst_pct: s.gst_pct || 0 };
  },
  fmt(n, cur){ n = Number(n || 0); const r = Math.round(n * 100) / 100;
    return (cur || "₹") + r.toLocaleString("en-IN", { minimumFractionDigits: r % 1 ? 2 : 0, maximumFractionDigits: 2 }); }
};

window.Money = Money;
