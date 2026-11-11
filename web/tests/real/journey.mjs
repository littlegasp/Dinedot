// Real-stack journey (see run.sh): the built app against the real migrations via PostgREST.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
const { chromium } = createRequire(import.meta.url)("playwright");
const [BASE, TOKEN] = process.argv.slice(2);
const sql = q => execFileSync("psql", ["-At", "-d", process.env.DB, "-c", q]).toString().trim();
let step = 0; const ok = m => console.log(`  ✓ ${++step}. ${m}`);

const browser = await chromium.launch();
const errors = [];
const page = async (ctx, w = 1440) => { const p = await ctx.newPage(); await p.setViewportSize({ width: w, height: 900 });
  p.on("pageerror", e => errors.push(e.message)); p.on("console", m => m.type() === "error" && !/favicon|40[01]/.test(m.text()) && errors.push(m.text())); return p; };
async function signIn(p, email) {
  await p.goto(BASE); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.getByLabel("Email").fill(email); await p.getByLabel("Password").fill("test-pass-1");
  await p.getByRole("button", { name: "Sign in" }).click();
}

try {
  const staffCtx = await browser.newContext(), guestCtx = await browser.newContext();
  const s = await page(staffCtx);
  await signIn(s, "owner@copper.test");
  await s.getByRole("heading", { name: /Good (morning|afternoon|evening)/ }).waitFor();
  ok("owner signs in with email and password; Today loads from the database");

  // Guest orders at T2 through the real guest functions (anon key)
  const g = await page(guestCtx, 390);
  await g.goto(`${BASE}t.html?k=${TOKEN}`);
  await g.getByRole("heading", { name: "The Copper Pot" }).waitFor();
  await g.locator("li", { hasText: "Paneer Tikka" }).getByRole("button", { name: "ADD" }).click();
  const d = g.getByRole("dialog"); if (await d.isVisible().catch(() => false)) await d.getByRole("button", { name: /^Add ·/ }).click();
  await g.getByRole("button", { name: /View order/ }).click();
  await g.getByLabel("Note for the kitchen").fill("Less spicy");
  await g.getByRole("button", { name: "Send to kitchen" }).click();
  await g.getByText(/Order #1 ·/).waitFor();
  ok("guest orders from the QR page; it is order #1 of this restaurant");
  if (sql("select count(*) from orders where note = 'Less spicy' and request_id is not null") !== "1") throw new Error("order not saved once with a request id");
  ok("database has the order once, with its request id and note");
  await g.getByRole("button", { name: "Water" }).click(); await g.getByText("Water is on its way").waitFor();

  // Kitchen → ready; floor → serve; POS → pay by UPI with a reference
  await s.goto(BASE + "#/kitchen");
  const t = s.locator("article", { hasText: "Paneer Tikka" }).first();
  await t.getByText("Less spicy").waitFor();
  await t.getByRole("button", { name: "Start cooking" }).click();
  await s.locator("section[aria-label=cooking] article", { hasText: "Paneer Tikka" }).getByRole("button", { name: "Mark ready" }).click();
  await s.locator("section[aria-label=ready] article", { hasText: "Paneer Tikka" }).waitFor();
  ok("kitchen screen moves the order to Ready (staff_order_status)");
  await g.locator("li", { hasText: "Ready" }).first().waitFor({ timeout: 10000 });
  ok("guest sees Ready");

  const w = await page(await browser.newContext(), 390);
  await signIn(w, "waiter@copper.test");
  await w.getByRole("heading", { name: "Floor" }).waitFor();
  await w.locator("section[aria-label='Calls from tables'] > div", { hasText: "T2 asked for water" }).getByRole("button", { name: "Done" }).click();
  await w.getByText("T2 handled").waitFor();
  await w.getByRole("button", { name: /^T2/ }).first().click();
  await w.getByRole("dialog").getByRole("button", { name: "Served" }).click();
  await w.getByRole("dialog").getByText("Served", { exact: true }).waitFor();
  await w.getByRole("dialog").getByRole("button", { name: /Bill & pay/ }).click();
  const pay = w.getByRole("dialog", { name: /Take payment/ });
  await pay.getByRole("button", { name: "UPI" }).click();
  await pay.getByLabel("Payment reference").fill("412345678901");
  await pay.getByRole("button", { name: /Mark paid/ }).click();
  await w.getByText(/Paid · table T2 is free/).waitFor();
  ok("waiter (phone) clears the call, serves and takes UPI with a reference");
  await w.getByRole("dialog", { name: /CP?\d{4}-0001|· \d{4}-0001/ }).waitFor();
  await w.keyboard.press("Escape");
  if (!/^\d{4}-0001$/.test(sql("select invoice_no from visits where invoice_no is not null"))) throw new Error("invoice number wrong: " + sql("select invoice_no from visits"));
  ok("the paid bill got invoice number " + sql("select invoice_no from visits where invoice_no is not null") + " and its bill opened");
  const row = sql("select method || '|' || amount || '|' || reference from payments");
  if (row !== "upi|304.50|412345678901" && !/^upi\|\d+(\.\d+)?\|412345678901$/.test(row)) throw new Error("payment row wrong: " + row);
  ok(`payments table has the payment (${row})`);

  await s.goto(BASE + "#/today");
  await s.getByText(/Best sellers today/).waitFor();
  await s.locator("li", { hasText: "Paneer Tikka" }).first().waitFor({ timeout: 10000 });
  ok("Today shows the sale and the best seller from owner_report");

  // Manage screens on the real database
  await s.goto(BASE + "#/menu"); await s.getByRole("button", { name: "Add dish" }).click();
  const dlg = s.getByRole("dialog");
  await dlg.getByLabel("Dish name").fill("Real Test Dosa"); await dlg.getByLabel("Price (₹)").fill("150");
  await dlg.getByRole("button", { name: "Save dish" }).click(); await s.getByText("Dish saved").waitFor();
  await s.getByRole("switch", { name: /Real Test Dosa: on the menu/ }).click(); await s.getByText("Real Test Dosa marked sold out").waitFor();
  if (sql("select available::text from items where name = 'Real Test Dosa'") !== "false") throw new Error("sold out not saved");
  if (sql("select count(*) from activity_log where action = 'dish_added' and detail like 'Real Test Dosa%'") !== "1") throw new Error("dish_added not logged");
  ok("menu: dish saved (and logged), sold-out switch saved in the database");

  await s.goto(BASE + "#/tables"); await s.getByRole("button", { name: "Add table" }).click();
  await s.getByRole("dialog").getByLabel("Table number").fill("R7"); await s.getByRole("dialog").getByRole("button", { name: "Save table" }).click();
  await s.getByText("Table saved").waitFor();
  const t1 = sql("select token from dining_tables where code = 'R7'");
  await s.getByRole("button", { name: /^R7/ }).first().click();
  await s.getByRole("dialog").getByRole("button", { name: "Replace QR" }).click();
  await s.getByRole("dialog").getByRole("button", { name: "Replace QR" }).last().click(); await s.getByText("New QR made").waitFor();
  if (sql("select token from dining_tables where code = 'R7'") === t1) throw new Error("token not replaced");
  await s.keyboard.press("Escape");
  ok("tables: table added, QR token replaced in the database");

  await s.goto(BASE + "#/settings"); await s.getByLabel("Tagline").fill("Real tagline"); await s.getByLabel("GST %").fill("12");
  await s.getByRole("button", { name: "Save changes" }).click(); await s.getByText("Settings saved").waitFor();
  if (sql("select tagline || '|' || gst_pct from settings") !== "Real tagline|12.0" && !sql("select tagline || '|' || gst_pct from settings").startsWith("Real tagline|12")) throw new Error("settings not saved");
  ok("settings: tagline and GST saved");

  await s.goto(BASE + "#/team"); await s.getByRole("button", { name: /Waiter/ }).first().waitFor();
  await s.locator("button", { hasText: "waiter@copper.test" }).click();
  await s.getByRole("dialog").getByRole("radio", { name: "Manager" }).click();
  await s.getByRole("dialog").getByRole("button", { name: "Save" }).click(); await s.getByText("Saved").first().waitFor();
  if (sql("select m.role from memberships m join staff st on st.id = m.user_id where st.email = 'waiter@copper.test'") !== "manager") throw new Error("role not changed");
  ok("team: role changed to manager (owner_edit_staff)");

  await s.goto(BASE + "#/bills"); await s.locator("button", { hasText: "T2" }).filter({ hasText: "UPI" }).first().waitFor();
  await s.locator("button", { hasText: "T2" }).first().click(); await s.getByRole("dialog").getByText("412345678901").waitFor();
  await s.keyboard.press("Escape");
  ok("bills: T2's UPI bill with its reference");

  // 0005 on the real database: stations, takeaway token, discount, split payment, dish ticks, close the day
  await s.goto(BASE + "#/settings"); await s.getByLabel("Stations").fill("Tandoor, Curry, tandoor");
  await s.getByRole("button", { name: "Save changes" }).click(); await s.getByText("Settings saved").waitFor();
  if (sql("select array_to_string(stations, ',') from settings") !== "Tandoor,Curry") throw new Error("stations not saved: " + sql("select stations from settings"));
  sql("update categories set station = 'Tandoor' where id = (select category_id from items where name = 'Paneer Tikka')");
  ok("settings: kitchen stations saved (duplicates dropped)");
  await s.goto(BASE + "#/pos"); await s.getByRole("radio", { name: "Takeaway", exact: true }).click();
  await s.getByRole("button", { name: /Paneer Tikka/ }).first().click();
  const pk = s.getByRole("dialog"); if (await pk.isVisible().catch(() => false)) await pk.getByRole("button", { name: /^Add ·/ }).click();
  await s.locator("#ticket").getByRole("button", { name: "Send" }).click();
  await s.getByText(/Sent to the kitchen · Token 1/).waitFor();
  if (sql("select kind || '|' || token_no || '|' || (table_id is null)::text from visits where kind = 'takeaway'") !== "takeaway|1|true") throw new Error("takeaway visit wrong");
  if (sql("select station from order_items oi join orders o on o.id = oi.order_id join visits v on v.id = o.visit_id where v.kind = 'takeaway'") !== "Tandoor") throw new Error("station not copied");
  ok("POS: takeaway token 1 saved without a table; the dish carries its station");
  await s.locator("#ticket").getByRole("button", { name: "Discount" }).click();
  const dd = s.getByRole("dialog", { name: "Discount" });
  await dd.getByRole("button", { name: "10%" }).click(); await dd.getByLabel("Reason").fill("Regular guest");
  await dd.getByRole("button", { name: "Give discount" }).click(); await s.getByText("Discount added").waitFor();
  await s.locator("#ticket").getByRole("button", { name: "Take payment" }).click();
  const sp = s.getByRole("dialog", { name: /Take payment/ });
  await sp.getByRole("button", { name: "Split" }).click(); await sp.getByText("Adds up").waitFor();
  await sp.getByLabel("Payment 1 reference").fill("UTR555");
  await sp.getByRole("button", { name: /Mark paid/ }).click(); await s.getByText("Paid · Token 1").waitFor();
  const parts = sql("select string_agg(p.method || ':' || p.reference, ',' order by p.method desc) from payments p join visits v on v.id = p.visit_id where v.kind = 'takeaway'");
  if (parts !== "upi:UTR555,cash:") throw new Error("split payment rows wrong: " + parts);
  if (sql("select (discount > 0 and paid_method = 'mixed' and total = (select sum(amount) from payments where visit_id = visits.id))::text from visits where kind = 'takeaway'") !== "true")
    throw new Error("discount or totals wrong on the paid takeaway");
  if (sql("select count(*) from activity_log where action = 'discount' and detail like 'Token 1 · %Regular guest'") !== "1") throw new Error("discount not logged");
  ok("discount (logged) and a split payment saved as two payments rows that add up");
  await s.goto(BASE + "#/kitchen"); await s.getByRole("radio", { name: "Tandoor" }).click();
  const tk = s.locator("article", { hasText: "Token 1" }).first();
  await tk.getByRole("button", { name: /Paneer Tikka/ }).click();
  await s.locator("section[aria-label=ready] article", { hasText: "Token 1" }).waitFor();
  if (sql("select o.status || '|' || (oi.done_at is not null)::text from order_items oi join orders o on o.id = oi.order_id join visits v on v.id = o.visit_id where v.kind = 'takeaway'") !== "ready|true")
    throw new Error("dish tick not saved");
  await s.getByRole("radio", { name: "All stations" }).click();
  await s.goto(BASE + "#/pos?table=takeaway"); await s.getByRole("radio", { name: /Token 1, paid, ready/ }).click();
  await s.locator("#ticket").getByRole("button", { name: "Handed over" }).click(); await s.getByText("Token 1 handed over").waitFor();
  ok("kitchen: Tandoor station ticks the dish, the paid takeaway goes Ready, then handed over");
  await s.goto(BASE + "#/today"); await s.getByRole("button", { name: "Close the day" }).click();
  const cd = s.getByRole("dialog", { name: /^Close / });
  await cd.getByLabel("Opening cash (₹)").fill("500");
  const exp = Number((await cd.locator("div", { hasText: /^Expected in the drawer/ }).locator("dd").first().textContent()).replace(/[^\d.]/g, ""));
  await cd.getByLabel("Cash counted").fill(String(exp)); await cd.getByText("matches").waitFor();
  await cd.getByRole("button", { name: "Close the day" }).click(); await s.getByText("Day closed").waitFor();
  if (sql("select (difference = 0 and opening_cash = 500 and upi_sales > 0)::text from day_closes") !== "true") throw new Error("day close row wrong");
  await s.goto(BASE + "#/pos?table=takeaway"); await s.getByRole("button", { name: /Paneer Tikka/ }).first().click();
  if (await pk.isVisible().catch(() => false)) await pk.getByRole("button", { name: /^Add ·/ }).click();
  await s.locator("#ticket").getByRole("button", { name: "Send" }).click(); await s.getByText(/Today has been closed/).first().waitFor();
  await s.goto(BASE + "#/today"); await s.getByRole("button", { name: "See the count" }).click();
  await s.getByRole("dialog").getByPlaceholder(/Why/).fill("Testing reopen"); await s.getByRole("dialog").getByRole("button", { name: "Reopen day" }).click();
  await s.getByText("Day reopened").waitFor();
  if (sql("select count(*) from day_closes") !== "0" || sql("select count(*) from activity_log where action = 'day_reopened'") !== "1") throw new Error("reopen not saved/logged");
  ok("close the day: count matches and is saved; a closed day refuses orders; owner reopens (logged)");

  // Password reset link → set a new password
  const { createHmac } = await import("node:crypto");
  const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
  const h = b64({ alg: "HS256", typ: "JWT" }), p = b64({ sub: "50000000-0000-4000-8000-000000000001", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 });
  const tok = `${h}.${p}.${createHmac("sha256", process.env.SECRET).update(`${h}.${p}`).digest("base64url")}`;
  const r = await page(await browser.newContext());
  await r.goto(`${BASE}#access_token=${tok}&refresh_token=owner@copper.test&expires_in=3600&type=recovery`);
  await r.getByRole("heading", { name: "Set a new password" }).waitFor();
  await r.getByLabel("New password").fill("another-pass-9"); await r.getByLabel("Type it again").fill("another-pass-9");
  await r.getByRole("button", { name: "Save new password" }).click();
  await r.getByRole("heading", { name: /Good (morning|afternoon|evening)/ }).waitFor();
  if (r.url().includes("access_token")) throw new Error("token left in the address bar");
  ok("password reset link opens Set a new password, then signs in (token removed from the address)");

  // Someone switched off sees "waiting"; with no restaurant they can start one
  const n = await page(await browser.newContext());
  await signIn(n, "newbie@x.test");
  await n.getByRole("heading", { name: "Waiting for the owner" }).waitFor();
  ok("a switched-off login sees Waiting for the owner");
  sql("delete from memberships where user_id = '50000000-0000-4000-8000-000000000003'");
  await n.getByRole("button", { name: "Check again" }).click();
  await n.getByLabel("Restaurant name").fill("Spice Route");
  await n.getByRole("button", { name: "Create restaurant" }).click();
  await n.getByRole("heading", { name: /Good (morning|afternoon|evening)/ }).waitFor();
  await n.goto(BASE + "#/floor"); await n.getByText("No tables yet").waitFor();
  ok("a login with no restaurant creates one and starts empty (no Copper Pot data)");
  if (sql("select count(*) from restaurants") !== "2") throw new Error("restaurant not created");

  if (errors.length) throw new Error("Page errors:\n" + [...new Set(errors)].join("\n"));
  console.log("REAL STACK PASSED");
} catch (e) { console.error("FAILED at step", step + 1, ":", e.message); process.exitCode = 1; }
finally { await browser.close(); }
