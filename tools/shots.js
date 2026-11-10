// Makes the product-page screenshots in img/site/ from the live demo.
// Run from the repo root while a local server is running:  python3 -m http.server 8765 &  node tools/shots.js
const { chromium } = require("playwright");
const OUT = "img/site/", BASE = "http://localhost:8765/";
(async () => {
  const b = await chromium.launch();
  const phone = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: "dark",
    userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile" });
  const g = await phone.newPage();
  await g.goto(BASE + "t.html?k=demo-T3"); await g.evaluate(() => localStorage.clear()); await g.reload();
  await g.waitForLoadState("networkidle"); await g.waitForTimeout(600);
  const hideDemo = () => g.addStyleTag({ content: ".demo-band{display:none!important}" });
  await hideDemo();
  await g.screenshot({ path: OUT + "shot-menu.png" });
  await g.locator(".dish", { hasText: "Chicken Karahi" }).click(); await g.waitForTimeout(500);
  await g.click('[data-size="Full"]'); await g.waitForTimeout(150);
  await g.screenshot({ path: OUT + "shot-dish.png" });
  await g.click("[data-addcart]");
  await g.locator(".dish", { hasText: "Butter Naan" }).locator("[data-plus]").click(); await g.waitForTimeout(200);
  await g.click('[data-addon="Garlic"]'); await g.click('[data-dq="1"]'); await g.click("[data-addcart]");
  await g.click('[data-open="cart"]'); await g.click("[data-place]"); await g.waitForTimeout(1600);
  await g.evaluate(() => { const t = document.getElementById("toast"); if (t) t.className = "toast"; });
  await g.screenshot({ path: OUT + "shot-status.png" });
  await g.click(".sheet-card [data-close]"); await g.click('[data-open="call"]'); await g.waitForTimeout(300);
  await g.click('[data-call="water"]'); await g.waitForTimeout(800);
  await g.evaluate(() => { const t = document.getElementById("toast"); if (t) t.className = "toast"; });
  await g.screenshot({ path: OUT + "shot-call.png" });
  await g.click(".sheet-bg", { position: { x: 10, y: 10 } });
  await g.click('[data-open="table"]'); await g.click('.tabs [data-tab="bill"]'); await g.click('[data-split="3"]'); await g.click('[data-tip="10"]');
  await g.click("[data-askbill]"); await g.waitForTimeout(1000);
  await g.evaluate(() => { const t = document.getElementById("toast"); if (t) t.className = "toast"; document.querySelector(".sheet-card").scrollTop = 260; });
  await g.screenshot({ path: OUT + "shot-bill.png" });
  // review screen: pay the table from a staff session, then rate
  const s = await phone.newPage();
  await s.goto(BASE + "staff.html"); await s.click('[data-demo="waiter@demo"]'); await s.waitForTimeout(900);
  await s.goto(BASE + "staff.html#floor"); await s.waitForTimeout(700);
  await s.evaluate(() => { const v = JSON.parse(localStorage.getItem("dd.demo.v2")); v.orders.forEach(o => { if (["new", "cooking"].includes(o.status)) o.status = "ready"; }); localStorage.setItem("dd.demo.v2", JSON.stringify(v)); });
  await s.waitForTimeout(4500);
  await s.locator(".tile", { hasText: "T3" }).click(); await s.waitForTimeout(400);
  await s.click('[data-paid="upi"]'); await s.click('[data-paid="upi"]'); await s.waitForTimeout(600); await s.close();
  await g.bringToFront(); await g.waitForTimeout(5800);
  await g.click('[data-star="5"]'); await g.waitForTimeout(250);
  await g.screenshot({ path: OUT + "shot-review.png" });

  // staff screens on a laptop
  const lap = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5, colorScheme: "dark" });
  const p = await lap.newPage();
  await p.goto(BASE + "staff.html"); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.click('[data-demo="owner@demo"]'); await p.waitForTimeout(1500);
  await p.addStyleTag({ content: ".demo-band{display:none!important}" });
  await p.screenshot({ path: OUT + "shot-dash.png" });
  for (const [r, f] of [["floor", "shot-floor"], ["kitchen", "shot-kitchen"]]) {
    await p.goto(BASE + "staff.html#" + r); await p.waitForTimeout(900);
    await p.addStyleTag({ content: ".demo-band{display:none!important}" });
    await p.screenshot({ path: OUT + f + ".png" });
  }
  await b.close();
})();
