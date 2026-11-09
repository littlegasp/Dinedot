# Dinedot — QR table ordering

One QR on every table. Guests order, call a waiter and pay from their phone; staff run the kitchen, floor and bills from one app.

**Try it now:** open `index.html`. With no Supabase keys in `config.js` it runs as a demo in your browser.

| Page | What it is |
|---|---|
| `t.html?k=<token>` | Guest page: menu, dish details, order, live status, Wi-Fi, call waiter, bill (split, tip, UPI), rating |
| `staff.html` | Staff app: Dashboard, Floor, Kitchen, Bills, Menu, Tables & QR, Settings, Help |
| `index.html` | Product page with demo links |

## Setting up a restaurant (once per restaurant)
1. **Supabase** → new project, region **Mumbai**.
2. **SQL Editor** → run `supabase/migrations/0001_init.sql`. Optional: run `supabase/sample_menu.sql` for a sample menu and six tables.
3. **Authentication → Users → Add user** with the owner's email and a password, tick **Auto Confirm User**. The first login becomes the owner.
4. **Authentication → Sign In / Providers** → turn off **Allow new users to sign up**.
5. **Authentication → URL Configuration** → Site URL = the site address; add `<site>/staff.html` to Redirect URLs (for "Forgot password?").
6. **Edge Functions → Deploy a new function → Via editor**, name `team-admin`, paste `supabase/functions/team-admin/index.ts`, Deploy. (Lets the owner add and manage logins from Settings → Team.)
7. Put the Project URL and **publishable** key in `config.js`. Never the secret key or database password.
8. Publish (GitHub Pages from `main`, or any static host). Sign in to `staff.html`, fill **Settings**, build the **Menu**, add **Tables**, then **Print QR codes**.

## Tests
```
psql -v ON_ERROR_STOP=1 -f supabase/test/stub.sql -f supabase/migrations/0001_init.sql \
     -f supabase/sample_menu.sql -f supabase/test/test.sql      # → ALL TESTS PASSED
```
