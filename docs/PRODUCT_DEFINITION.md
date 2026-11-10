# DineOS: product definition (v1)

Status: **prototype approved 11 Nov 2026; Phase 3 database foundation (migration 0004) done.** Branch `dineos`. Nothing here is live yet;
the current Dinedot app on `main` keeps running unchanged until DineOS replaces it.

## Decisions (agreed 11 Nov 2026)

| Question | Decision |
|---|---|
| Shape | One system, many restaurants (multi-tenant). Each restaurant is a row, not a copy of the repo. |
| Stack | Next.js 15 + TypeScript + Tailwind 4 (same as Studio CRM), static export on Cloudflare. Supabase (Mumbai) stays; money and permissions stay in SQL functions. |
| Name | DineOS (trademark and domain check still to do). |
| v1 scope | Core ops + POS: guest QR ordering, waiter floor, kitchen stations, POS billing with discounts, split payments, takeaway, daily close. |

## Who uses it

| Role | Home screen | Can do |
|---|---|---|
| Owner | Today | Everything, including settings, team, exports, closing the day |
| Manager | Today | Everything except settings and team; discounts up to the limit; pause ordering |
| Cashier | POS | Take orders, bills, payments, takeaway; no discounts above limit, no voids |
| Waiter | Floor | Seat tables, take orders, handle calls, print bills, mark served |
| Kitchen | Kitchen | Their station's tickets, item done, sold-out switch |
| Guest | Guest QR page | Browse, order, call waiter, ask for bill, pay by UPI, rate. No sign-in and no personal details, ever. |

Roles are checked in SQL; the sidebar only hides what the database would refuse anyway.

## v1 screens (prototype covers the first five)

1. **Today (owner)**: sales, bills, average bill, rating vs the same day last week; sales by hour; needs attention; floor right now; best sellers; payment mix; close the day.
2. **POS & billing**: dine-in or takeaway token; categories, search, sizes and add-ons; discount with reason (logged); send to kitchen; split payment across UPI, card and cash, each saved as its own payment; cash change.
3. **Kitchen**: always dark; stations (Tandoor, Curry, Bar, Dessert); New, Cooking, Ready columns; per-item done; timer with a target, warning and "late" in words; allergy notes; one-tap undo.
4. **Floor (waiter)**: calls from tables on top; areas; "only my tables"; table sheet to seat, add items, print bill.
5. **Guest QR page**: cover, call waiter, Wi-Fi, ask for bill; veg-only; order status tracker.
6. Later in the build: Menu, Tables & QR, Bills history, Team, Settings, Help, Receipts.

## House features (same as Studio CRM and Vroombrite)

Bell with notifications · Ctrl K search · update bar · team notice · push alerts for new orders and calls · offline queue for orders on bad Wi-Fi · guided tour · Help guide updated in the same commit as every visible change · activity history · daily backups (30 days) · privacy and terms pages · receipts (print and share) · light and dark themes.

## Multi-tenant model (Phase 3, built in `supabase/migrations/0004_restaurants.sql`)

- New tables `restaurants` and `memberships(restaurant_id, user_id, role)`.
- `restaurant_id` on every existing table. Tables stay fully locked (RLS on, no grants); every function filters by the caller's restaurant, and a trigger refuses cross-restaurant links.
- Guest access stays token-based: the table QR token identifies the restaurant and table.
- Forward-only migrations from 0004; the 0001–0003 safety tests keep passing.
- Signing up: a fresh install's first login owns the one restaurant; Team-screen invites join the owner's restaurant; anyone else starts with no restaurant and can create one (`create_restaurant`, up to 10 each).
- One person can work in several restaurants (`staff_restaurants`, `staff_switch_restaurant`). An owner can change a login's email or password, or delete it, only if that person works nowhere the owner doesn't own; otherwise they are just taken off the team.
- Suspending a restaurant stops its QR codes and staff screens; deleting it removes every row it owns (tested).
- Still to do: inviting someone who already has a login (today: "That email already has a login").

## Design

Tokens in `web/src/app/globals.css` (light and dark). Ink, coral for the one main action, blue for
secondary actions and selection. Manrope headings, Inter body, self-hosted (no Google Fonts call).
Every status shows a word and an icon, never colour alone. Touch targets 48 px+ on POS and Kitchen.
Checked at 390 px and 1440 px in both themes.
