/* =========================================================
   Dinedot — Help guide shown in the staff app (#help).
   RULE: every change people can see updates its section here AND adds a WHATS_NEW line,
   in the same commit. Written for restaurant staff: short steps, button names as on screen.
   roles: who sees the section (owner, manager, waiter, kitchen).
   ========================================================= */
const ALL = ["owner", "manager", "waiter", "kitchen"], FLOOR = ["owner", "manager", "waiter"], MGR = ["owner", "manager"];
const GUIDE = [
  { id: "start", title: "How it works", roles: ALL, body: `
    <p>Every table has its own QR code. Guests scan it, see the menu, and order from their phone. Orders go straight to the <b>Kitchen</b> screen.</p>
    <ol><li>Guest orders → the ticket appears in <b>Kitchen → New</b> with a sound.</li>
    <li>Kitchen taps <b>Start cooking</b>, then <b>Ready</b>. The guest's phone shows each step.</li>
    <li>A waiter brings the food and taps <b>Served</b>.</li>
    <li>Guest asks for the bill on their phone (split, tip, how they'll pay). The table turns blue on the <b>Floor</b>.</li>
    <li>Waiter takes the payment and taps <b>Mark paid</b>. The table is free again and the guest is asked for a rating.</li></ol>
    <p>The screens refresh by themselves every few seconds. Keep <b>Sound alerts</b> on so you hear new orders and calls.</p>` },
  { id: "floor", title: "Floor", roles: FLOOR, body: `
    <p>Every table as a tile. Colours: <b>amber</b> new or cooking · <b>green</b> ready to serve · <b>blue</b> bill asked · <b>red ring</b> the table is calling.</p>
    <ul><li>Calls (waiter, water, bill, help) show as red chips at the top. Tap <b>On it</b> so the guest sees someone is coming, then <b>Done</b>.</li>
    <li>Tap a tile to see its orders and bill. From there you can move orders along, <b>Add to order</b>, change split, tip and guests, show a <b>UPI QR</b>, or <b>Print</b> the bill.</li>
    <li><b>Mark paid</b>: tap UPI, Cash or Card, then tap again to confirm. You can't mark paid while dishes are still New or Cooking — serve or cancel them first.</li>
    <li>Waiters can cancel an order only while it's still New. Managers can cancel any order and use <b>Clear table without payment</b> (walk-outs, test orders) with a reason.</li></ul>` },
  { id: "take", title: "Taking an order yourself", roles: FLOOR, body: `
    <p>For guests who'd rather tell a waiter: open the table on the <b>Floor</b> → <b>Take an order</b> (or <b>Add to order</b>). Tap <b>+</b> next to dishes; for dishes with sizes or extras, pick them and tap <b>Add</b>. Then <b>Send to kitchen</b>. The ticket is marked “waiter”.</p>` },
  { id: "kitchen", title: "Kitchen", roles: ALL, body: `
    <p>Three columns: <b>New</b>, <b>Cooking</b>, <b>Ready</b>. On a phone, switch between them with the tabs at the top.</p>
    <ul><li>The timer on each ticket counts from when it was ordered. It turns amber at 10 minutes and red at 20.</li>
    <li>Notes from the guest are in red — read them before you start.</li>
    <li>Tapped too early? Use <b>↩</b> to move a ticket back.</li>
    <li><b>Sold out…</b> lets you switch a dish off. Guests can't order it until you switch it back on.</li>
    <li><b>Full screen</b> is best on a kitchen tablet. The screen stays awake while Kitchen is open.</li></ul>` },
  { id: "bills", title: "Bills", roles: FLOOR, body: `
    <p>Every paid or cleared bill. Pick the dates and tap <b>Show</b>. Tap a bill to see it or <b>Print bill</b> again.${""}</p>
    <p>The owner can <b>Download CSV</b> for the accountant. It has no guest details — only tables, amounts and staff names.</p>` },
  { id: "dash", title: "Dashboard", roles: MGR, body: `
    <p>The top row is live: orders in the kitchen, tables in use, today's sales and guests. <b>Guest flow</b> shows how many tables opened each hour today.</p>
    <p><b>Numbers</b> (Today, 7 days, 30 days, This month): sales including GST and tips, bills and average bill, kitchen time (order to ready), rating, sales by day, how people paid, top dishes, and what guests wrote.</p>
    <p>Sales count only paid bills, on the day they were paid. Tips are part of sales.</p>` },
  { id: "menu", title: "Menu", roles: ["owner", "manager", "kitchen"], body: `
    <p>Everyone can switch dishes on and off (sold out) with the switch on the right.</p>
    <p>Owners and managers can also:</p>
    <ul><li><b>+ Section</b> (Starters, Mains…) and <b>Edit</b> to rename, reorder or hide a whole section.</li>
    <li><b>+ Dish</b> or tap a dish: name, price, veg / non-veg / egg, spice, allergens, description and a photo (tap the photo box). Dishes with photos sell better — guests see them on the menu and full size when they tap a dish.</li>
    <li><b>Sizes</b> (Half / Full, Glass / Jug) each have their own price. <b>Extras</b> add to the price (Extra cheese +₹40).</li>
    <li>Prices are always checked on our side, so a guest can't change what they pay.</li></ul>` },
  { id: "tables", title: "Tables & QR codes", roles: MGR, body: `
    <ul><li><b>+ Table</b>: give it a number (T1, T2…), seats and an area (Main, Terrace). Areas group tables on the Floor.</li>
    <li><b>Print QR codes</b> prints a card for every switched-on table. Stick each one on its table.</li>
    <li><b>QR</b> next to a table shows its code, a link to open the guest page, and <b>Replace this QR code</b> — use it if a photo of the QR gets shared outside. The old code stops working at once.</li>
    <li>Switching a table off stops orders from its QR. A table with bills on record can't be deleted, only switched off.</li></ul>` },
  { id: "settings", title: "Settings", roles: ["owner"], body: `
    <ul><li><b>Restaurant</b>: the <b>cover photo</b> at the top of the guest page (tap the photo box, pick a photo, then <b>Save</b>), name, short line, welcome note, the message shown when ordering is paused, brand colour for the guest page, Google review link, guest Wi-Fi.</li>
    <li><b>Bill & payments</b>: GST %, service charge %, the tip choices guests see, your UPI ID, and which payment ways guests can pick.</li>
    <li><b>Team</b>: add logins, choose access (Owner, Manager, Waiter, Kitchen), switch someone off, set a new password, delete a login. Give passwords in person.</li>
    <li><b>Activity</b>: who cancelled orders, cleared tables, paused ordering, changed settings or logins.</li></ul>
    <p><b>Taking orders</b> (left side, owners and managers) pauses QR ordering for everyone — guests see your “paused” message but can still call a waiter.</p>` },
  { id: "guests", title: "What guests see", roles: ALL, body: `
    <ul><li>The menu with veg/non-veg marks, photos, spice, allergens, sizes and extras. A <b>Veg only</b> filter and search.</li>
    <li>After ordering: live status (Received → Cooking → Ready → Served) and the guest Wi-Fi with a copy button.</li>
    <li><b>Call waiter</b> with quick buttons for Water, Bill and Help. They see “On the way” when you tap <b>On it</b>.</li>
    <li><b>Bill</b>: split it equally, add a tip, choose UPI, cash or card. UPI opens their payment app with the amount filled in. The waiter still confirms with <b>Mark paid</b>.</li>
    <li>After paying: a star rating. Happy guests are asked to post on Google; unhappy ones write to you privately.</li></ul>
    <p>Guests never see each other's tables, and we don't ask for their name, phone or email.</p>` },
  { id: "account", title: "Your login", roles: ALL, body: `
    <p>Tap the key / your initial to change your password or sign out. Forgot it? On the sign-in screen type your email and tap <b>Forgot password?</b>, or ask the owner to set a new one.</p>
    <p>Add the staff app to your phone's home screen: in Chrome tap ⋮ → <b>Add to Home screen</b>; on iPhone, Safari → Share → <b>Add to Home Screen</b>.</p>` }
];
const WHATS_NEW = [
  { date: "10 Nov 2026", text: "Cover photo: add a photo of your restaurant in Settings → Restaurant. It shows at the top of the guest menu." },
  { date: "9 Nov 2026", text: "First version: QR menu and ordering, kitchen screen, floor map with calls, bills with split, tip and UPI, ratings, dashboard, menu and table editor, QR printing, team logins." }
];
