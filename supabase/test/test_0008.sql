-- Tests for 0008_areas.sql: the restaurant's own areas, room shapes and markers.
-- Run on a database that had 0001…0007 + sample_menu.sql + a table in area "terrace", then 0008, then this file.
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

-- ---------------------------------------------------------------- the upgrade
select pg_temp.check((select string_agg(name, ',' order by sort) from areas) = 'Main,Terrace', 'existing areas brought in, in table order: ' || (select string_agg(name, ',' order by sort) from areas));
select pg_temp.check((select area from dining_tables where code = 'T9') = 'Terrace', '"terrace" table joined Terrace');

\set O '80000000-0000-4000-8000-00000000000a'
\set W '80000000-0000-4000-8000-00000000000c'
\set M '80000000-0000-4000-8000-00000000000b'
insert into auth.users (id, email) values (:'O', 'owner@t.in'), (:'W', 'waiter@t.in'), (:'M', 'mgr@t.in');
update memberships set role = 'waiter',  active = true where user_id = :'W';
update memberships set role = 'manager', active = true where user_id = :'M';
select id as main from areas where name = 'Main' \gset
select id as terr from areas where name = 'Terrace' \gset
select id as t1 from dining_tables where code = 'T1' \gset
select id as t5 from dining_tables where code = 'T5' \gset

-- ---------------------------------------------------------------- add, rename, sort
set role authenticated; set request.jwt.claim.sub = :'M';
select public.owner_save_area('{"name": "  Roof   top ", "shape": "long"}') as roof \gset
select pg_temp.expect_fail('select public.owner_save_area(''{"name": "MAIN"}'')', 'already an area called');
select pg_temp.expect_fail('select public.owner_save_area(''{"name": " "}'')', 'Give the area a name');
select pg_temp.expect_fail('select public.owner_save_area(''{"name": "Hall", "shape": "round"}'')', 'wide, square or long');
-- a table typed with other capitals goes to the existing area; a new name adds one
select public.owner_save_table(jsonb_build_object('code', 'R1', 'area', 'roof top', 'seats', 2)) as r1 \gset
select public.owner_save_table(jsonb_build_object('code', 'G1', 'area', 'Garden', 'seats', 4)) as g1 \gset
reset role;
select pg_temp.check((select name = 'Roof top' and shape = 'long' and sort = 3 from areas where id = :'roof'), 'new area tidied, last in order');
select pg_temp.check((select area from dining_tables where id = :'r1') = 'Roof top', 'table uses the area''s spelling');
select pg_temp.check(exists (select 1 from areas where name = 'Garden' and sort = 4), 'new name on a table adds the area');

set role authenticated; set request.jwt.claim.sub = :'M';
select public.owner_save_area(jsonb_build_object('id', :'terr', 'name', 'Open Terrace'));
select public.owner_sort_areas(array[:'roof', :'main', :'terr']::uuid[]);
select public.staff_live() -> 'areas' as live_areas \gset
reset role;
select pg_temp.check((select count(*) from dining_tables where area = 'Open Terrace') = 3 and not exists (select 1 from dining_tables where area = 'Terrace'), 'rename moves its tables');
select pg_temp.check((select string_agg(e ->> 'name', ',') from jsonb_array_elements(:'live_areas'::jsonb) e) like 'Roof top,Main,Open Terrace%', 'live areas in the new order: ' || :'live_areas');
select pg_temp.check(exists (select 1 from activity_log where action = 'area_renamed' and detail = 'Terrace → Open Terrace'), 'rename logged');

-- ---------------------------------------------------------------- the room: places and markers
set role authenticated; set request.jwt.claim.sub = :'M';
select pg_temp.check(public.owner_save_room(jsonb_build_object('area_id', :'main',
  'tables', json_build_array(json_build_object('id', :'t1', 'x', 900, 'y', 600), json_build_object('id', :'t5', 'x', 100, 'y', 100)),
  'marks', json_build_array(json_build_object('k', 'entrance', 'x', 500, 'y', 620), json_build_object('k', 'kitchen', 'x', 950, 'y', 60)))) = 1,
  'room saved: only tables in that area move');
