-- Tests for 0004_restaurants.sql: two restaurants in one database must never see or touch
-- each other's data. Run on a fresh database: stub → 0001…0004 → sample_menu.sql → this file.
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

-- People: A = first login (owner of the existing restaurant), C = starts a second restaurant,
-- D = signs up later with no invite, E = invited by C from the Team screen.
\set A '40000000-0000-4000-8000-00000000000a'
\set C '40000000-0000-4000-8000-00000000000c'
\set D '40000000-0000-4000-8000-00000000000d'
\set E '40000000-0000-4000-8000-00000000000e'
insert into auth.users (id, email) values (:'A', 'anita@copper.in'), (:'C', 'chetan@spice.in');

select id as r1 from restaurants where slug = 'main' \gset
do $$ begin
  assert (select count(*) from restaurants) = 1, 'one restaurant after the migration';
  assert not exists (select 1 from categories where restaurant_id is null), 'sample menu got a restaurant';
  assert (select role from memberships where user_id = '40000000-0000-4000-8000-00000000000a') = 'owner', 'first login = owner';
  assert not (select active from memberships where user_id = '40000000-0000-4000-8000-00000000000c'), 'later login starts off';
end $$;

-- C starts their own restaurant and leaves the first one's team
set role authenticated; set request.jwt.claim.sub = :'C';
select public.create_restaurant('Spice Route') as r2 \gset
select pg_temp.expect_fail('select public.create_restaurant('' '')', 'Give the restaurant a name');
select (public.staff_me() ->> 'role') = 'owner' and (public.staff_me() ->> 'restaurant') = 'Spice Route' as me_ok \gset
\if :me_ok \else \echo 'staff_me wrong for new owner' \quit \endif
reset role;
delete from memberships where user_id = :'C' and restaurant_id = :'r1';

-- D signs up with no invite: no restaurant, no access, can start one
insert into auth.users (id, email) values (:'D', 'dev@x.in');
-- E is invited into Spice Route (team-admin sets app_metadata with the service key)
insert into auth.users (id, email, raw_app_meta_data) values (:'E', 'esha@spice.in', jsonb_build_object('restaurant_id', :'r2'));
do $$ begin
  assert not exists (select 1 from memberships where user_id = '40000000-0000-4000-8000-00000000000d'), 'uninvited signup joined a restaurant';
  assert (select restaurant_id from memberships where user_id = '40000000-0000-4000-8000-00000000000e')
       = (select id from restaurants where name = 'Spice Route'), 'invite went to the wrong restaurant';
  assert not (select active from memberships where user_id = '40000000-0000-4000-8000-00000000000e'), 'invited login must start off';
end $$;
set role authenticated; set request.jwt.claim.sub = :'D';
select pg_temp.expect_fail('select public.staff_live()', 'access');
select pg_temp.expect_fail('select public.owner_team()', 'access');
select (public.staff_me() ->> 'role') is null as d_ok \gset
\if :d_ok \else \echo 'uninvited login has a role' \quit \endif
-- a signup can't name a restaurant for itself (user metadata is ignored)
reset role;
insert into auth.users (id, email, raw_user_meta_data) values ('40000000-0000-4000-8000-0000000000ff', 'sneaky@x.in', jsonb_build_object('restaurant_id', :'r1'));
do $$ begin assert not exists (select 1 from memberships where user_id = '40000000-0000-4000-8000-0000000000ff'), 'user_metadata let a signup join'; end $$;

