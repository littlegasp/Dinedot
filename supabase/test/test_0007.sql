-- Tests for 0007_floor_plan_push.sql: floor plan and phone alerts.
-- Run on a fresh database: stub → 0001…0007 → sample_menu.sql → this file.
-- pg_net isn't installed locally, so a stand-in net.http_post records what would be sent.
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
create table net.sent (id serial, url text, body jsonb);
create or replace function net.http_post(url text, body jsonb, headers jsonb) returns bigint
language sql security definer as $$ insert into net.sent (url, body) values (url, body) returning id::bigint $$;
grant usage on schema net to anon, authenticated;

\set O '70000000-0000-4000-8000-00000000000a'
\set K '70000000-0000-4000-8000-00000000000d'
\set W '70000000-0000-4000-8000-00000000000c'
\set M '70000000-0000-4000-8000-00000000000b'
insert into auth.users (id, email) values (:'O', 'owner@t.in'), (:'K', 'chef@t.in'), (:'W', 'waiter@t.in'), (:'M', 'mgr@t.in');
update memberships set role = 'kitchen', active = true where user_id = :'K';
update memberships set role = 'waiter',  active = true where user_id = :'W';
update memberships set role = 'manager', active = true where user_id = :'M';
select id as t1 from dining_tables where code = 'T1' \gset
select id as t2 from dining_tables where code = 'T2' \gset
select token as tok1 from dining_tables where code = 'T1' \gset
select token as tok3 from dining_tables where code = 'T3' \gset
select id as dal from items where name = 'Dal Makhani' \gset

-- ---------------------------------------------------------------- floor plan
set role authenticated; set request.jwt.claim.sub = :'M';
select pg_temp.check(public.owner_save_plan(json_build_array(json_build_object('id', :'t1', 'x', 120, 'y', 200), json_build_object('id', :'t2', 'x', 400, 'y', 200))::jsonb) = 2, 'plan saved');
select pg_temp.expect_fail(format('select public.owner_save_plan(%L::jsonb)', json_build_array(json_build_object('id', :'t1', 'x', 2000, 'y', 10))), 'outside the plan');
select public.owner_save_table(jsonb_build_object('id', :'t2', 'code', 'T2', 'area', 'Main', 'seats', 6, 'shape', 'long'));
select pg_temp.expect_fail(format('select public.owner_save_table(%L::jsonb)', jsonb_build_object('id', :'t2', 'code', 'T2', 'shape', 'star')), 'square, round or long');
select public.staff_live() -> 'tables' as tbls \gset
reset role;
select pg_temp.check((select (t ->> 'x')::int = 120 and (t ->> 'y')::int = 200 and t ->> 'shape' = 'square' from jsonb_array_elements(:'tbls'::jsonb) t where t ->> 'id' = :'t1'), 'live has place and shape');
select pg_temp.check((select shape = 'long' and seats = 6 and plan_x = 400 from dining_tables where id = :'t2'), 'shape saved, place kept');
set role authenticated; set request.jwt.claim.sub = :'M';
select public.owner_save_table(jsonb_build_object('id', :'t2', 'code', 'T2', 'area', 'Terrace', 'seats', 6, 'shape', 'long'));
reset role;
select pg_temp.check((select plan_x is null and plan_y is null from dining_tables where id = :'t2'), 'moving to another area unplaces the table');
select pg_temp.check((select count(*) from activity_log where action = 'plan_saved') = 1, 'plan save logged');
set role authenticated; set request.jwt.claim.sub = :'W';
select pg_temp.expect_fail(format('select public.owner_save_plan(%L::jsonb)', json_build_array(json_build_object('id', :'t1', 'x', 1, 'y', 1))), 'access');
reset role;

-- ---------------------------------------------------------------- phone alerts
-- not set up yet (no key): nothing is sent
set role anon;
select public.guest_order(:'tok3', json_build_array(json_build_object('id', :'dal', 'qty', 1))::jsonb) ->> 'visit_id' as v0 \gset
reset role;
select pg_temp.check((select count(*) from net.sent) = 0, 'nothing sent before the push function has made its key');
update push_config set public_key = 'test-public', private_key = 'test-private';

set role authenticated; set request.jwt.claim.sub = :'K';
select public.staff_push_subscribe('{"endpoint": "https://push.example/kitchen", "p256dh": "k1", "auth": "a1", "device": "Android"}');
select pg_temp.expect_fail('select public.staff_push_subscribe(''{"endpoint": "http://bad", "p256dh": "x", "auth": "y"}'')', 'look wrong');
reset role;
set role authenticated; set request.jwt.claim.sub = :'W';
select public.staff_push_subscribe('{"endpoint": "https://push.example/waiter", "p256dh": "w1", "auth": "a2", "device": "iPhone"}');
reset role;
set role authenticated; set request.jwt.claim.sub = :'O';
select public.staff_push_subscribe('{"endpoint": "https://push.example/owner", "p256dh": "o1", "auth": "a3"}');
reset role;
select pg_temp.check((select count(*) from push_subs) = 3, 'three phones subscribed');

