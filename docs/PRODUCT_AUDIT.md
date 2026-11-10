# DineOS — Product Audit (Phase 0)

**Audited commit:** `7d7c296` on `main` (contains all of `photos-and-site` plus the dining-room cover commit).
**Branch for this audit:** `dineos-audit` (documents only — no code, schema or production change).
**Date:** 10 Nov 2026.

> The brief names `photos-and-site` as the working branch. That branch was merged into `main` (`fcf947b`) before this audit, and `main` is one commit ahead (`7d7c296`, new cover photo). Auditing `main` covers everything on `photos-and-site`. The brief's note that "screenshots and photography assets are still to be added" is out of date: 18 dish photos, a cover and 9 screenshots are committed under `img/`.

## 1. How this audit was done

| Method | What was covered |
|---|---|
| Read every source file | `t.html`, `guest.js` (367 lines), `guest.css`, `staff.html`, `staff.js` (761), `staff.css`, `staff-guide.js`, `api.js` (132), `demo.js` (383), `config.js`, `index.html`, `supabase/migrations/0001_init.sql` (886), `0002_cover_photo.sql` (63), `supabase/functions/team-admin/index.ts` (125), tests, `tools/shots.js` |
| Database tests (run today) | `supabase/test/test.sql` on local PostgreSQL 16 with a Supabase stub → **ALL TESTS PASSED** (28 checks incl. role limits, pricing, rate limits, bill maths, review, cover photo) |
| Browser end-to-end (run today) | Playwright, demo mode, 390 px phone: guest orders → kitchen sees ticket → cooking → ready → waiter serves → guest splits 2 ways + 5 % tip, UPI → waiter marks paid → guest rates → owner sees the review; owner adds a dish with sizes, a table, a service charge and a login; guest bill reflects the service charge. **All passed, no console errors.** These scripts live outside the repo (see Known Risks R-16). |
| Targeted probes (run today, local Postgres) | Concurrent first order on one table; order-status changes on a paid bill; default execute rights for a new function; payment fields stored |
| Not run | `team-admin` edge function against a real Supabase project; real Supabase Auth, Storage and RLS on a hosted project; any real device/printer; load testing |

**Important:** everything was verified in **demo mode** or against **local PostgreSQL with a Supabase stub**. No hosted Supabase project for a real restaurant exists yet, so no feature below is "proven in production".

## 2. Status definitions

| Status | Meaning |
|---|---|
| ✅ Fully functional | Whole journey works, data persists, and a test or reproducible check exists |
| 🟡 Partially functional | Core path works; important paths, edge cases or integrations missing |
| 🖼 UI prototype only | Screen or control exists but does not complete the real operation |
| ⬜ Not implemented | Nothing meaningful exists |
| ❔ Needs verification | Code exists but evidence is insufficient to claim it works |

## 3. Module inventory (existing code)

### 3.1 Guest / Customer

| Capability | Status | Evidence | Gaps |
|---|---|---|---|
| Table QR opens table context | ✅ | `t.html?k=<token>`; `table_by_token` (0001 L324), `guest_menu` (0002) | — |
| Digital menu: categories, photos, veg/non-veg/egg, spice, allergens, search, Veg-only | ✅ | `guest.js` `renderMenu`, `dishRow`; E2E | Clickable rows are `<div>`s — not keyboard-reachable |
| Sizes and extras (modifiers) | ✅ | `price_cart` 0001 L245 validates sizes/extras server-side | Single-choice size + multi extras only; no modifier groups, min/max rules |
| Cart, notes, guest count | ✅ | `renderCart`, `placeOrder` guest.js L200 | Cart is per-browser (localStorage), not shared by people at one table |
| Order submission with server-side pricing | ✅ | `guest_order` L407 → `add_order` L334 → `price_cart` | No idempotency key (R-05); race on first order (R-01) |
| Live order status | ✅ | `poll()` every 5 s, guest.js L53–58 | Order-level only (no item level) |
| Guest Wi-Fi | ✅ | `guest_state` returns Wi-Fi only while a visit is open | Password visible to anyone holding the QR link (by design) |
| Call waiter / water / bill / help | ✅ | `guest_call` L418, de-dupe + 8 per 10 min limit L428 | — |
| Bill preview, equal split, tip, payment choice | ✅ | `guest_bill` L436, `billHtml` guest.js L231 | Equal split only; no split by item/seat |
| UPI deep links (GPay/PhonePe/Paytm/other) + desktop QR | 🟡 | `upiHtml` guest.js L259 | Opens the app with amount; **payment is not verified** — staff confirm manually (by design, R-09) |
| Rating + Google review prompt | ✅ | `guest_review` L456, `openThanks` L298 | Review allowed while visit still open (minor) |
| Restaurant landing page | 🟡 | `index.html` is the **DineOS/Dinedot product** page, not a per-restaurant public site | No per-restaurant website/menu page outside QR |
| Reservation journey | ⬜ | — | — |