-- C builds a small menu and two tables
set role authenticated; set request.jwt.claim.sub = :'C';
select public.owner_save_category('{"name": "Mains"}') as c2 \gset
select public.owner_save_item(jsonb_build_object('category_id', :'c2', 'name', 'Appam & Stew', 'price', 260)) as appam \gset
select public.owner_save_table('{"code": "T1", "seats": 4}') as t2a \gset
select public.owner_save_table('{"code": "T2", "seats": 2}') as t2b \gset
select public.owner_edit_staff(:'E', 'Esha', '', 'waiter', true);
-- C can't reach the first restaurant's things
reset role;
select id as karahi from items where name = 'Chicken Karahi' and restaurant_id = :'r1' \gset
select id as cat1 from categories where restaurant_id = :'r1' limit 1 \gset
select id as t1 from dining_tables where code = 'T1' and restaurant_id = :'r1' \gset
select token as tok1 from dining_tables where id = :'t1' \gset
select token as tok2 from dining_tables where id = :'t2a' \gset
set role authenticated; set request.jwt.claim.sub = :'C';
select pg_temp.expect_fail(format('select public.owner_save_item(%L::jsonb)', jsonb_build_object('category_id', :'cat1', 'name', 'X', 'price', 1)), 'Pick a section');
select pg_temp.expect_fail(format('select public.owner_save_item(%L::jsonb)', jsonb_build_object('id', :'karahi', 'category_id', :'c2', 'name', 'Mine now', 'price', 1)), 'gone');
select pg_temp.expect_fail(format('select public.owner_new_token(%L)', :'t1'), 'gone');
select pg_temp.expect_fail(format('select public.staff_item_available(%L, false)', :'karahi'), 'gone');
select pg_temp.expect_fail(format('select public.staff_add_order(%L, %L::jsonb)', :'t1', json_build_array(json_build_object('id', :'appam', 'qty', 1))), 'Unknown table');
select pg_temp.expect_fail(format('select public.owner_edit_staff(%L, %L, %L, %L, true)', :'A', 'A', '', 'waiter'), 'isn''t on your team');
select jsonb_array_length(public.staff_live() -> 'tables') = 2 as live2 \gset
\if :live2 \else \echo 'staff_live shows other tables' \quit \endif
select (select count(*) from jsonb_object_keys(public.owner_table_tokens())) = 2 as tok_n \gset
\if :tok_n \else \echo 'tokens of another restaurant leaked' \quit \endif
select jsonb_array_length(public.staff_menu() -> 'items') = 1 as menu2 \gset
\if :menu2 \else \echo 'staff_menu shows other dishes' \quit \endif
select jsonb_array_length(public.owner_team() -> 'staff') = 2 as team2 \gset
\if :team2 \else \echo 'owner_team wrong' \quit \endif
reset role;

-- Guests: each QR shows its own restaurant; dishes can't be ordered across restaurants
set role anon;
select (public.guest_menu(:'tok2') -> 'place' ->> 'name') = 'Spice Route' and jsonb_array_length(public.guest_menu(:'tok2') -> 'items') = 1 as g2 \gset
\if :g2 \else \echo 'guest menu of restaurant 2 wrong' \quit \endif
select jsonb_array_length(public.guest_menu(:'tok1') -> 'items') = 11 as g1 \gset
\if :g1 \else \echo 'guest menu of restaurant 1 wrong' \quit \endif
select pg_temp.expect_fail(format('select public.guest_order(%L, %L::jsonb)', :'tok1', json_build_array(json_build_object('id', :'appam', 'qty', 1))), 'no longer on the menu');
select pg_temp.expect_fail(format('select public.guest_order(%L, %L::jsonb)', :'tok2', json_build_array(json_build_object('id', :'karahi', 'qty', 1, 'size', 'Full'))), 'no longer on the menu');
select public.guest_order(:'tok2', json_build_array(json_build_object('id', :'appam', 'qty', 2))::jsonb) -> 'order' ->> 'no' as no2 \gset
select public.guest_order(:'tok1', json_build_array(json_build_object('id', :'karahi', 'qty', 1, 'size', 'Full'))::jsonb) ->> 'visit_id' as v1 \gset
reset role;
\if `test :no2 -eq 1 && echo true || echo false` \else \echo 'order numbers should start at 1 per restaurant' \quit \endif

-- Settings are separate: C closing ordering doesn't close restaurant 1
set role authenticated; set request.jwt.claim.sub = :'C';
select public.owner_save_settings('{"accepting_orders": false, "gst_pct": 18}');
reset role;
update orders set created_at = now() - interval '1 minute';
set role anon;
select pg_temp.expect_fail(format('select public.guest_order(%L, %L::jsonb)', :'tok2', json_build_array(json_build_object('id', :'appam', 'qty', 1))), 'kitchen is closed');
select public.guest_order(:'tok1', json_build_array(json_build_object('id', :'karahi', 'qty', 1, 'size', 'Half'))::jsonb) is not null as still_open;
select (public.guest_state(:'tok1') -> 'visit' -> 'bill' ->> 'gst_pct')::numeric = 5 as gst1 \gset
\if :gst1 \else \echo 'restaurant 1 got restaurant 2 GST' \quit \endif
reset role;

-- A's orders are invisible and untouchable for C
select id as o1 from orders where restaurant_id = :'r1' limit 1 \gset
set role authenticated; set request.jwt.claim.sub = :'C';
select pg_temp.expect_fail(format('select public.staff_order_status(%L, %L)', :'o1', 'cooking'), 'gone');
select pg_temp.expect_fail(format('select public.staff_mark_paid(%L, %L)', :'v1', 'cash'), 'already closed');
select pg_temp.expect_fail(format('select public.staff_void_visit(%L, %L)', :'v1', 'test reason'), 'already closed');
select pg_temp.expect_fail(format('select public.staff_visit_update(%L, 2, 0, 2)', :'v1'), 'already closed');
select (public.owner_report(current_date - 1, current_date + 1) ->> 'bills')::int = 0 as rep2 \gset
\if :rep2 \else \echo 'report counted another restaurant' \quit \endif
select not exists (select 1 from jsonb_array_elements(public.owner_activity()) a where a ->> 'action' = 'restaurant_created' and a ->> 'detail' <> 'Spice Route') as act2 \gset
\if :act2 \else \echo 'activity of another restaurant leaked' \quit \endif
reset role;

