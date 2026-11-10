# DineOS — Migration Plan (Phase 0)

Principle: **incremental, observable, reversible.** Done so far: stage 1 (audit), 4.1 (hardening migration `0003`) and 4.2 (tests + CI) — 11 Nov 2026.

## 1. Ground rules

1. `main` is production (GitHub Pages serves it). No audit or prototype work goes to `main`.
2. One branch per phase from `main` (`dineos-design`, `dineos-foundation`, …); merge only after the phase's exit criteria pass and you approve.
3. **Migrations are forward-only.** `0001_init.sql` and `0002_cover_photo.sql` are never edited; changes arrive as `0003_…`, `0004_…`.
4. Every migration is run first on a local/disposable database with the full SQL test suite, then on a staging Supabase project, then production.
5. Before any production migration: Supabase backup (Database → Backups) **and** a `pg_dump` of the restaurant's data, restored once into a scratch project to prove it works.
6. Printed QR codes must keep working: `t.html?k=<token>` stays valid until every live restaurant's codes are reprinted (redirect to the new route, never break).
7. While old and new screens coexist, **the database functions own every write** — both UIs call the same functions, so there is never a second writer.

## 2. Today's data at risk

There is **no live restaurant** on Supabase yet (only demo mode and local tests). That lowers migration risk sharply: the first real restaurant should go live **after** the hardening migration (step 4.1), and, if D-01 = multi-tenant, after the tenant migration too — avoiding a data migration of live customers entirely.

## 3. Stages

| # | Stage | What happens | Rollback |
|---|---|---|---|
| 1 | Audit (this) | Documents only | — |
| 2 | Design prototype | DineOS tokens, components and 5 key screens (owner dashboard, POS, KDS, waiter, guest) with synthetic data, on `dineos-design`; deployed as a preview link only | Delete branch |
| 3 | Architecture decision | You approve Option B (or other) + D-01 tenancy | — |
| 4.1 | **Hardening migration `0003`** on current app | R-03 default privileges, R-01 race, R-02 transitions, R-05 idempotency, R-13/R-14 small fixes, audit log for payments/menu edits; tests for each | Forward-fix migration; functions are `create or replace`, previous bodies kept in git |
| 4.2 | Tests + CI | Commit Playwright E2E, GitHub Action running SQL tests + E2E on every PR | — |
| 4.3 | Foundation | Next.js app shell, auth, role routing, generated DB types, design system package, seed project replacing `demo.js` | Old static app untouched on `main` |
| 5 | Read-only integration | New dashboard/bills/menu screens read live data via the same functions; staff can try them in parallel | Point staff back to `staff.html` |
| 6 | Operational core | Floor, waiter, KDS (Realtime), POS + `payments` table; parity tests: the same journey through old and new UI gives identical DB rows | Feature flag per screen; old screens stay available |
| 7 | Supporting modules | Inventory ledger, purchasing, shifts/daily close, GST exports, customers (only with consent design) | New tables only; old flows unaffected |
| 8 | Cutover | Redirect `t.html?k=` → `/t/[token]`, `staff.html` → `/floor`; monitor; keep old files 30 days | Revert redirect (one commit) |

## 4. If D-01 = multi-tenant (SaaS)

1. Migration adds `restaurants` table and `restaurant_id` (not null, default = the single existing restaurant) to every table; backfill in the same transaction.
2. `staff` becomes `memberships (user, restaurant, role)`; role helpers take the restaurant from the table token or the user's active membership.
3. Every function adds a `restaurant_id` filter; tests prove a user of restaurant A cannot read or change restaurant B (new test file `tenancy.sql`).
4. Per-restaurant `config.js` disappears; one deployment serves all restaurants (`/r/<slug>` for public pages).
5. Rollback: tenant columns are additive; functions are versioned; reverting function bodies restores single-tenant behaviour.

## 5. Write ownership while both UIs exist

| Workflow | Owner of writes | Old UI | New UI |
|---|---|---|---|
| Guest ordering | SQL `guest_*` functions | `t.html` | `/t/[token]` (after stage 8) |
| Kitchen status | `staff_order_status` (with transitions) | KDS screen | new KDS |
| Payments | `staff_mark_paid` → later `record_payment` | Floor drawer | POS |
| Menu/tables/settings | `owner_*` functions | staff.html | new admin |

Because both UIs call the same functions, there are no conflicting writers — only the screens differ.

## 6. Acceptance gate before switching production traffic

All six core workflows (WORKFLOW_MAP A–F, those in scope) pass E2E on staging against a real Supabase project; role tests pass; SQL suite passes; responsive checks at 390 / 768 / 1440 px; no console errors; backup restored successfully once; you sign off.
