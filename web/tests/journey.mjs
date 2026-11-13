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
  const tour = staff.getByRole("region", { name: "Tour: Kitchen" });
  await tour.getByRole("button", { name: "Next tip" }).click();
  await tour.getByText(/2 of/).waitFor();
  await tour.getByRole("button", { name: "Skip all tours" }).click();
  await tour.waitFor({ state: "detached" });
  ok("first-time tour shows the kitchen steps and can be skipped");

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
  await guest.getByText("Sent. Your waiter will confirm your table").waitFor();
  await guest.getByText("Waiting for your waiter…").waitFor();
  const tableCode = (await guest.getByLabel(/^Table code \d/).textContent()).trim();
  if (!/^\d{4}$/.test(tableCode)) throw new Error("no table code: " + tableCode);
  await guest.getByText(/Order #\d+/).waitFor();
  if (await staff.locator("article", { hasText: "Dal Makhani" }).filter({ hasText: "T3" }).count()) throw new Error("kitchen saw the order before a waiter's OK");
  ok("guest sends the first order: it waits for a waiter's OK (kitchen doesn't see it yet); the table code shows");
  // a second phone at the table needs the code (no waiter is signed in to the demo, so the pretend waiter accepts the table)
  // (same browser, so the same demo data; this tab pretends to be another phone with its own device id)
  const myDevice = await guest.evaluate(() => localStorage.getItem("dineos.device"));
  const friend = await ctx.newPage(); watch(friend);
  await friend.setViewportSize({ width: 390, height: 844 });
  await friend.addInitScript(() => { if (location.pathname.includes("t.html")) localStorage.setItem("dineos.device", JSON.stringify("g-friend-phone-0000000000")); });
  await friend.goto(BASE + "t.html?k=demo-T3");
  await friend.getByRole("region", { name: "Join Table T3" }).or(friend.getByRole("heading", { name: /^Join / })).first().waitFor();
  const wrongCode = tableCode === "0000" ? "1111" : "0000";
  await friend.getByLabel("Table code").fill(wrongCode);
  await friend.getByText(/That code isn't right\. 2 tries left/).waitFor();
  await friend.getByLabel("Table code").fill(tableCode);
  await friend.getByText("You're in. Order away!").waitFor();
  await friend.getByText(/Order #\d+/).waitFor();
  await friend.close();
  await guest.evaluate(d => localStorage.setItem("dineos.device", d), myDevice);
  ok("a second phone sees nothing until it types the table code; a wrong code is counted");
  await guest.getByText("Waiting for your waiter…").waitFor({ state: "detached", timeout: 20000 });
  ok("the table is accepted; the guest's waiting note goes away");
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
  // A table nobody is sitting at: the waiter turns the order down; a real one: Accept
  const g7 = await ctx.newPage(); watch(g7);
  await g7.setViewportSize({ width: 390, height: 844 });
  const order7 = async () => {
    await g7.goto(BASE + "t.html?k=demo-T7");
    await g7.getByRole("button", { name: "Mains" }).click();
    await g7.locator("li", { hasText: "Dal Makhani" }).getByRole("button", { name: "ADD" }).click();
    if (await g7.getByRole("dialog").isVisible().catch(() => false)) await g7.getByRole("dialog").getByRole("button", { name: /^Add ·/ }).click();
    await g7.getByRole("button", { name: /View order/ }).click();
    await g7.getByRole("button", { name: "Send to kitchen" }).click();
    await g7.getByText("Waiting for your waiter…").waitFor();
  };
  await order7();
  const ask = staff.getByRole("region", { name: "Tables waiting for your OK" }).locator("div", { hasText: "T7 wants to order", has: staff.getByRole("button", { name: "Deny" }) }).last();
  await ask.waitFor();
  await ask.getByRole("button", { name: "Deny" }).click();
  await staff.getByText("T7 turned down").waitFor();
  await g7.getByText(/Your order was turned down/).waitFor({ timeout: 10000 });
  ok("Floor: a table nobody is at is turned down; the phone is told");
  await order7();
  await ask.waitFor();
  await ask.getByRole("button", { name: "Accept" }).click();
  await staff.getByText("T7 accepted: sent to the kitchen").waitFor();
  await g7.getByText("Waiting for your waiter…").waitFor({ state: "detached", timeout: 10000 });
  await staff.getByRole("button", { name: /^T7/ }).first().click();
  await staff.getByRole("dialog").getByLabel(/^Table code \d/).waitFor();
  await staff.keyboard.press("Escape");
  await g7.close();
  ok("Floor: Accept sends it to the kitchen; the waiter sees the table code");
  await staff.getByRole("radio", { name: "Plan" }).click();
  await staff.getByRole("group", { name: "Main floor plan" }).waitFor();
  await staff.getByRole("button", { name: /^T3, (Ordered|Eating)/ }).waitFor();
  ok("floor plan shows T3 with its live state");
  // Guest: the total updates with the tip base0 asking; a tip can be an amount; UPI shows a QR with the amount
  await guest.getByRole("button", { name: "Bill", exact: true }).click();
  const gb = guest.getByRole("dialog", { name: "Your bill" });
  const money = async () => Number((await gb.getByTestId("bill-total").textContent()).replace(/[^\d.]/g, ""));
  const base0 = await money();
  await gb.getByRole("button", { name: "₹ Amount" }).click();
  await gb.getByLabel("Tip amount").fill("50");
  if (await money() !== base0 + 50) throw new Error(`total didn't add the ₹50 tip: ${base0} → ${await money()}`);
  await gb.getByRole("button", { name: "2", exact: true }).click();
  await gb.getByText(/2 ways/).waitFor();
  await gb.getByRole("button", { name: "UPI / QR" }).click();
  await gb.getByRole("button", { name: new RegExp("Ask for the bill · ₹" + Math.ceil((base0 + 50) / 2).toLocaleString("en-IN") + " each") }).click();
  await gb.getByText("A waiter is bringing your bill.").waitFor();
  await gb.getByRole("img", { name: "UPI QR code with the amount" }).waitFor();
  const upi = await gb.getByRole("link", { name: /Pay ₹.* by UPI/ }).getAttribute("href");
  if (!upi.startsWith("upi://pay?") || !upi.includes("am=" + Math.ceil((base0 + 50) / 2))) throw new Error("UPI link: " + upi);
  await guest.keyboard.press("Escape");
  ok("guest: the total shows the ₹50 tip before asking; bill asked split 2 ways by UPI, with the pay link and QR for " + Math.ceil((base0 + 50) / 2));
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
  const rcpt = staff.getByRole("dialog", { name: /Tax invoice · CP\d{4}-\d{4}/ });
  await rcpt.waitFor();
  await rcpt.frameLocator("iframe").getByText("GSTIN: 27ABCDE1234F1Z5").waitFor();
  await rcpt.frameLocator("iframe").getByText(/CGST 2\.5%/).waitFor();
  await rcpt.frameLocator("iframe").getByText(/FSSAI Lic\. No/).waitFor();
  await staff.keyboard.press("Escape");
  ok("waiter takes cash, sees the change, table is freed; the GST bill opens with its number, CGST/SGST and FSSAI");

  // Guest can now rate
  await guest.getByText("How was it?").waitFor({ timeout: 10000 });
  await guest.getByRole("button", { name: "View or share your bill" }).click();
  await guest.getByRole("dialog", { name: /Tax invoice · CP/ }).getByRole("button", { name: "Share" }).waitFor();
  if (await guest.getByRole("dialog").getByRole("button", { name: "Print" }).count()) throw new Error("guests shouldn't get the printer button");
  await guest.keyboard.press("Escape");
  await guest.getByRole("radio", { name: "5 stars" }).click();
  await guest.getByRole("button", { name: "Send" }).click();
  await guest.getByText("Thank you!").waitFor();
  ok("guest rates the visit");

  // Owner sees today's sale; POS sends a staff order with a size
  await signIn(staff, "Owner");
  await staff.getByRole("heading", { name: /Good (morning|afternoon|evening)/ }).waitFor();
  let sales = "";   // the figure counts up from ₹0
  for (let i = 0; i < 30 && (!sales || sales === "₹0"); i++) { if (i) await staff.waitForTimeout(100); sales = (await staff.locator("p", { hasText: /^₹/ }).first().textContent()) ?? ""; }
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

  // ---- 0006: an order sent with no internet waits on the device, then goes by itself ----
  await staff.getByRole("radio", { name: /^T5/ }).click();
  await staff.getByRole("button", { name: /Dal Makhani/ }).first().click();
  const dm = staff.getByRole("dialog"); if (await dm.isVisible().catch(() => false)) await dm.getByRole("button", { name: /^Add ·/ }).click();
  await ctx.setOffline(true);
  await staff.locator("#ticket").getByRole("button", { name: "Send" }).click();
  await staff.getByText(/saved on this device/).first().waitFor();
  await staff.locator("#ticket").getByText(/1 order waiting for the connection: T5/).waitFor();
  await ctx.setOffline(false);
  await staff.evaluate(() => window.dispatchEvent(new Event("online")));
  await staff.getByText(/Sent to the kitchen · T5 \(saved while offline\)/).waitFor({ timeout: 20000 });
  await staff.locator("#ticket").getByText(/waiting for the connection/).waitFor({ state: "detached" });
  await staff.locator("#ticket").getByText("Already ordered").waitFor();
  ok("POS: no internet, order kept on the device and sent once the connection is back");

  // ---- 0005: takeaway token, discount, split payment ----
  await staff.getByRole("radio", { name: "Takeaway", exact: true }).click();
  await staff.getByRole("button", { name: /Paneer Tikka/ }).first().click();
  const extra = staff.getByRole("dialog");
  if (await extra.isVisible().catch(() => false)) await extra.getByRole("button", { name: /^Add ·/ }).click();
  await staff.getByRole("button", { name: /Butter Naan/ }).first().click();
  if (await extra.isVisible().catch(() => false)) await extra.getByRole("button", { name: /^Add ·/ }).click();
  await staff.locator("#ticket").getByRole("button", { name: "Send" }).click();
  await staff.getByText(/Sent to the kitchen · Token 1/).waitFor();
  await staff.locator("#ticket").getByRole("heading", { name: "Token 1" }).waitFor();
  ok("POS: takeaway order gets token 1");
  await staff.locator("#ticket").getByRole("button", { name: "Discount" }).click();
  const dd = staff.getByRole("dialog", { name: "Discount" });
  await dd.getByRole("button", { name: "10%" }).click();
  await dd.getByLabel("Reason").fill("Regular guest");
  await dd.getByRole("button", { name: "Give discount" }).click();
  await staff.getByText("Discount added").waitFor();
  await staff.locator("#ticket").getByText("Discount 10%").waitFor();
  ok("POS: owner gives a 10% discount with a reason");
  await staff.locator("#ticket").getByRole("button", { name: "Take payment" }).click();
  const sp = staff.getByRole("dialog", { name: /Take payment/ });
  await sp.getByRole("button", { name: "Split" }).click();
  await sp.getByText("Adds up").waitFor();
  await sp.getByLabel("Payment 1 reference").fill("UTR778899");
  await sp.getByRole("button", { name: /Mark paid/ }).click();
  await staff.getByText("Paid · Token 1").waitFor();
  await staff.locator("#ticket").getByText(/Paid\. Waiting for the kitchen/).waitFor();
  ok("POS: takeaway paid in two parts before the food is ready");

  // Kitchen: Tandoor station sees only its dishes and ticks them off
  await staff.goto(BASE + "#/kitchen");
  await staff.getByRole("radio", { name: "Tandoor" }).click();
  const tk = staff.locator("article", { hasText: "Token 1" }).first();
  await tk.getByText(/Takeaway · paid/).waitFor();
  if (!(await tk.getByRole("button", { name: /Paneer Tikka/ }).isDisabled())) throw new Error("a New order's dish can be ticked");
  await tk.getByRole("button", { name: "Start cooking" }).click();
  const tc = staff.locator("section[aria-label=cooking] article", { hasText: "Token 1" });
  await tc.getByRole("button", { name: /Paneer Tikka/ }).click();
  await tc.getByRole("button", { name: /Paneer Tikka, done/ }).waitFor();
  await tc.getByRole("button", { name: /Butter Naan/ }).click();
  await staff.locator("section[aria-label=ready] article", { hasText: "Token 1" }).waitFor();
  ok("kitchen: station filter, no ticks on New, dishes ticked one by one while Cooking, order moves to Ready");
  await staff.getByRole("radio", { name: "All stations" }).click();
  await staff.goto(BASE + "#/pos?table=takeaway");
  await staff.getByRole("radio", { name: /Token 1, paid, ready/ }).click();
  await staff.locator("#ticket").getByRole("button", { name: "Handed over" }).click();
  await staff.getByText("Token 1 handed over").waitFor();
  await staff.getByRole("radio", { name: /Token 1/ }).waitFor({ state: "detached" });
  ok("POS: token handed over and leaves the screen");

  // ---- Manage screens (owner) ----
  const nav = async (route) => { await staff.goto(BASE + "#/" + route); await staff.waitForTimeout(300); };
  if (W < 1024) {   // phone tab bar: the highlight sits under the tab of the screen you're on
    for (const [route, label] of [["kitchen", "Kitchen"], ["floor", "Floor"], ["today", "Today"]]) {
      await nav(route); await staff.waitForTimeout(500);
      const bar = staff.getByRole("navigation", { name: "Main" });
      const pill = await bar.locator(".glide").boundingBox(), tab = await bar.getByRole("button", { name: new RegExp(label + "$") }).first().boundingBox();
      if (!pill || !tab || Math.abs(pill.x + pill.width / 2 - (tab.x + tab.width / 2)) > 4) throw new Error(`tab highlight isn't under ${label}: ${JSON.stringify({ pill, tab })}`);
    }
    await nav("kitchen"); await staff.getByRole("button", { name: "Go to your home screen" }).click();
    await staff.waitForURL(/#\/today$/);
    ok("phone tab bar: the highlight follows the screen (Kitchen, Floor, Today); the logo goes home");
  }
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
  await staff.getByRole("button", { name: "Areas" }).click();
  const ar = staff.getByRole("dialog");
  await ar.getByLabel("New area").fill("garden ");
  await ar.getByRole("button", { name: "Add area" }).click();
  await staff.getByText("Area added").waitFor();
  await ar.getByRole("group", { name: "Room shape of garden" }).getByRole("radio", { name: "Square" }).click();
  await staff.getByText("Room shape saved").waitFor();
  await ar.getByLabel("Name of garden").fill("Garden");
  await ar.getByRole("button", { name: "Rename" }).click();
  await staff.getByText("Area renamed").waitFor();
  await ar.getByRole("button", { name: "Delete Main" }).isDisabled() || (() => { throw new Error("Main has tables but could be deleted"); })();
  await staff.keyboard.press("Escape");
  await ar.waitFor({ state: "detached" });
  ok("tables: area added, room shape set, renamed; an area with tables can't be deleted");
  await staff.getByRole("button", { name: "Add table" }).click();
  const tb = staff.getByRole("dialog");
  await tb.getByLabel("Table number").fill("Z9");
  await tb.getByLabel("Area").selectOption("Garden");
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
  await staff.getByRole("dialog").waitFor({ state: "detached" });
  await staff.getByRole("group", { name: "Garden floor plan" }).waitFor();
  await staff.getByRole("button", { name: "Arrange tables" }).click();
  await staff.getByRole("button", { name: /^Z9, 4 seats/ }).focus();
  await staff.keyboard.press("Shift+ArrowRight");
  await staff.getByLabel("Add to the room").selectOption("entrance");
  await staff.getByRole("button", { name: /^Entrance marker/ }).focus();
  await staff.keyboard.press("ArrowDown");
  await staff.getByRole("button", { name: "Save layout" }).click();
  await staff.getByText("Layout saved").waitFor();
  await staff.getByRole("button", { name: "Arrange tables" }).waitFor();
  await staff.getByRole("group", { name: "Garden floor plan" }).locator("text", { hasText: "Entrance" }).waitFor();
  ok("tables: floor plan, a table and the entrance placed with the keyboard, layout saved");
  await staff.getByRole("button", { name: "Print QR codes" }).click();
  const qrFrame = () => [...document.querySelectorAll("iframe[srcdoc]")].map(f => f.getAttribute("srcdoc")).find(h => h.includes("QR codes</title>"));
  await staff.waitForFunction(qrFrame);
  const qrSheet = await staff.evaluate(qrFrame);
  const cards = (qrSheet.match(/class="card"/g) || []).length;
  if (cards < 9 || !qrSheet.includes("Z9") || qrSheet.includes("Floor plan")) throw new Error("QR print sheet: " + cards + " cards");
  ok("tables: Print QR codes prints only the cards (" + cards + "), not the app");

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
  await staff.getByText(/Print QR codes prints one card per table/).first().waitFor();
  ok("help: what's new and the Tables & QR guide");

  // ---- 0006: bill settings, cashier ----
  await nav("settings");
  await staff.getByLabel("GSTIN").fill("27ABC");
  await staff.getByRole("button", { name: "Save changes" }).click();
  await staff.getByText(/Check the GSTIN/).waitFor();
  await staff.getByLabel("GSTIN").fill("27ABCDE1234F1Z5");
  await staff.getByLabel("Bill number prefix").fill("TCP");
  await staff.getByRole("button", { name: "Save changes" }).click();
  await staff.getByText("Settings saved").waitFor();
  ok("settings: a wrong GSTIN is refused; bill prefix saved");

  // ---- 0005: team notice and closing the day ----
  await nav("today");
  await staff.getByLabel("Team notice").fill("Biryani is off tonight.");
  await staff.getByRole("button", { name: "Post" }).click();
  await staff.getByText("Notice posted").waitFor();
  await staff.getByRole("status").filter({ hasText: "Team notice from Meera: Biryani is off tonight." }).waitFor();
  ok("today: owner posts a team notice; it shows at the top");
  await staff.getByRole("button", { name: "Close the day" }).click();
  const cd = staff.getByRole("dialog", { name: /^Close / });
  await cd.getByText(/still open/).waitFor();
  await staff.keyboard.press("Escape");
  // clear the tables still open in the demo, then close for real
  await staff.evaluate(async () => { const D = window.Demo; const live = await D.rpc("staff_live");
    for (const v of live.visits.filter(v => v.status !== "paid")) await D.rpc("staff_void_visit", { p_visit: v.id, p_reason: "end of test" }); });
  await staff.reload();
  await staff.getByRole("button", { name: "Close the day" }).click();
  await cd.getByLabel("Opening cash (₹)").fill("1000");
  const expected = Number((await cd.locator("div", { hasText: /^Expected in the drawer/ }).locator("dd").first().textContent()).replace(/[^\d.]/g, ""));
  await cd.getByLabel("Cash counted").fill(String(expected - 20));
  await cd.getByText(/₹20 short/).waitFor();
  await cd.getByRole("button", { name: "Close the day" }).click();
  await staff.getByText("Day closed").waitFor();
  await staff.getByText(/Today has been closed/).first().waitFor();
  ok("today: cash counted against expected, day closed (₹20 short shown)");
  await staff.getByRole("button", { name: "See the count" }).click();
  const rc = staff.getByRole("dialog", { name: /is closed/ });
  await rc.getByPlaceholder(/Why/).fill("Late table came in");
  await rc.getByRole("button", { name: "Reopen day" }).click();
  await staff.getByText("Day reopened").waitFor();
  ok("today: owner reopens the day with a reason");

  await signIn(staff, "Cashier");
  await staff.getByRole("heading", { name: "POS & billing" }).waitFor();
  if (await staff.getByRole("link", { name: "Today" }).count() + await staff.getByRole("button", { name: "Today", exact: true }).count()) throw new Error("cashier sees Today");
  await staff.getByRole("button", { name: /Calls from tables/ }).click();
  await staff.getByRole("dialog").getByRole("switch", { name: "Sound alerts" }).waitFor();
  await staff.keyboard.press("Escape");
  ok("cashier signs in and lands on the POS; alert settings are in the bell");

  if (errors.length) throw new Error("Page errors:\n" + [...new Set(errors)].join("\n"));
  console.log(`DINEOS JOURNEY PASSED (${W}px)`);
} catch (e) {
  console.error("FAILED at step", step + 1, ":", e.message);
  process.exitCode = 1;
} finally { await browser.close(); }