-- a guest order → the database asks the push function, with the secret
set role anon;
select public.guest_order(:'tok1', json_build_array(json_build_object('id', :'dal', 'qty', 2))::jsonb) -> 'order' ->> 'id' as o1 \gset
reset role;
select pg_temp.check((select count(*) from net.sent where body ->> 'kind' = 'order' and body ->> 'id' = :'o1'
                       and body ->> 'secret' = (select hook_secret from push_config) and url like 'https://%/functions/v1/push') = 1, 'new order sent to the push function');
select pg_temp.check(public.push_hook('order', :'o1', 'wrong') is null, 'wrong secret: nothing');
select public.push_hook('order', :'o1', (select hook_secret from push_config)) as h1 \gset
select pg_temp.check((:'h1'::jsonb) ->> 'title' like 'New order · T1 · #%' and (:'h1'::jsonb) ->> 'body' = '2× Dal Makhani', 'order alert text: ' || ((:'h1'::jsonb) ->> 'title'));
select pg_temp.check(jsonb_array_length((:'h1'::jsonb) -> 'subs') = 1 and (:'h1'::jsonb) -> 'subs' -> 0 ->> 'endpoint' = 'https://push.example/kitchen', 'new orders go to the kitchen only');

-- ready → waiters and cashiers
set role authenticated; set request.jwt.claim.sub = :'K';
select public.staff_order_status(:'o1', 'cooking'); select public.staff_order_status(:'o1', 'ready');
reset role;
select pg_temp.check((select count(*) from net.sent where body ->> 'kind' = 'ready') = 1, 'ready sent once');
select public.push_hook('ready', :'o1', (select hook_secret from push_config)) as h2 \gset
select pg_temp.check(jsonb_array_length((:'h2'::jsonb) -> 'subs') = 1 and (:'h2'::jsonb) -> 'subs' -> 0 ->> 'endpoint' = 'https://push.example/waiter', 'ready goes to the waiter');

-- a call → owner, manager, cashier, waiter (not the kitchen)
set role anon;
select public.guest_call(:'tok1', 'water');
reset role;
select (body ->> 'id') as c1 from net.sent where body ->> 'kind' = 'call' \gset
select public.push_hook('call', :'c1', (select hook_secret from push_config)) as h3 \gset
select pg_temp.check((:'h3'::jsonb) ->> 'title' = 'T1 asked for water' and jsonb_array_length((:'h3'::jsonb) -> 'subs') = 2, 'call alert to owner and waiter: ' || (:'h3'::jsonb)::text);

-- switched off: no alerts; removed from the team: the phone is forgotten
update memberships set active = false where user_id = :'W';
select pg_temp.check(jsonb_array_length(public.push_hook('call', :'c1', (select hook_secret from push_config)) -> 'subs') = 1, 'switched-off login gets nothing');
delete from memberships where user_id = :'W';
select pg_temp.check(not exists (select 1 from push_subs where user_id = :'W'), 'removed login: its phones are dropped');

-- unsubscribe only your own phone
set role authenticated; set request.jwt.claim.sub = :'K';
select public.staff_push_unsubscribe('https://push.example/owner');
reset role;
select pg_temp.check(exists (select 1 from push_subs where endpoint = 'https://push.example/owner'), 'can''t turn off someone else''s phone');

-- another restaurant's plan and alerts stay apart
insert into auth.users (id, email) values ('70000000-0000-4000-8000-0000000000ee', 'other@x.in');
set role authenticated; set request.jwt.claim.sub = '70000000-0000-4000-8000-0000000000ee';
select public.create_restaurant('Other Place');
select pg_temp.check(public.owner_save_plan(json_build_array(json_build_object('id', :'t1', 'x', 1, 'y', 1))::jsonb) = 0, 'other restaurant can''t move our tables');
select public.staff_push_subscribe('{"endpoint": "https://push.example/other", "p256dh": "z", "auth": "z"}');
reset role;
select pg_temp.check(not exists (select 1 from jsonb_array_elements(public.push_hook('order', :'o1', (select hook_secret from push_config)) -> 'subs') s
                                  where s ->> 'endpoint' = 'https://push.example/other'), 'other restaurant gets none of our alerts');

do $$ declare fns text; begin
  select string_agg(p.proname, ',' order by p.proname) into fns from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute');
  assert fns = 'guest_bill,guest_call,guest_join,guest_menu,guest_order,guest_review,guest_state', 'anon can run: ' || fns;
  select string_agg(p.proname, ',') into fns from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('push_keys', 'push_save_keys', 'push_drop', 'push_user_subs', 'push_hook', 'push_send')
     and has_function_privilege('authenticated', p.oid, 'execute');
  assert fns is null, 'staff can run push helpers: ' || fns;
  assert not has_table_privilege('authenticated', 'public.push_config', 'select'), 'push_config readable';
end $$;
\echo 0007 TESTS PASSED