### 3.2 Waiter

| Capability | Status | Evidence | Gaps |
|---|---|---|---|
| Floor map with live table states and calls | ✅ | `tableState` staff.js L212, `staff_live` L481, polling 4 s (L99) | Polling, not realtime; no layout editor (grid by area) |
| Seat a table / guest count before ordering | ⬜ | Visit opens only on first order (`add_order`) | Cannot "seat" an empty table |
| Take / add to order for a table | ✅ | `takeOrder` L443, `staff_add_order` | No edit of a sent item (cancel whole order only) |
| Order status (serve) | ✅ | `staff_order_status` L510 | **No state-machine guard** — any status → any status, even on paid bills (R-02) |
| Cancel order | 🟡 | Waiter: only `new`; manager: any (L510ff) | Cancels whole order, not single items; reason optional |
| Bill: split, tip, guests, UPI QR, print | ✅ | `tableDrawer` L403, `staff_visit_update`, `printBill` L590 | Print is browser print (no ESC/POS) |
| Mark paid (UPI / cash / card) | 🟡 | `staff_mark_paid` L561 | No amount tendered, change, reference or split tender; "mixed" is a label only (R-08) |
| Clear table without payment (void) | ✅ | `staff_void_visit` L583, reason required, logged | — |
| Transfer / merge tables, handover | ⬜ | — | — |

### 3.3 Kitchen Display (KDS)

| Capability | Status | Evidence | Gaps |
|---|---|---|---|
| Live tickets New / Cooking / Ready | ✅ | `ticket()` staff.js L382 | Polling every 4 s (R-11) |
| Timers, late colouring (10 / 20 min), notes highlighted | ✅ | `ticket()` | — |
| Bump back (↩) | ✅ | `data-ost=…:new/cooking` | — |
| Sold-out switch | ✅ | `staff_item_available`, logged | — |
| Sound alert, screen wake lock, full screen | 🟡 | `beep` L79, `keepAwake` | Sound only after a user tap (browser rule); untested on real tablets |
| Station routing (tandoor / curry / bar) | ⬜ | — | — |
| Item-level status, priority, recall, delayed alerts | ⬜ | Status is per order only | — |
| Offline / reconnect behaviour | 🟡 | "Offline — retrying" label; next poll refreshes | No stale indicator, no queued actions |

### 3.4 Owner / Admin

| Capability | Status | Evidence | Gaps |
|---|---|---|---|
| Dashboard: live KPIs, guest flow by hour, sales, bills, kitchen time, rating, payment mix, top dishes, comments | ✅ | `owner_report` L776, `report()` staff.js | Sales = paid bills only; no comparisons to prior period |
| Menu: sections, dishes, sizes, extras, allergens, photos, order | ✅ | `owner_save_item` L650 etc.; E2E | **Price changes not logged** (R-12); no item-level tax rate; no scheduling (breakfast menu) |
| Tables: add/edit, areas, QR print, replace QR | ✅ | `owner_save_table`, `owner_new_token` L725, `printQr` | — |
| Settings: name, tagline, colour, cover, Wi-Fi, GST %, service %, tips, UPI, payment ways, review link, pause ordering | ✅ | `owner_save_settings` (0002) | `tip_options` not range-checked in SQL (R-14) |
| Team: add login, role, switch off, password, delete | ❔ | `team-admin/index.ts` (owner check via `staff_me`, L54–56) | **Never run against hosted Supabase**; email change does not update `staff.email` (R-13) |
| Roles & permissions | ✅ | `is_floor/is_manager/is_owner`; SQL test covers kitchen/waiter/manager limits | No cashier or inventory role |
| Audit log (Activity) | 🟡 | `activity_log` L64; logged: cancel, clear table, sold out, QR replaced, settings, logins | **Not logged:** payments, price/menu edits, split/tip changes (R-12) |
| Bills list + CSV | ✅ | `staff_bills`, `downloadCsv` L629 | Not a GST-compliant invoice register (R-07) |
| Help guide + What's new | ✅ | `staff-guide.js` | — |
| Customers, loyalty, expenses, cash register, reconciliation, GST reports | ⬜ | — | — |

