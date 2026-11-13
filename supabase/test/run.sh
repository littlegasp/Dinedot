#!/usr/bin/env bash
# Runs every database test on fresh databases. Needs psql and a PostgreSQL server.
# Usage:  PGHOST=localhost PGPORT=5432 PGUSER=postgres supabase/test/run.sh
set -euo pipefail
cd "$(dirname "$0")"
MIG=(../migrations/0001_init.sql ../migrations/0002_cover_photo.sql ../migrations/0003_hardening.sql ../migrations/0004_restaurants.sql ../migrations/0005_pos_kitchen_close.sql ../migrations/0006_bills_cashier.sql ../migrations/0007_floor_plan_push.sql ../migrations/0008_areas.sql ../migrations/0009_tip_amount.sql)

fresh() {   # fresh <dbname>: empty database with the stub, every migration and the sample menu
  psql -q -v ON_ERROR_STOP=1 -c "drop database if exists $1" -c "create database $1" >/dev/null
  local args=(-q -At -v ON_ERROR_STOP=1 -d "$1" -f stub.sql)
  for m in "${MIG[@]}"; do args+=(-f "$m"); done
  psql "${args[@]}" -f ../sample_menu.sql >/dev/null
}

fresh dd_t1 && psql -q -At -v ON_ERROR_STOP=1 -d dd_t1 -f test.sql | tail -1
fresh dd_t2 && psql -q -At -v ON_ERROR_STOP=1 -d dd_t2 -f test_0003.sql | tail -1
fresh dd_t4 && psql -q -At -v ON_ERROR_STOP=1 -d dd_t4 -f test_0004.sql | tail -1
fresh dd_t5 && psql -q -At -v ON_ERROR_STOP=1 -d dd_t5 -f test_0005.sql | tail -1
fresh dd_t6 && psql -q -At -v ON_ERROR_STOP=1 -d dd_t6 -f test_0006.sql | tail -1
fresh dd_t7 && psql -q -At -v ON_ERROR_STOP=1 -d dd_t7 -f test_0007.sql | tail -1
fresh dd_t9 && psql -q -At -v ON_ERROR_STOP=1 -d dd_t9 -f test_0009.sql | tail -1
# 0008 on a database that already has tables (as on live): 0001–0007, the sample, a "terrace" table, then 0008
psql -q -v ON_ERROR_STOP=1 -c "drop database if exists dd_t8" -c "create database dd_t8" >/dev/null
args=(-q -At -v ON_ERROR_STOP=1 -d dd_t8 -f stub.sql); for m in "${MIG[@]:0:7}"; do args+=(-f "$m"); done
psql "${args[@]}" -f ../sample_menu.sql -c "insert into public.dining_tables (code, area, seats, sort) values ('T9', 'terrace', 2, 9)" >/dev/null
psql -q -At -v ON_ERROR_STOP=1 -d dd_t8 -f ../migrations/0008_areas.sql -f ../migrations/0009_tip_amount.sql -f test_0008.sql | tail -1

# R-01: two guests send the first order on one table at the same moment — both must succeed.
fresh dd_race
TOK=$(psql -At -d dd_race -c "select token from dining_tables where code='T2'")
ITEM=$(psql -At -d dd_race -c "select id from items where name='Dal Makhani'")
ORDER="select (public.guest_order('$TOK', '[{\"id\":\"$ITEM\",\"qty\":1}]'::jsonb) ->> 'visit_id') is not null"
( psql -At -v ON_ERROR_STOP=1 -d dd_race -c "begin; set local role anon; $ORDER; select pg_sleep(1.5); commit;" >/tmp/dd_race_a 2>&1 ) &
sleep 0.5
psql -At -v ON_ERROR_STOP=1 -d dd_race -c "set role anon; $ORDER;" >/tmp/dd_race_b 2>&1 || { echo "RACE: second guest failed:"; cat /tmp/dd_race_b; exit 1; }
wait
psql -At -d dd_race -c "select count(*) = 2 and count(distinct visit_id) = 1 from orders" | grep -q t || { echo "RACE: expected 2 orders on one visit"; exit 1; }
echo "RACE TEST PASSED"
