// DineOS browser journey on the demo restaurant: guest orders → kitchen → waiter serves and
// takes payment → owner sees the sale. Run:  npx next build && npx serve-less:  python3 -m http.server 8792 -d out &
//   node tests/journey.mjs [baseUrl]      → "DINEOS JOURNEY PASSED"
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.argv[2] || "http://localhost:8792/";
const W = Number(process.env.WIDTH || 1440);
let step = 0;
const ok = (m) => console.log(`  ✓ ${++step}. ${m}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: 900 } });
const errors = [];
const watch = p => { p.on("pageerror", e => errors.push(e.message)); p.on("console", m => m.type() === "error" && !/favicon/.test(m.text()) && errors.push(m.text())); };

async function signIn(page, role) {
  await page.goto(BASE + "#/");
  await page.evaluate(() => localStorage.removeItem("dd.demo.user"));
  await page.reload();
  await page.getByRole("button", { name: new RegExp(role) }).first().click();
  await page.waitForSelector("main");
}

try {
  // Staff tab first, so the demo's pretend kitchen leaves new orders to us
  const staff = await ctx.newPage(); watch(staff);
  await staff.goto(BASE);
  await staff.evaluate(() => { localStorage.removeItem("dd.demo.v2"); localStorage.removeItem("dd.demo.user"); });
  await signIn(staff, "Kitchen");
  await staff.getByRole("heading", { name: "Kitchen" }).waitFor();
  ok("kitchen signs in and lands on the kitchen screen");

  // Guest on table T3
  const guest = await ctx.newPage(); watch(guest);
  await guest.setViewportSize({ width: 390, height: 844 });
  await guest.goto(BASE + "t.html?k=demo-T3");
  await guest.getByRole("heading", { name: "The Copper Pot" }).waitFor();
  ok("guest page opens from the QR token");
  await guest.getByRole("button", { name: "Mains" }).click();
  const addBtn = guest.locator("li", { hasText: "Dal Makhani" }).getByRole("button", { name: "ADD" });
  await addBtn.click();
  const pick = guest.getByRole("dialog");
  if (await pick.isVisible().catch(() => false)) await pick.getByRole("button", { name: /^Add ·/ }).click();
  await guest.getByRole("button", { name: /View order/ }).click();
  await guest.getByRole("button", { name: "Send to kitchen" }).click();
  await guest.getByText("Order sent to the kitchen").waitFor();
  await guest.getByText(/Order #\d+/).waitFor();
  ok("guest sends an order and sees it tracked");
  await guest.getByRole("button", { name: "Call waiter" }).click();
  await guest.getByText("A waiter is on the way").waitFor();
  ok("guest calls a waiter");

  // Kitchen sees the ticket and moves it along
  const t3 = staff.locator("article", { hasText: "Dal Makhani" }).filter({ hasText: "T3" }).first();
  await t3.waitFor({ timeout: 10000 });
  await t3.getByRole("button", { name: "Start cooking" }).click();
  await staff.locator("section[aria-label=cooking] article", { hasText: "T3" }).filter({ hasText: "Dal Makhani" }).first().getByRole("button", { name: "Mark ready" }).click();
  await staff.locator("section[aria-label=ready] article", { hasText: "T3" }).filter({ hasText: "Dal Makhani" }).first().waitFor();
  ok("kitchen starts cooking and marks it ready");
  await guest.locator("li", { hasText: "Ready" }).first().waitFor({ timeout: 10000 });
  ok("guest tracker shows Ready");

  // Waiter: handles the call, serves, takes payment
  await signIn(staff, "Waiter");
  await staff.getByRole("heading", { name: "Floor" }).waitFor();
  await staff.getByText(/T3 called a waiter/).waitFor();
  await staff.locator("section[aria-label='Calls from tables'] > div", { hasText: "T3 called a waiter" }).getByRole("button", { name: "Done" }).click();
  await staff.getByText("T3 handled").waitFor();
  ok("waiter clears the call");
  await staff.getByRole("button", { name: /^T3/ }).first().click();
  const sheet = staff.getByRole("dialog");
  while (await sheet.getByRole("button", { name: "Served" }).count()) { await sheet.getByRole("button", { name: "Served" }).first().click(); await staff.waitForTimeout(400); }
  ok("waiter marks ready dishes served");
  await sheet.getByRole("button", { name: /Bill & pay/ }).click();
  const pay = staff.getByRole("dialog", { name: /Take payment/ });
  await pay.waitFor();
  const kitchenBusy = await pay.getByText(/still with the kitchen/).isVisible();
  if (kitchenBusy) throw new Error("table T3 still has dishes in the kitchen (seeded or bot)");
  await pay.getByRole("button", { name: "Cash" }).click();
  await pay.getByLabel("Cash handed over").fill("5000");
  await pay.getByText(/Give back/).waitFor();
  await pay.getByRole("button", { name: /Mark paid/ }).click();
  await staff.getByText(/Paid · table T3 is free/).waitFor();
  ok("waiter takes cash, sees the change, table is freed");

  // Guest can now rate
  await guest.getByText("How was it?").waitFor({ timeout: 10000 });
  await guest.getByRole("radio", { name: "5 stars" }).click();
  await guest.getByRole("button", { name: "Send" }).click();
  await guest.getByText("Thank you!").waitFor();
  ok("guest rates the visit");

  // Owner sees today's sale; POS sends a staff order with a size
  await signIn(staff, "Owner");
  await staff.getByRole("heading", { name: /Good (morning|afternoon|evening)/ }).waitFor();
  const sales = await staff.locator("p", { hasText: /^₹/ }).first().textContent();
  if (!sales || sales === "₹0") throw new Error("Today shows no sales");
  ok(`owner sees today's sales (${sales})`);
  await staff.goto(BASE + "#/pos");
  await staff.getByRole("radio", { name: /^T8/ }).click();
  await staff.getByRole("button", { name: /Chicken Karahi/ }).first().click();
  await staff.getByRole("dialog").getByRole("button", { name: /^Add ·/ }).click();
  await staff.locator("#ticket").getByRole("button", { name: "Send" }).click();
  await staff.getByText(/Sent to the kitchen · T8/).waitFor();
  await staff.locator("#ticket").getByText("Already ordered").waitFor();
  ok("POS sends a dine-in order with a size, bill comes back from the server");

  if (errors.length) throw new Error("Page errors:\n" + [...new Set(errors)].join("\n"));
  console.log(`DINEOS JOURNEY PASSED (${W}px)`);
} catch (e) {
  console.error("FAILED at step", step + 1, ":", e.message);
  process.exitCode = 1;
} finally { await browser.close(); }