### 3.5 POS (cashier counter)

| Capability | Status | Notes |
|---|---|---|
| Dine-in order entry | 🟡 | Exists as waiter "Take an order" on a table; no counter-style POS screen |
| Takeaway / delivery order types | ⬜ | Every order belongs to a table |
| Discounts | ⬜ | — |
| Hold / resume, split tender, refunds | ⬜ | — |
| Shift / cash drawer | ⬜ | — |
| Receipts | 🟡 | Browser-print receipt with UPI QR; no invoice number, GSTIN, HSN/SAC, CGST/SGST split |

### 3.6 Inventory & Purchasing · Customer & Growth · Finance

| Area | Status |
|---|---|
| Ingredients, units, recipes/BOM, stock ledger, purchase orders, receiving, suppliers, wastage, alerts | ⬜ Not implemented (nothing in schema or UI) |
| Customer profiles, visit history, loyalty, offers, opt-out | ⬜ Not implemented — and today **no guest personal data is collected at all** (deliberate) |
| Sales summaries, tips, GST total, payment-method totals | 🟡 in `owner_report` |
| Cash reconciliation, expenses, refunds, daily close, P&L, GST exports | ⬜ |

### 3.7 Platform

| Capability | Status | Evidence / gap |
|---|---|---|
| Demo mode (in-browser mirror of every DB function) | ✅ | `demo.js`; every function the UI calls has a mirror (checked by listing). Differences: browser timezone vs `Asia/Kolkata`, JS floating-point money, simulated team admin, a "pretend kitchen" bot |
| Product marketing page | ✅ | `index.html`, real screenshots via `tools/shots.js` |
| Multi-restaurant | ⬜ | One Supabase project + one repo copy per restaurant (template model). No `restaurant_id` anywhere |
| Deployment | 🟡 | GitHub Pages from `main` (public repo); no staging, no security headers |
| Automated tests in CI | ⬜ | Only `supabase/test/test.sql`, run by hand; no CI; E2E scripts not committed |

## 4. Strengths worth keeping

1. **Server-side money.** `price_cart` and `visit_bill` compute every price; the browser's prices are ignored (SQL test: a forged `price: 1` is ignored). Bills are frozen on payment (`staff_mark_paid` copies subtotal, service, GST, tip, total).
2. **Function-only data access.** All 11 tables have RLS on and all grants revoked (L234–239); anon can call exactly six `guest_*` functions (L855), each requiring a 72-bit random table token.
3. **Role checks in the database,** not just hidden buttons (SQL tests prove kitchen cannot cancel, pay, change settings or read QR tokens).
4. **Guest privacy by design:** no name, phone or email is ever asked.
5. **Demo mode** makes the product sellable before setup.
6. **Help guide discipline** (every visible change documented).

## 5. Gaps against the DineOS target scope (summary)

| Module | Today |
|---|---|
| Guest QR ordering | Strong core; needs idempotency, race fix, accessibility |
| Waiter | Good; missing seat-without-order, item edits, transfer/merge |
| KDS | Good single-station; missing stations, item status, realtime |
| POS | Not a POS yet — no takeaway, discounts, split tender, refunds, shifts |
| Owner/Admin | Good for a single small restaurant; audit trail incomplete |
| Inventory | Absent |
| Customers/Growth | Absent (and requires a consent design first) |
| Finance | Basic sales numbers only; no GST invoicing, reconciliation or daily close |

See `KNOWN_RISKS.md` for the issues, `WORKFLOW_MAP.md` for journeys, `ARCHITECTURE_ASSESSMENT.md` for the stack decision, `MIGRATION_PLAN.md` and `PRODUCT_ROADMAP.md` for the plan.
