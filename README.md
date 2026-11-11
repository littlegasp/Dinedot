# Dinedot (working name): restaurant QR ordering, POS and kitchen

One QR on every table. Guests order, call a waiter and pay from their phone. Staff run the POS,
kitchen, floor, bills and the day's close from one app. The name is a working name: it is set in
`web/src/lib/brand.ts` and changes there when the final name is picked.

| Folder | What it is |
|---|---|
| `web/` | The app (Next.js, static export). `index.html` = staff app, `t.html?k=<token>` = guest page (the QR codes point here) |
| `supabase/migrations/` | The database: tables, security and every function, run in order |
| `supabase/functions/team-admin/` | Lets the owner add and manage logins (needs the service key, so it runs on Supabase) |
| `supabase/test/` | Database tests |
| `docs/` | Product definition, backups, decisions |

**Try it:** with no Supabase keys the app runs as a demo restaurant in the browser: `cd web && npm ci && npm run dev`.

## Setting up (once)
1. **Supabase** → new project, region **Mumbai**.
2. **SQL Editor** → run every file in `supabase/migrations/` in order (0001 … 0006). Optional: `supabase/sample_menu.sql` for a sample menu and tables.
3. **Authentication → Users → Add user** with the owner's email and a password, tick **Auto Confirm User**. The first login becomes the owner. Then **Sign In / Providers** → turn off **Allow new users to sign up**.
4. **Authentication → URL Configuration** → Site URL = the app's address.
5. **Edge Functions → Deploy a new function → Via editor**, name `team-admin`, paste `supabase/functions/team-admin/index.ts`, Deploy, then turn **Verify JWT** off (the function checks the owner itself).
6. **Cloudflare → Workers & Pages → Import repository**: root `web`, build `npm run build`, deploy `npx wrangler deploy`, build variables `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_KEY` (the **publishable** key only; never the secret key or database password).
7. Sign in, fill **Settings** (including **Bills**: GSTIN, FSSAI), build the **Menu**, add **Tables**, **Print QR codes**.
8. Backups: add the two GitHub secrets in `docs/BACKUPS.md`.

## Tests
```
PGHOST=… PGUSER=postgres supabase/test/run.sh             # database: ALL / 0003 … 0006 / RACE TESTS PASSED
cd web && npm run build && (cd out && python3 -m http.server 8792 &) && node tests/journey.mjs   # DINEOS JOURNEY PASSED
POSTGREST=/path/to/postgrest bash web/tests/real/run.sh   # the app against the real migrations: REAL STACK PASSED
```
All of them run on GitHub for every push (Actions → Tests).
