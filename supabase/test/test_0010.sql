-- Tests for 0010_table_approval.sql: only the people at the table can order.
-- Run on a fresh database: stub → 0001…0010 → sample_menu.sql → this file ("Waiter approves new tables" on).
\set QUIET on
create or replace function pg_temp.expect_fail(sql text, msg text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then
    if position(msg in sqlerrm) = 0 then raise exception 'Expected "%" but got "%" for: %', msg, sqlerrm, sql; end if;
    return;
  end;
  raise exception 'Expected failure "%" for: %', msg, sql;
end $$;
grant execute on function pg_temp.expect_fail(text, text) to anon, authenticated;
create or replace function pg_temp.check(ok boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAILED: %', msg; end if; end $$;
grant execute on function pg_temp.check(boolean, text) to anon, authenticated;

create schema if not exists net;
create table if not exists net.sent (id serial, url text, body jsonb);
create or replace function net.http_post(url text, body jsonb, headers jsonb) returns bigint
language sql security definer as $$ insert into net.sent (url, body) values (url, body) returning id::bigint $$;
grant usage on schema net to anon, authenticated;
update push_config set public_key = 'k', private_key = 'p';

\set O 'a0000000-0000-4000-8000-00000000000a'
\set W 'a0000000-0000-4000-8000-00000000000c'
\set K 'a0000000-0000-4000-8000-00000000000d'
insert into auth.users (id, email) values (:'O', 'owner@t.in'), (:'W', 'waiter@t.in'), (:'K', 'chef@t.in');
update memberships set role = 'waiter',  active = true where user_id = :'W';
update memberships set role = 'kitchen', active = true where user_id = :'K';
set role authenticated; set request.jwt.claim.sub = :'K';
select public.staff_push_subscribe('{"endpoint": "https://push.example/k", "p256dh": "k", "auth": "k"}');
reset role;
set role authenticated; set request.jwt.claim.sub = :'W';
select public.staff_push_subscribe('{"endpoint": "https://push.example/w", "p256dh": "w", "auth": "w"}');
reset role;
select pg_temp.check((select approve_tables from settings limit 1), 'on by default');
select token as tok1 from dining_tables where code = 'T1' \gset
select token as tok2 from dining_tables where code = 'T2' \gset
select id as dal from items where name = 'Dal Makhani' \gset
\set A 'phone-aaaaaaaaaaaaaaaa'
\set B 'phone-bbbbbbbbbbbbbbbb'
\set C 'phone-cccccccccccccccc'

-- ---------------------------------------------------------------- the first phone waits for a waiter
set role anon;
select pg_temp.expect_fail(format('select public.guest_order(%L, %L::jsonb)', :'tok1', json_build_array(json_build_object('id', :'dal', 'qty', 1))), 'reload this page');
select public.guest_order(:'tok1', json_build_array(json_build_object('id', :'dal', 'qty', 1))::jsonb, '', null, null, :'A') as r1 \gset
reset role;
select (:'r1'::jsonb ->> 'visit_id') as v1, (:'r1'::jsonb -> 'order' ->> 'id') as o1 \gset
select pg_temp.check((:'r1'::jsonb ->> 'waiting')::boolean, 'first order waits');
select pg_temp.check((select not approved and join_code ~ '^[0-9]{4}$' from visits where id = :'v1'), 'visit waits, has a code');
select pg_temp.check((select count(*) from net.sent where body ->> 'kind' = 'order') = 0, 'kitchen not alerted yet');
select pg_temp.check((select count(*) from net.sent where body ->> 'kind' = 'table' and body ->> 'id' = :'v1') = 1, 'floor team alerted');
select pg_temp.check(public.push_hook('table', :'v1', (select hook_secret from push_config)) ->> 'title' = 'T1 wants to order', 'alert text');
select join_code as code from visits where id = :'v1' \gset

set role anon;
select public.guest_state(:'tok1', :'A') as sa \gset
select public.guest_state(:'tok1', :'B') as sb \gset
reset role;
select pg_temp.check((:'sa'::jsonb ->> 'access') = 'in' and (:'sa'::jsonb -> 'visit' ->> 'waiting')::boolean and (:'sa'::jsonb -> 'visit' ->> 'join_code') = :'code', 'first phone: in, waiting, sees the code');
select pg_temp.check((:'sb'::jsonb ->> 'access') = 'code' and (:'sb'::jsonb -> 'visit') = 'null'::jsonb, 'another phone sees nothing of the table: ' || :'sb');

-- kitchen can't start it; another phone can't order, call or ask for the bill
set role authenticated; set request.jwt.claim.sub = :'K';
select pg_temp.expect_fail(format('select public.staff_order_status(%L, ''cooking'')', :'o1'), 'waiting for a waiter');
reset role;
set role anon;
select pg_temp.expect_fail(format('select public.guest_order(%L, %L::jsonb, '''', null, null, %L)', :'tok1', json_build_array(json_build_object('id', :'dal', 'qty', 1)), :'B'), 'Enter your table code');
select pg_temp.expect_fail(format('select public.guest_call(%L, ''water'', %L)', :'tok1', :'B'), 'Enter your table code');
select pg_temp.expect_fail(format('select public.guest_bill(%L, 1, 0, ''upi'', 0, %L)', :'tok1', :'B'), 'Enter your table code');
select pg_temp.expect_fail(format('select public.guest_bill(%L, 1, 0, ''upi'', 0, %L)', :'tok1', :'A'), 'hasn''t confirmed');
reset role;

-- ---------------------------------------------------------------- the waiter accepts
set role authenticated; set request.jwt.claim.sub = :'W';
select public.staff_live() -> 'visits' as lv \gset
select pg_temp.check((select (x ->> 'approved')::boolean = false and x ->> 'join_code' = :'code' from jsonb_array_elements(:'lv'::jsonb) x where x ->> 'id' = :'v1'), 'floor sees the waiting table and its code');
select public.staff_accept_table(:'v1', true);
reset role;
select pg_temp.check((select approved and approved_by = :'W' from visits where id = :'v1'), 'accepted');
select pg_temp.check((select count(*) from net.sent where body ->> 'kind' = 'order' and body ->> 'id' = :'o1') = 1, 'kitchen alerted on accept');
set role authenticated; set request.jwt.claim.sub = :'K';
select public.staff_order_status(:'o1', 'cooking');
reset role;

-- ---------------------------------------------------------------- other phones join with the code
update orders set created_at = created_at - interval '1 minute' where visit_id = :'v1';   -- past the "just sent" pause
set role anon;
select public.guest_join(:'tok1', :'B', '0000') as w1 \gset
reset role;
select pg_temp.check(:'code' = '0000' or ((:'w1'::jsonb ->> 'wrong')::boolean and (:'w1'::jsonb ->> 'tries_left')::int = 2), 'wrong code counted: ' || :'w1');
set role anon;
select public.guest_join(:'tok1', :'B', :'code') as jb \gset
select public.guest_order(:'tok1', json_build_array(json_build_object('id', :'dal', 'qty', 1))::jsonb, '', null, null, :'B') as r2 \gset
select public.guest_call(:'tok1', 'water', :'B');
reset role;
select pg_temp.check((:'jb'::jsonb ->> 'access') = 'in', 'joined with the code');
select pg_temp.check(not (:'r2'::jsonb ->> 'waiting')::boolean and (select count(*) from net.sent where body ->> 'kind' = 'order' and body ->> 'id' = (:'r2'::jsonb -> 'order' ->> 'id')) = 1,
                     'joined phone orders straight to the kitchen');

-- three wrong tries lock a phone; ten at a table lock the code until a new one
set role anon;
select public.guest_join(:'tok1', :'C', 'x1'), public.guest_join(:'tok1', :'C', 'x2'), public.guest_join(:'tok1', :'C', 'x3');
select pg_temp.expect_fail(format('select public.guest_join(%L, %L, %L)', :'tok1', :'C', :'code'), 'Too many wrong codes on this phone');
select pg_temp.check((public.guest_state(:'tok1', :'C') ->> 'access') = 'locked', 'locked phone');
reset role;
update visits set join_fails = 10 where id = :'v1';
set role anon;
select pg_temp.expect_fail(format('select public.guest_join(%L, ''phone-dddddddddddddddd'', %L)', :'tok1', :'code'), 'Too many wrong codes at this table');
reset role;
set role authenticated; set request.jwt.claim.sub = :'W';
select public.staff_new_join_code(:'v1') as code2 \gset
reset role;
set role anon;
select pg_temp.check((public.guest_join(:'tok1', 'phone-dddddddddddddddd', :'code2') ->> 'access') = 'in', 'new code works');
select pg_temp.check((public.guest_state(:'tok1', :'A') ->> 'access') = 'in', 'phones already in stay in');
reset role;

-- staff (POS) orders accept a waiting table at once
set role anon;
select public.guest_order(:'tok2', json_build_array(json_build_object('id', :'dal', 'qty', 1))::jsonb, '', null, null, :'A') ->> 'visit_id' as v2 \gset
reset role;
select id as t2 from dining_tables where code = 'T2' \gset
set role authenticated; set request.jwt.claim.sub = :'W';
select public.staff_add_order(:'t2', json_build_array(json_build_object('id', :'dal', 'qty', 1))::jsonb) is not null as x \gset
reset role;
select pg_temp.check((select approved from visits where id = :'v2'), 'POS order accepts the table');
select pg_temp.check((select join_code ~ '^[0-9]{4}$' from visits where id = (select id from visits where table_id = (select id from dining_tables where code = 'T3') and status = 'open' limit 1)) is not false, 'POS visits have a code too');

-- ---------------------------------------------------------------- deny
update visits set status = 'void' where id = :'v2';
set role anon;
select public.guest_order(:'tok2', json_build_array(json_build_object('id', :'dal', 'qty', 1))::jsonb, '', null, null, :'C') ->> 'visit_id' as v3 \gset
reset role;
set role authenticated; set request.jwt.claim.sub = :'W';
select public.staff_accept_table(:'v3', false);
reset role;
select pg_temp.check((select status = 'void' from visits where id = :'v3') and not exists (select 1 from orders where visit_id = :'v3' and status <> 'cancelled'), 'denied: orders cancelled, visit closed');
set role anon;
select pg_temp.check((public.guest_state(:'tok2', :'C') ->> 'denied')::boolean, 'the phone is told it was turned down');
select pg_temp.check(not (public.guest_state(:'tok2', :'B') ->> 'denied')::boolean, 'other phones are not');
reset role;

-- ---------------------------------------------------------------- paid: the code is dead, the receipt only for the table's phones
update orders set status = 'served' where visit_id = :'v1' and status <> 'cancelled';
set role authenticated; set request.jwt.claim.sub = :'W';
select public.staff_mark_paid(:'v1', 'cash');
reset role;
set role anon;
select pg_temp.check((public.guest_state(:'tok1', :'A') -> 'last_paid') <> 'null'::jsonb, 'a phone that was in sees its receipt');
select pg_temp.check((public.guest_state(:'tok1', 'phone-eeeeeeeeeeeeeeee') -> 'last_paid') = 'null'::jsonb, 'a stranger doesn''t');
select pg_temp.expect_fail(format('select public.guest_join(%L, %L, %L)', :'tok1', 'phone-eeeeeeeeeeeeeeee', :'code2'), 'Nobody has ordered');
reset role;

-- ---------------------------------------------------------------- switched off: as before
set role authenticated; set request.jwt.claim.sub = :'O';
select public.owner_set_table_approval(false);
reset role;
set role authenticated; set request.jwt.claim.sub = :'W';
select pg_temp.expect_fail('select public.owner_set_table_approval(true)', 'access');
reset role;
set role anon;
select pg_temp.check(not (public.guest_order(:'tok1', json_build_array(json_build_object('id', :'dal', 'qty', 1))::jsonb) ->> 'waiting')::boolean, 'off: no waiting, no device needed');
select pg_temp.check((public.guest_state(:'tok1') ->> 'access') = 'in', 'off: everyone sees the table');
reset role;

-- another restaurant's waiter can't accept ours
insert into auth.users (id, email) values ('a0000000-0000-4000-8000-0000000000ee', 'other@x.in');
set role authenticated; set request.jwt.claim.sub = 'a0000000-0000-4000-8000-0000000000ee';
select public.create_restaurant('Other Place');
select pg_temp.expect_fail(format('select public.staff_accept_table(%L, true)', :'v1'), 'already left');
reset role;
select pg_temp.expect_fail(format('insert into guest_devices (restaurant_id, visit_id, device) values ((select id from restaurants where name = ''Other Place''), %L, ''phone-ffffffffffffffff'')', :'v1'), 'another restaurant');

do $$ declare fns text; begin
  select string_agg(p.proname, ',' order by p.proname) into fns from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute');
  assert fns = 'guest_bill,guest_call,guest_join,guest_menu,guest_order,guest_review,guest_state', 'anon can run: ' || fns;
  assert (select count(*) from pg_proc where proname in ('guest_order', 'guest_state', 'guest_call', 'guest_bill')) = 4, 'old versions left behind';
  assert not has_table_privilege('anon', 'public.guest_devices', 'select'), 'devices readable';
end $$;
\echo 0010 TESTS PASSED
