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
  // sign out and clear the address, so the next person starts on their own home screen
  await page.evaluate(() => { localStorage.removeItem("dd.demo.user"); history.replaceState(null, "", location.pathname); });
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

  // ---- Manage screens (owner) ----
  const nav = async (route) => { await staff.goto(BASE + "#/" + route); await staff.waitForTimeout(300); };
  await nav("menu");
  await staff.getByRole("heading", { name: "Menu", exact: true }).waitFor();
  await staff.getByRole("button", { name: "Add dish" }).click();
  const dish = staff.getByRole("dialog");
  await dish.getByLabel("Dish name").fill("Test Thali");
  await dish.getByLabel("Price (₹)").fill("350");
  await dish.getByRole("button", { name: "Add size" }).click();
  await dish.getByLabel("Sizes name").fill("Mini");
  await dish.getByLabel("Sizes price").fill("199");
  await dish.getByRole("button", { name: "Save dish" }).click();
  await staff.getByText("Dish saved").waitFor();
  await staff.getByRole("switch", { name: /Test Thali: on the menu/ }).click();
  await staff.getByText("Test Thali marked sold out").waitFor();
  ok("menu: owner adds a dish with a size and marks it sold out");
  await guest.goto(BASE + "t.html?k=demo-T5");
  await guest.getByPlaceholder("Search the menu").fill("Test Thali");
  await guest.locator("li", { hasText: "Test Thali" }).getByText("Sold out").waitFor();
  ok("guest menu shows the new dish as sold out");

  await nav("tables");
  await staff.getByRole("button", { name: "Add table" }).click();
  const tb = staff.getByRole("dialog");
  await tb.getByLabel("Table number").fill("Z9");
  await tb.getByLabel("Area").fill("Garden");
  await tb.getByRole("button", { name: "Save table" }).click();
  await staff.getByText("Table saved").waitFor();
  await staff.getByRole("button", { name: /^Z9/ }).first().click();
  await staff.getByRole("dialog").getByRole("img", { name: "QR code" }).waitFor();
  const before = await staff.getByRole("dialog").getByRole("link", { name: "Open the guest page" }).getAttribute("href");
  await staff.getByRole("dialog").getByRole("button", { name: "Replace QR" }).click();
  await staff.getByRole("dialog").getByRole("button", { name: "Replace QR" }).last().click();
  await staff.getByText("New QR made").waitFor();
  await staff.waitForTimeout(300);
  const after = await staff.getByRole("dialog").getByRole("link", { name: "Open the guest page" }).getAttribute("href");
  if (!before || before === after) throw new Error("QR was not replaced");
  await staff.keyboard.press("Escape");
  ok("tables: add a table, see its QR, replace the QR");

  await nav("settings");
  await staff.getByLabel("Tagline").fill("Tested tagline");
  await staff.getByRole("button", { name: "Save changes" }).click();
  await staff.getByText("Settings saved").waitFor();
  await guest.goto(BASE + "t.html?k=demo-T5");
  await guest.getByText("Tested tagline").waitFor();
  ok("settings: tagline saved and shown on the guest page");

  await nav("team");
  await staff.getByRole("button", { name: "Add login" }).click();
  const tm = staff.getByRole("dialog");
  await tm.getByLabel("Name").fill("Asha Test");
  await tm.getByLabel("Email").fill("asha@demo.in");
  await tm.getByLabel(/First password/).fill("password-123");
  await tm.getByRole("button", { name: "Add login" }).click();
  await staff.getByText(/Login added for Asha Test/).waitFor();
  await staff.getByText("asha@demo.in").waitFor();
  ok("team: owner adds a login");

  await nav("bills");
  await staff.locator("button", { hasText: "T3" }).filter({ hasText: "Cash" }).first().waitFor();
  ok("bills: today's T3 cash bill is listed");
  await nav("help");
  await staff.getByRole("heading", { name: "What's new" }).waitFor();
  await staff.getByRole("button", { name: "Tables & QR" }).last().click();
  await staff.getByText(/Print QR codes prints one card per table/).waitFor();
  ok("help: what's new and the Tables & QR guide");

  if (errors.length) throw new Error("Page errors:\n" + [...new Set(errors)].join("\n"));
  console.log(`DINEOS JOURNEY PASSED (${W}px)`);
} catch (e) {
  console.error("FAILED at step", step + 1, ":", e.message);
  process.exitCode = 1;
} finally { await browser.close(); }
