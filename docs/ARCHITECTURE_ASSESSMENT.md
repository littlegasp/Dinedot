# DineOS — Architecture Assessment (Phase 0)

## 1. Current architecture (verified)

```
Guest phone ── t.html + guest.js ─┐                      ┌── Supabase PostgreSQL (Mumbai)
Staff device ── staff.html + staff.js ─┼─ api.js (fetch) ──┤     11 tables, RLS on, no direct grants
Product page ── index.html ────────┘   │                  │     46 SQL functions (security definer)  
                                       │                  ├── Supabase Auth (email + password)
                demo.js (in-browser    │                  ├── Supabase Storage (menu-photos)
                mirror of every RPC) ◄─┘ when no keys     └── Edge function team-admin (service key)
Hosting: GitHub Pages, public repo, no build step. One repo copy + one Supabase project per restaurant.
```

| Layer | Today | Assessment |
|---|---|---|
| Data model | 11 tables: staff, activity_log, settings (single row), categories, items, dining_tables, visits, orders, order_items, calls, reviews | Sound for one restaurant. Missing: payments, discounts, stations, item status, stock, customers, shifts. **Single-tenant**: no restaurant id |
| Business logic | In PostgreSQL functions (`price_cart`, `visit_bill`, `add_order`, role helpers) | **The best part of the system.** One trusted place for money and permissions. Keep |
| Security | RLS on + revoke all + six anon functions with token check | Good model; R-03 (default privileges) must be fixed |
| API | Supabase PostgREST `/rpc/<fn>`; untyped JSON | Works; no generated types, so UI ↔ DB contract is checked only by tests |
| Frontend | 1,643 lines of vanilla JS across 4 files (plus CSS); string-template rendering; global click delegation | Fast and dependency-free, fine for today's scope; will not scale to POS + inventory + reports (10× the screens) without structure |
| Realtime | Polling 4–5 s | Adequate for a single small restaurant |
| Demo | Hand-written JS mirror of every function | Great for sales, but every DB change must be written twice (R-21) |
| Tests | SQL test file (manual); E2E outside repo | Needs CI (R-16) |
| Deploy | GitHub Pages | No headers, no staging, no preview builds |

## 2. Options

### Option A — Keep the static app, harden and modularise
Split `staff.js` into ES modules, add JSDoc types, fix the risks, add Realtime, keep GitHub Pages.
- ✅ Lowest risk, no rewrite, works today, zero build tooling.
- ❌ The DineOS scope (POS, KDS stations, inventory, finance, design system with ~20 components, 7 roles) is roughly 10× today's UI. Without components, types and routing this becomes hard to keep consistent — the brief's consistency and accessibility goals get expensive.
- Fit: good for "Dinedot for small restaurants", poor for "DineOS operating system".

### Option B — Typed React app, staged (Next.js App Router + TypeScript + Tailwind + shadcn/ui), keep Supabase and the SQL functions
New app shell on its own branch; screens move over one module at a time; the database (functions, RLS, money rules) stays the single source of truth and gains forward migrations; DB types generated with `supabase gen types`.
- ✅ Matches the brief's preferred stack **and** the stack you already run for Studio CRM (Next.js on Cloudflare + Supabase), so one way of working across products.
- ✅ Components, routing per role, typed contracts, Zod validation, Realtime hooks, testable units.
- ✅ Cloudflare hosting gives security headers, preview deploys per branch, and private repos.
- ❌ Build tooling and a bigger codebase; migration needs a period where old and new coexist.
- ❌ Server rendering adds little for staff screens; most pages would be client components anyway.

### Option C — Typed React single-page app (Vite + React + TypeScript + Tailwind + shadcn/ui), keep Supabase
Same as B but a pure static SPA (no server runtime), deployable to Cloudflare Pages or GitHub Pages.
- ✅ Simpler than Next.js; no server; offline/PWA for POS and KDS is easier.
- ✅ Same component and typing benefits.
- ❌ Not the stack used in Studio CRM; SEO for a marketing site is weaker (marketing page could stay static).

### Option D — Full rewrite including the backend
- ❌ Rejected. The database layer is the strongest, best-tested part. Rewriting it would throw away proven money and permission logic for no gain.

## 3. Recommendation

**Option B, staged** — Next.js App Router + TypeScript + Tailwind + shadcn/ui + Lucide + Zod/React Hook Form + Recharts, deployed on Cloudflare, **keeping Supabase PostgreSQL with the existing function-first model** and evolving it only through forward migrations.

Reasons:
1. It keeps what works (the database) and replaces what will not scale (hand-rolled UI and the hand-written demo mirror).
2. It is the stack you already operate for Studio CRM, so deploy, auth and testing patterns carry over.
3. Typed, generated contracts remove the biggest maintenance risk (R-21).

**Conditions before committing** (Owner decisions, see `PRODUCT_ROADMAP.md`):
- **D-01 single-tenant vs multi-tenant** changes the schema fundamentally. A SaaS "DineOS" with many restaurants on one database needs `restaurant_id` on every table, membership-based RLS, and per-tenant settings. This must be decided **before** Phase 3 foundation work.
- If offline POS is a hard requirement (D-10), revisit Option C (PWA-first) for the POS/KDS app.

**What stays:** SQL functions for money and permissions; guest token model; `t.html?k=` QR URLs (printed codes must keep working); the Help guide rule.
**What changes:** UI layer; demo becomes a seeded Supabase project (or local Supabase via CLI) instead of a JS mirror; polling becomes Realtime with fallback; design system per the brief (Manrope + Inter, coral `#FF704F`, light-first, restrained shadows — replacing today's glass style).

## 4. Target shape

```
apps/web  (Next.js, TypeScript)
  /(guest)/t/[token]        guest ordering  ← old /t.html?k= redirects here
  /(staff)/floor  /kds  /pos  /bills  /menu  /tables  /inventory  /reports  /settings
  /(marketing)/             product site
packages/ui                 DineOS design system (tokens, shadcn components)
packages/db                 generated Supabase types + typed RPC wrappers + Zod schemas
supabase/migrations         0001, 0002 kept unchanged; 0003+ forward only
supabase/seed.sql           demo restaurant (replaces demo.js)
tests/                      unit (money, transitions), SQL integration, Playwright E2E
```

Money, tax, discount and rounding rules live **only** in SQL; the UI shows server results. Any client preview calls the same function.
