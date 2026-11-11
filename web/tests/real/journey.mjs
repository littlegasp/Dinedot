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
