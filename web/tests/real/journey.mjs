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
