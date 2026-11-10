# DineOS — Workflow Map (Phase 0)

For each core workflow (brief §6): **current** journey as built (verified), **target** journey, states, data writes, permissions, failure paths, and the tests that prove it.

Legend: ✅ exists · 🟡 partial · ⬜ missing.

---

## A. Dine-in waiter order

**Current**
1. Waiter opens Floor → taps a table (`tableDrawer`). 🟡 Cannot seat a table without ordering.
2. "Take an order" → picks dishes, sizes, extras, note, guest count (`takeOrder`). ✅
3. `staff_add_order` → `add_order`: opens visit if none, prices lines in `price_cart`, inserts `orders` + `order_items` (price snapshot per line). ✅
4. Kitchen sees the ticket on the next poll (≤ 4 s). ✅
5. Waiter sees status per order; taps Served when ready. ✅

**States** — Visit: `open → bill → paid | void`. Order: `new → cooking → ready → served | cancelled` (today **not enforced**, R-02).
**Writes** — `visits` (first order), `orders`, `order_items`.
**Permissions** — owner, manager, waiter (`is_floor`).
**Failure paths** — sold-out item → clear message ✅; two first orders at once → raw error ⬜ (R-01); network retry → possible duplicate ⬜ (R-05).

**Target additions** — seat table + guest count without ordering; edit/void a single item before cooking; transfer/merge tables; handover to another waiter; per-line send (course firing).

**Tests** — ✅ SQL (`staff_add_order` permissions; pricing); ✅ E2E (waiter adds dishes). To add: concurrent first order, duplicate submit, transitions.

---

## B. Kitchen preparation

**Current**
1. KDS polls `staff_live` every 4 s; New / Cooking / Ready columns. ✅
2. Start cooking → Ready; ↩ moves back. ✅ Timers amber 10 min / red 20 min. ✅
3. Ready shows to waiters (Floor tile turns green, nav badge). ✅
4. Reconnect: next successful poll replaces the whole state, so tickets are never duplicated or lost on screen. ✅ (by design of full refresh)

**Missing** — station routing; item-level status; priority/rush; recall from served; ready notification to a specific waiter; stale-data indicator.

**Target** — tickets split by station (`items.station`), item status `queued → preparing → ready`, order ready when all items ready; Realtime push with polling fallback and "last updated Xs ago".

**Tests** — ✅ SQL (kitchen can move status, cannot cancel/pay). To add: transitions table, station split, reconnect (simulate offline 30 s).

---

## C. POS billing and payment

**Current**
1. Guest asks for the bill on phone (split equally, tip, payment choice) → `guest_bill` sets visit `bill` + creates a "bill" call. ✅
2. Waiter opens table → sees totals, can change split / tip / guests (`staff_visit_update`). ✅
3. Shows UPI QR or prints the bill. ✅
4. "Mark paid" (UPI / Cash / Card, tap twice) → `staff_mark_paid`: refuses while dishes are New/Cooking, freezes subtotal / service / GST / tip / total, marks ready orders served, closes calls. ✅
5. Void with reason (manager). ✅

**Calculation order (verified, `visit_bill`)** — subtotal (sum of non-cancelled lines) → service % on subtotal (2 dp) → GST % on (subtotal + service) (2 dp) → total rounded to rupee → tip % on subtotal (rounded) → grand = total + tip → each = ceil(grand / split).

**Missing** — discounts; split by item/seat; multiple tenders; amount tendered/change; payment reference; refunds; receipt/invoice numbering; GST invoice fields; counter POS (takeaway).

**Target states** — Payment: `pending → captured | failed | refunded`. Visit settles only when captured payments ≥ grand total.

**Tests** — ✅ SQL (exact totals: 720 + 5 % GST = 756; with dal and 10 % tip = 1,150 frozen). ✅ E2E (₹650 split 2, 5 % tip). To add: discount order of operations, split tender, refund reversal, paisa rounding cases.

---

## D. QR guest ordering

**Current**
1. Scan → `t.html?k=<token>` → `guest_menu` (token must match an active table). ✅
2. Browse, customise, cart (stored in this browser per table). ✅
3. Submit → `guest_order`: checks ordering is on, token, availability, sizes/extras, prices; 15-s rule per visit. ✅
4. Live status via `guest_state` every 5 s; Wi-Fi shown. ✅
5. Call waiter / water / bill / help (deduped, 8 per 10 min). ✅
6. Bill → UPI apps or cash/card → staff confirm → thanks + rating → Google prompt for 4–5 ★. ✅

**Privacy** — guest sees only their table's current visit; no personal data collected. ✅
**Failure paths** — inactive QR ✅; ordering paused ✅; sold out ✅; first-order race ⬜ (R-01).
**Target** — shared table cart (several phones), order idempotency, accessibility fixes, optional language switch (Hindi/Marathi).

**Tests** — ✅ SQL (anon cannot read tables; forged price ignored; size required; unknown extra refused; rate limits). ✅ E2E full journey.

---

## E. Inventory consumption — ⬜ not implemented

**Target**
1. Ingredients with base units (g, ml, pc) and conversions.
2. Recipes versioned per menu item (and per size).
3. On **order served** (configurable: or on send to kitchen), write consumption rows to the stock ledger exactly once (idempotency key = order item id + recipe version).
4. Cancel/void before cooking → no consumption; after cooking → wastage entry with reason.
5. Purchases, receiving, stock counts and manual adjustments are separate ledger entry types; on-hand = sum of ledger.

**Tests** — unit (unit conversion), SQL (exactly-once consumption, reversal), reconciliation report equals ledger.

---

## F. Daily close and reporting

**Current** — Dashboard sales/bills/tips/GST by **pay date in IST** (`owner_report`); CSV of bills. 🟡
**Missing** — business-day cut-off, shift open/close, expected vs counted cash/card/UPI, differences with notes, refunds/voids reported separately, GST export.

**Target**
1. Manager opens shift (float). 2. Payments accrue to the shift. 3. Close: system shows expected per method; manager enters counted; differences need a note. 4. Day closes after all shifts; report locked (later edits create adjustments).

**Tests** — SQL (expected totals per method), E2E (close with a difference requires a note).

---

## Role × module access (current → target)

| Module | Owner | Manager | Cashier* | Waiter | Kitchen | Inventory* | Guest |
|---|---|---|---|---|---|---|---|
| Dashboard / reports | ✅ | ✅ | ⬜ | — | — | stock reports | — |
| Floor / tables live | ✅ | ✅ | view | ✅ | — | — | own table |
| Orders (take/add) | ✅ | ✅ | ✅ | ✅ | — | — | own table |
| KDS | ✅ | ✅ | — | view | ✅ | — | — |
| Payments / bills | ✅ | ✅ | ✅ | ✅ (today) | — | — | own bill |
| Refunds / voids | ✅ | ✅ (reason) | request | — | — | — | — |
| Menu edit | ✅ | ✅ | — | — | sold-out only | recipes | — |
| Inventory | ✅ | ✅ | — | — | wastage | ✅ | — |
| Settings / team | ✅ | ordering on/off | — | — | — | — | — |

\* New roles proposed in the target; not in the current schema.
