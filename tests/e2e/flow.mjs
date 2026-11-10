// End-to-end test of the whole restaurant journey in demo mode (no Supabase needed).
// Guest (phone) and staff (phone) run in one browser profile, so they share the demo data.
// Run:  python3 -m http.server 8765 &  node tests/e2e/flow.mjs        (exits 1 on any failure)
import { createRequire } from "module";
const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.env.BASE_URL || "http://localhost:8765/";
const failures = [];
const check = (ok, what) => { console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) failures.push(what); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "light",
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile" });
const errors = [];
const watch = p => { p.on("pageerror", e => errors.push("page: " + e.message));
  p.on("console", m => { if (m.type() === "error" && !/fonts|ERR_TUNNEL|ERR_NAME|net::/.test(m.text())) errors.push(m.text()); }); };
const signInAs = async (page, who) => { await page.goto(BASE + "staff.html"); await page.evaluate(() => localStorage.removeItem("dd.demo.user")); await page.reload();
  await page.click(`[data-demo="${who}@demo"]`); await page.waitForTimeout(1000); };

try {
  const g = await ctx.newPage(); watch(g);
  await g.goto(BASE + "t.html?k=demo-T5"); await g.evaluate(() => localStorage.clear()); await g.reload(); await g.waitForTimeout(800);
  const s = await ctx.newPage(); watch(s);
  await signInAs(s, "kitchen");

  console.log("Guest orders");
  await g.bringToFront();
  await g.locator(".dish", { hasText: "Dal Makhani" }).locator("[data-plus]").click(); await g.waitForTimeout(200);
  await g.click('[data-dq="1"]'); await g.click("[data-addcart]");
  await g.locator(".dish", { hasText: "Tandoori Roti" }).locator("[data-plus]").click();
  await g.click('[data-open="cart"]'); await g.fill("#oNote", "No onion please"); await g.click("[data-place]"); await g.waitForTimeout(1500);
  check(await g.locator(".sheet-card", { hasText: "#" }).count() > 0, "guest sees the order on My table");

  console.log("Same order sent twice (retry) is saved once");
  const dup = await g.evaluate(async () => {
    const m = await API.rpc("guest_menu", { p_token: "demo-T7" }); const it = m.items.find(i => i.name === "Masala Chaas");
    const id = newRequestId(); const a = await API.rpc("guest_order", { p_token: "demo-T7", p_items: [{ id: it.id, qty: 1 }], p_request_id: id }).catch(e => ({ e: e.message }));
    const b = await API.rpc("guest_order", { p_token: "demo-T7", p_items: [{ id: it.id, qty: 1 }], p_request_id: id }).catch(e => ({ e: e.message }));
    return { same: a.order && b.order && a.order.id === b.order.id, repeat: b.repeat, err: a.e || b.e };
  });
  check(dup.same && dup.repeat, "retry returns the first order, no duplicate" + (dup.err ? " (" + dup.err + ")" : ""));

  console.log("Kitchen");
  await s.bringToFront(); await s.waitForTimeout(4500);
  const t5 = s.locator(".ticket", { hasText: "T5" }).first();
  check(await t5.count() === 1, "kitchen shows the T5 ticket");
  await t5.locator('[data-ost$=":cooking"]').click(); await s.waitForTimeout(600);
  await s.click('[data-kds="cooking"]'); await s.locator(".ticket", { hasText: "T5" }).first().locator('[data-ost$=":ready"]').click(); await s.waitForTimeout(600);
  const skip = await s.evaluate(async () => { const L = await API.rpc("staff_live"); const o = L.visits.flatMap(v => v.orders).find(x => x.status === "new");
    if (!o) return "no new order"; try { await API.rpc("staff_order_status", { p_order: o.id, p_status: "served" }); return "allowed"; } catch(e){ return e.message; } });
  check(/can't go to served/.test(skip), "kitchen can't jump a new order straight to served");
  await g.bringToFront(); await g.waitForTimeout(5500);
  check(/Ready|cooked|Received/.test(await g.locator(".live h3").innerText()), "guest sees live status");

  console.log("Waiter serves, guest asks for the bill, waiter takes UPI with a reference");
  await s.bringToFront(); await signInAs(s, "waiter");
  await s.evaluate(async () => { const L = await API.rpc("staff_live");
    for (const o of L.visits.flatMap(v => v.orders)) { for (const st of o.status === "new" ? ["cooking", "ready"] : o.status === "cooking" ? ["ready"] : []) await API.rpc("staff_order_status", { p_order: o.id, p_status: st }); } });
  await s.waitForTimeout(4500);
  await s.locator(".tile", { hasText: "T5" }).click(); await s.waitForTimeout(400);
  for (const b of await s.locator('[data-ost$=":served"]').all()) { await b.click(); await s.waitForTimeout(400); }
  await g.bringToFront(); if (await g.locator("#sheet").isHidden()) await g.click('[data-open="table"]');
  await g.click('.tabs [data-tab="bill"]'); await g.click('[data-split="2"]'); await g.click('[data-tip="5"]'); await g.click("[data-askbill]"); await g.waitForTimeout(1200);
  await s.bringToFront(); await s.waitForTimeout(4500);
  const total = (await s.locator(".tot .g").innerText()).replace(/\s+/g, " ");
  check(/₹650/.test(total), "staff sees the right total (₹650): " + total);
  await s.fill("#payRef", "412345678901");
  await s.click('[data-paid="upi"]'); await s.click('[data-paid="upi"]'); await s.waitForTimeout(900);

  console.log("Guest rates");
  await g.bringToFront(); await g.waitForTimeout(5500);
  check(await g.locator("text=Paid — thank you!").count() === 1, "guest sees the thank-you screen");
  await g.click('[data-star="5"]'); await g.fill("#revText", "Superb dal"); await g.click("[data-sendrev]"); await g.waitForTimeout(500);

  console.log("Owner");
  await s.bringToFront(); await signInAs(s, "owner");
  await s.click('[data-range="1"]'); await s.waitForTimeout(800);
  check(await s.locator("text=Superb dal").count() > 0, "today's report shows the review");
  await s.goto(BASE + "staff.html#bills"); await s.waitForTimeout(800);
  await s.locator(".li", { hasText: "T5" }).first().click(); await s.waitForTimeout(300);
  check(await s.locator("text=ref 412345678901").count() > 0, "bill shows the UPI reference");
  await s.click(".drawer-card [data-dclose]");
  await s.goto(BASE + "staff.html#menu"); await s.waitForTimeout(600);
  await s.locator(".li", { hasText: "Butter Naan" }).click(); await s.waitForTimeout(300);
  await s.fill("#itemForm [name=price]", "70"); await s.click("#itemForm button.lg"); await s.waitForTimeout(600);
  await s.goto(BASE + "staff.html#settings/activity"); await s.waitForTimeout(800);
  check(await s.locator("text=Bill paid").count() > 0, "activity shows the payment");
  check(await s.locator("text=Price changed").count() > 0, "activity shows the price change");
  await s.goto(BASE + "staff.html#tables"); await s.waitForTimeout(600); await s.click("[data-newtable]");
  await s.fill("#tblForm [name=code]", "t9"); await s.click("#tblForm button.lg"); await s.waitForTimeout(800);
  check(await s.locator("text=Table T9").count() > 0, "owner adds a table");
  await s.goto(BASE + "staff.html#settings/pay"); await s.waitForTimeout(600);
  await s.fill("[name=service_pct]", "10"); await s.click("#setForm button.lg"); await s.waitForTimeout(600);
  await g.bringToFront(); await g.goto(BASE + "t.html?k=demo-T1"); await g.waitForTimeout(1000);
  await g.click('[data-open="table"]'); await g.click('.tabs [data-tab="bill"]'); await g.waitForTimeout(300);
  check(await g.locator("text=Service charge 10%").count() > 0, "guest bill shows the new service charge");
} catch (e) { failures.push("crashed: " + e.message); console.error(e); }

check(errors.length === 0, "no console errors" + (errors.length ? ": " + errors.join(" | ") : ""));
await browser.close();
console.log(failures.length ? `\n${failures.length} FAILED` : "\nE2E PASSED");
process.exit(failures.length ? 1 : 0);
