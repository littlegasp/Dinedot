# DineOS — Product Roadmap, Navigation Map, Test Strategy and Open Decisions (Phase 0)

No dates are given (brief §13): they depend on the decisions in section 5.

## 1. Proposed navigation map (role-first)

```
DineOS
├─ Guest (phone, via table QR)       Menu · Dish · Cart · My table (orders, Wi-Fi, bill) · Call · Pay · Rate
├─ Waiter (phone)                    Floor · Table (seat, order, serve, bill, pay) · Calls · My tables
├─ Kitchen (tablet, landscape)       Tickets (by station) · Sold out · Full screen
├─ Cashier / POS (tablet/desktop)    New order (dine-in / takeaway) · Open orders · Payments · Refunds* · Shift
├─ Manager (tablet/desktop)          Today · Floor · Orders · Menu · Tables & QR · Staff on shift · Close day
├─ Inventory (desktop)               Stock · Recipes · Purchases · Receiving · Wastage · Counts
└─ Owner (desktop)                   Dashboard · Reports (sales, GST, items, staff) · Menu · Inventory · Customers* · Team & roles · Settings · Audit log
* gated by owner permission or consent design
```
Each role lands on its main task screen; owner-level screens never appear for waiter/kitchen.

## 2. Module priority matrix

| Module | Value to a restaurant | Today | Effort | Dependency | Priority |
|---|---|---|---|---|---|
| Hardening (R-01/02/03/05/08 + CI) | Very high (trust) | — | Small | none | **P0** |
| Guest QR ordering (redesign) | Very high | ✅ strong | Medium | design system | **P1** |
| Waiter + Floor (seat, item edits, transfer) | Very high | ✅ good | Medium | hardening | **P1** |
| KDS (stations, item status, Realtime) | High | ✅ single station | Medium | hardening | **P1** |
| Payments model + POS billing (split tender, discounts, receipts) | Very high | 🟡 | Large | payments table | **P1** |
| Takeaway / counter orders | High | ⬜ | Medium | POS | P2 |
| GST invoicing + exports | High (legal) | ⬜ | Medium | D-06 accountant spec | P2 |
| Shifts + daily close + reconciliation | High | ⬜ | Medium | payments | P2 |
| Owner dashboard + reports (redesign) | High | ✅ basic | Medium | payments | P2 |
| Inventory ledger + recipes | Medium–High | ⬜ | Large | stable menu model | P3 |
| Purchasing + suppliers | Medium | ⬜ | Medium | inventory | P3 |
| Reservations | Medium | ⬜ | Medium | floor | P3 |
| Customers + loyalty | Medium | ⬜ | Large | consent design (DPDP) | P4 |
| Expenses + P&L | Medium | ⬜ | Medium | inventory costs | P4 |
| Delivery integrations | Variable | ⬜ | Large | aggregator APIs | Deferred |

## 3. Phases (brief §13, adjusted by the audit)

| Phase | Work | Exit criteria |
|---|---|---|
| 0 Audit | This document set | You approve the audit and risk register |
| 0.5 Hardening | Migration `0003` (P0 fixes), committed E2E tests, CI | All SQL + E2E tests green in CI; probes from the audit now fail safely |
| 1 Product definition | Personas, final module list for v1, navigation, workflows A–D detailed | You approve the v1 scope (D-04) |
| 2 Design system | DineOS tokens (brief §7: ink `#171B24`, coral `#FF704F`, blue `#4263EB`, Manrope + Inter, light-first), components, logo (geometric D), prototypes of owner dashboard, POS, KDS, waiter, guest | You approve the prototype (preview link) |
| 3 Foundation | App shell, auth, role routing, typed DB contracts, seed project, test harness — isolated branch | Login → correct home per role; type-checked RPC layer; CI green |
| 4 Core operations | Guest, waiter, floor, KDS, POS connected end to end | Workflows A–D pass E2E on staging |
| 5 Money and stock | Payments, discounts, refunds, shifts/close, GST, inventory ledger, recipes | Financial and stock invariants tested (sum of payments = settled bills; stock = ledger) |
| 6 Growth & management | Reservations, customers/loyalty (with consent), expenses, extra reports | Prioritised modules released |
| 7 Hardening & launch | Security review, performance, accessibility, monitoring, rollback drills, cutover | Production readiness sign-off |

