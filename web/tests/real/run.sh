#!/usr/bin/env bash
# Runs the built DineOS app against the REAL database migrations (0001–0004) through
# PostgREST, the server Supabase uses. Needs: a local Postgres (PGHOST/PGUSER/PGPASSWORD),
# a postgrest binary (POSTGREST=path, v12), Playwright. Prints "REAL STACK PASSED".
set -euo pipefail
cd "$(dirname "$0")/../.."                       # web/
DB=dd_real; SECRET="test-only-secret-for-local-runs-0123456789"; PORT=8793; PGRST_PORT=3013
SQL=../supabase
psql -q -v ON_ERROR_STOP=1 -c "drop database if exists $DB" -c "create database $DB" >/dev/null
psql -q -At -v ON_ERROR_STOP=1 -d $DB -f $SQL/test/stub.sql -f $SQL/migrations/0001_init.sql -f $SQL/migrations/0002_cover_photo.sql \
  -f $SQL/migrations/0003_hardening.sql -f $SQL/migrations/0004_restaurants.sql -f $SQL/sample_menu.sql >/dev/null 2>&1
psql -q -v ON_ERROR_STOP=1 -d $DB >/dev/null <<SQL
-- like Supabase: auth.uid() reads the JWT claims that PostgREST 12 sets
create or replace function auth.uid() returns uuid language sql stable as
\$\$ select nullif(coalesce(current_setting('request.jwt.claim.sub', true), current_setting('request.jwt.claims', true)::jsonb ->> 'sub'), '')::uuid \$\$;
do \$\$ begin if not exists (select 1 from pg_roles where rolname = 'dd_authenticator') then create role dd_authenticator login password 'auth-pass' noinherit; end if; end \$\$;
grant anon, authenticated to dd_authenticator;
insert into auth.users (id, email) values ('50000000-0000-4000-8000-000000000001', 'owner@copper.test'),
  ('50000000-0000-4000-8000-000000000002', 'waiter@copper.test'), ('50000000-0000-4000-8000-000000000003', 'newbie@x.test');
update memberships set active = true where user_id = '50000000-0000-4000-8000-000000000002';
update settings set restaurant_name = 'The Copper Pot', upi_id = 'copperpot@okicici', upi_name = 'The Copper Pot';
SQL
ANON=$(node -e "const c=require('crypto');const b=o=>Buffer.from(JSON.stringify(o)).toString('base64url');const h=b({alg:'HS256',typ:'JWT'}),p=b({role:'anon',exp:4102444800});console.log(h+'.'+p+'.'+c.createHmac('sha256',process.argv[1]).update(h+'.'+p).digest('base64url'))" "$SECRET")
NEXT_PUBLIC_SUPABASE_URL="http://localhost:$PORT" NEXT_PUBLIC_SUPABASE_KEY="$ANON" npm run build >/dev/null
rm -rf out-real && cp -r out out-real
cat > /tmp/dd_pgrst.conf <<CONF
db-uri = "postgres://dd_authenticator:auth-pass@${PGHOST:-localhost}:${PGPORT:-5432}/$DB"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$SECRET"
server-port = $PGRST_PORT
CONF
"${POSTGREST:?set POSTGREST to the postgrest binary}" /tmp/dd_pgrst.conf >/tmp/dd_pgrst.log 2>&1 & P1=$!
TEST_USERS='{"owner@copper.test":"50000000-0000-4000-8000-000000000001","waiter@copper.test":"50000000-0000-4000-8000-000000000002","newbie@x.test":"50000000-0000-4000-8000-000000000003"}' \
  node tests/real/server.mjs $PORT $PGRST_PORT "$SECRET" "$PWD/out-real" >/tmp/dd_server.log 2>&1 & P2=$!
trap 'kill $P1 $P2 2>/dev/null' EXIT
sleep 2
T2=$(psql -At -d $DB -c "select token from dining_tables where code = 'T2'")
DB=$DB node tests/real/journey.mjs "http://localhost:$PORT/" "$T2"