-- The database refuses cross-restaurant links even outside the functions
select pg_temp.expect_fail(format('insert into public.items (restaurant_id, category_id, name, price) values (%L, %L, %L, 1)', :'r1', :'c2', 'X'), 'another restaurant');
select pg_temp.expect_fail(format('update public.dining_tables set restaurant_id = %L where id = %L', :'r1', :'t2a'), 'move between restaurants');
select pg_temp.expect_fail(format('insert into public.orders (visit_id, table_id) values (%L, %L)', :'v1', :'t2a'), 'another restaurant');

-- One person in two restaurants: A also manages Spice Route
insert into memberships (restaurant_id, user_id, role, active, name) values (:'r2', :'A', 'manager', true, 'Anita');
set role authenticated; set request.jwt.claim.sub = :'A';
select jsonb_array_length(public.staff_restaurants()) = 2 as two \gset
\if :two \else \echo 'staff_restaurants wrong' \quit \endif
select (public.staff_switch_restaurant(:'r2') ->> 'role') = 'manager' as sw \gset
\if :sw \else \echo 'switch failed' \quit \endif
select jsonb_array_length(public.staff_live() -> 'tables') = 2 as live_r2 \gset
\if :live_r2 \else \echo 'switched view wrong' \quit \endif
select pg_temp.expect_fail('select public.owner_team()', 'access');            -- manager there, not owner
select public.staff_switch_restaurant(:'r1') ->> 'role' as back;
select pg_temp.expect_fail(format('select public.staff_switch_restaurant(%L)', gen_random_uuid()), 'access');
reset role;

-- Logins: C controls Esha's login but not Anita's (Anita owns another restaurant)
set role authenticated; set request.jwt.claim.sub = :'C';
select public.owner_controls_login(:'E') as ce, public.owner_controls_login(:'A') as ca \gset
\if :ce \else \echo 'owner should control own staff login' \quit \endif
\if :ca \echo 'owner controls a login of another restaurant' \quit \endif
select public.owner_edit_staff(:'A', 'Renamed', '', 'waiter', true, 'stolen@x.in');
select public.owner_prepare_delete(:'A') as whole \gset
\if :whole \echo 'would delete a login used elsewhere' \quit \endif
reset role;
do $$ begin
  assert (select email from staff where id = '40000000-0000-4000-8000-00000000000a') = 'anita@copper.in', 'owner changed another restaurant''s login email';
  assert (select count(*) from memberships where user_id = '40000000-0000-4000-8000-00000000000a') = 1, 'membership not removed';
  assert (select role from memberships where user_id = '40000000-0000-4000-8000-00000000000a') = 'owner', 'home membership touched';
end $$;

-- Suspended restaurant: QR and staff screens stop
update restaurants set status = 'suspended' where id = :'r2';
set role anon;
select pg_temp.expect_fail(format('select public.guest_menu(%L)', :'tok2'), 'isn''t active');
reset role;
set role authenticated; set request.jwt.claim.sub = :'C';
select pg_temp.expect_fail('select public.staff_live()', 'access');
reset role;

-- Deleting a restaurant deletes everything in it, and nothing else (DPDP: deleting means deleted)
select count(*) as before1 from orders where restaurant_id = :'r1' \gset
delete from restaurants where id = :'r2';
do $$ declare t text; n int; begin
  foreach t in array array['settings','categories','items','dining_tables','visits','orders','order_items','calls','reviews','payments','activity_log','memberships'] loop
    execute format('select count(*) from public.%I where restaurant_id not in (select id from public.restaurants)', t) into n;
    assert n = 0, format('%s rows left behind in %s', n, t);
  end loop;
end $$;
select (select count(*) from orders where restaurant_id = :'r1') = :before1 as kept \gset
\if :kept \else \echo 'restaurant 1 lost data' \quit \endif

-- Guests still run exactly the six guest functions
do $$ declare fns text; begin
  select string_agg(p.proname, ',' order by p.proname) into fns from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute');
  assert fns = 'guest_bill,guest_call,guest_menu,guest_order,guest_review,guest_state', 'anon can run: ' || fns;
end $$;
\echo 0004 TESTS PASSED