## 4. Test strategy

| Level | Tool | What | When |
|---|---|---|---|
| Unit | Vitest | Money preview formatting, transition helpers, unit conversions, permission helpers | Every PR |
| Database integration | `psql` + SQL test files (existing `test.sql`, extended) on PostgreSQL in CI | Every function: permissions per role, pricing, totals, transitions, idempotency, RLS/grants (including "no unexpected anon functions"), tenancy if multi-tenant | Every PR |
| End-to-end | Playwright | Workflows A–F per role; guest + staff in two browser contexts; offline/reconnect; concurrent first order | Every PR (smoke) + nightly (full) |
| Responsive & theme | Playwright screenshots | 390 / 768 / 1440 px; light (+ dark where supported); no horizontal scroll | Every PR on changed screens |
| Accessibility | axe-core in Playwright + keyboard walkthrough | Labels, focus order, contrast, touch targets ≥ 44 px, no colour-only status | Every PR on changed screens |
| Security | SQL tests + scripted checks | Guest token misuse, cross-role calls, secrets in bundle (grep for service keys), Storage upload type/size | Every PR + before launch |
| Manual acceptance | Checklist on real devices | Kitchen tablet, waiter phones, thermal printer (if D-09), weak network | Before each phase sign-off |

**Definition of done** (brief §12) is adopted as-is; a phase cannot be signed off with skipped tests unless the reason is written down.

## 5. Decisions needed from you (product owner)

| ID | Decision | Why it matters | Options |
|---|---|---|---|
| **D-01** | **One database per restaurant (today) or one SaaS for all restaurants?** | Changes every table and every function; must be decided before Phase 3 | Per-restaurant template · Multi-tenant SaaS (recommended if DineOS is sold as a product) |
| **D-02** | Rename to **DineOS** now? | Domain, trademark search, repo/GitHub account (still under Little Gasp), product page, QR cards | Rename now · After trademark check · Keep Dinedot |
| **D-03** | Approve **Option B** (Next.js + TS + Tailwind/shadcn on Cloudflare, keep Supabase)? | Sets the whole build | B (recommended) · C (Vite SPA) · A (keep static) |
| **D-04** | **v1 scope**: which modules must the first sellable DineOS have? | Brief scope is very large | Suggested v1 = P0 + P1 (guest, waiter, KDS, POS billing) |
| **D-05** | Payments: keep manual UPI confirmation, or add a **gateway** (Razorpay/PhonePe PG) for verified payment? | Proof of payment, fees, onboarding | Manual + UTR capture (v1) · Gateway (later) |
| **D-06** | **GST invoicing requirements** (GSTIN, invoice series, per-item rates, composition scheme?) | Legal; must come from an accountant | Need a spec from the restaurant's CA |
| **D-07** | **Service charge** policy | Consumer guidelines restrict automatic service charges | Remove · Optional for guest · Keep with clear labelling (after legal check) |
| **D-08** | Demo strategy | Hand-written `demo.js` doubles every change | Seeded demo Supabase project · Keep in-browser demo for marketing only |
| **D-09** | Hardware: **thermal printers** (KOT and bills)? | Browser print vs ESC/POS bridge app | Browser print (v1) · Printer integration |
| **D-10** | Must POS/KDS work **offline**? | Drives architecture (PWA, local queue) | Online-only v1 · Offline-capable |
| **D-11** | Themes: light-first per brief; dark mode for KDS only, or everywhere? | Testing cost doubles per theme | Light + dark KDS (suggested) · Both everywhere |
| **D-12** | Hosting: move from public GitHub Pages to **Cloudflare** (private repo, headers, previews)? | Security headers, private code | Cloudflare (recommended) · Stay on Pages |
| **D-13** | Is it OK to ship the **P0 hardening migration `0003`** to the current app before the redesign? | Protects the current product today | Yes (recommended) · Wait |