select pg_temp.expect_fail(format('select public.owner_save_room(%L::jsonb)', jsonb_build_object('area_id', :'main', 'marks', json_build_array(json_build_object('k', 'pool', 'x', 1, 'y', 1)))), 'isn''t one we know');
select pg_temp.expect_fail(format('select public.owner_save_room(%L::jsonb)', jsonb_build_object('area_id', :'roof', 'tables', json_build_array(json_build_object('id', :'r1', 'x', 500, 'y', 500)))), 'outside the room');
reset role;
select pg_temp.check((select jsonb_array_length(marks) = 2 and marks -> 0 ->> 'k' = 'entrance' from areas where id = :'main'), 'markers saved');
select pg_temp.check((select plan_x is null from dining_tables where id = :'t5'), 'a table from another area isn''t moved');

-- a smaller room pulls tables and markers inside it
set role authenticated; set request.jwt.claim.sub = :'M';
select public.owner_save_area(jsonb_build_object('id', :'main', 'name', 'Main', 'shape', 'square'));
reset role;
select pg_temp.check((select plan_x <= 590 and plan_y <= 590 from dining_tables where id = :'t1'), 'table brought inside the square room');
select pg_temp.check((select bool_and((e ->> 'x')::int <= 610 and (e ->> 'y')::int <= 610) from areas, jsonb_array_elements(marks) e where id = :'main'), 'markers brought inside');

-- ---------------------------------------------------------------- delete
set role authenticated; set request.jwt.claim.sub = :'M';
select pg_temp.expect_fail(format('select public.owner_delete_area(%L)', :'main'), 'Move its 4 tables');
select public.owner_save_area('{"name": "Spare"}') as spare \gset
select public.owner_delete_area(:'spare');
reset role;
select pg_temp.check(not exists (select 1 from areas where id = :'spare'), 'empty area deleted');

-- ---------------------------------------------------------------- who may
set role authenticated; set request.jwt.claim.sub = :'W';
select pg_temp.expect_fail('select public.owner_save_area(''{"name": "X"}'')', 'access');
select pg_temp.expect_fail(format('select public.owner_delete_area(%L)', :'roof'), 'access');
select pg_temp.expect_fail(format('select public.owner_save_room(%L::jsonb)', jsonb_build_object('area_id', :'main')), 'access');
select pg_temp.check(jsonb_array_length(public.staff_live() -> 'areas') = 4, 'waiters see the areas');
reset role;
set role anon;
select pg_temp.expect_fail('select * from public.areas', 'permission denied');
reset role;

-- another restaurant: its own areas, can't touch ours
insert into auth.users (id, email) values ('80000000-0000-4000-8000-0000000000ee', 'other@x.in');
set role authenticated; set request.jwt.claim.sub = '80000000-0000-4000-8000-0000000000ee';
select public.create_restaurant('Other Place');
select public.owner_save_area('{"name": "Main"}') as other_main \gset
select public.owner_delete_area(:'roof');
select public.owner_sort_areas(array[:'main']::uuid[]);
select pg_temp.expect_fail(format('select public.owner_save_room(%L::jsonb)', jsonb_build_object('area_id', :'main')), 'That area is gone');
select pg_temp.check(jsonb_array_length(public.staff_live() -> 'areas') = 1, 'other restaurant sees only its own area');
reset role;
select pg_temp.check(exists (select 1 from areas where id = :'roof') and (select sort from areas where id = :'main') = 2, 'ours untouched');
select pg_temp.check((select restaurant_id from areas where id = :'other_main') <> (select restaurant_id from areas where id = :'main'), 'same name, two restaurants');

do $$ declare fns text; begin
  select string_agg(p.proname, ',' order by p.proname) into fns from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute');
  assert fns = 'guest_bill,guest_call,guest_join,guest_menu,guest_order,guest_review,guest_state', 'anon can run: ' || fns;
  select string_agg(p.proname, ',') into fns from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('area_room', 'check_marks', 'table_area') and has_function_privilege('authenticated', p.oid, 'execute');
  assert fns is null, 'staff can run area helpers: ' || fns;
end $$;
\echo 0008 TESTS PASSED
