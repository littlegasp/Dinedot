-- Local test (plain Postgres): psql -v ON_ERROR_STOP=1 -f stub.sql -f ../migrations/0001_init.sql -f ../sample_menu.sql -f test.sql
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

-- Logins: first = owner (active), then waiter + kitchen (start off)
insert into auth.users (id, email) values ('10000000-0000-4000-8000-000000000001', 'owner@x.in'),
  ('10000000-0000-4000-8000-000000000002', 'waiter@x.in'), ('10000000-0000-4000-8000-000000000003', 'chef@x.in');
do $$ begin
  assert (select role from staff where email='owner@x.in') = 'owner' and (select active from staff where email='owner@x.in');
  assert not (select active from staff where email='waiter@x.in');
end $$;

-- Guest (anon) cannot read tables directly
set role anon;
select pg_temp.expect_fail('select * from public.items', 'permission denied');
select pg_temp.expect_fail('select * from public.dining_tables', 'permission denied');
select pg_temp.expect_fail('select public.staff_live()', 'permission denied');
select pg_temp.expect_fail('select public.guest_menu(''nope'')', 'QR code isn''t active');
reset role;

select token as t1 from dining_tables where code='T1' \gset
select id as karahi from items where name='Chicken Karahi' \gset
select id as naan from items where name='Butter Naan' \gset
select id as dal from items where name='Dal Makhani' \gset

set role anon;
select jsonb_array_length(public.guest_menu(:'t1') -> 'items') = 11 as menu_ok \gset
\if :menu_ok \else \echo 'menu wrong' \quit \endif
-- Price checks: size required, addon priced, unknown extra refused
select pg_temp.expect_fail(format('select public.guest_order(%L, %L::jsonb)', :'t1', json_build_array(json_build_object('id', :'karahi', 'qty', 1))), 'Pick a size');
select pg_temp.expect_fail(format('select public.guest_order(%L, %L::jsonb)', :'t1', json_build_array(json_build_object('id', :'naan', 'qty', 1, 'addons', json_build_array('Gold')))), 'no longer offered');
select pg_temp.expect_fail(format('select public.guest_order(%L, %L::jsonb)', :'t1', '[]'), 'empty');
select public.guest_order(:'t1', json_build_array(
   json_build_object('id', :'karahi', 'qty', 1, 'size', 'Full', 'price', 1),   -- price from browser is ignored
   json_build_object('id', :'naan', 'qty', 4, 'addons', json_build_array('Garlic')))::jsonb, 'Less oil', 2) ->> 'visit_id' as visit \gset
-- Too fast a second order
select pg_temp.expect_fail(format('select public.guest_order(%L, %L::jsonb)', :'t1', json_build_array(json_build_object('id', :'dal', 'qty', 1))), 'wait a few seconds');
select (public.guest_state(:'t1') -> 'visit' -> 'bill' ->> 'subtotal')::numeric as sub \gset
\echo subtotal :sub
reset role;
select (:sub = 420 + 4*75) as sub_ok \gset
\if :sub_ok \else \echo 'subtotal wrong' \quit \endif
-- GST 5% on 720 = 36 → 756
select (visit_bill(:'visit') ->> 'total')::numeric = 756 as tot_ok \gset
\if :tot_ok \else \echo 'total wrong' \quit \endif
-- second order after 15 s
update orders set created_at = now() - interval '1 minute';

set role anon;
select public.guest_order(:'t1', json_build_array(json_build_object('id', :'dal', 'qty', 1))::jsonb) is not null as o2;
select public.guest_call(:'t1', 'water') ->> 'already' as a1;
select public.guest_call(:'t1', 'water') ->> 'already' as a2;
select pg_temp.expect_fail(format('select public.guest_bill(%L, 2, 7, %L)', :'t1', 'upi'), 'tip options');
select public.guest_bill(:'t1', 2, 10, 'upi') ->> 'each' as each_share;
reset role;

-- Staff: inactive waiter blocked; owner switches them on
set role authenticated; set request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';
select pg_temp.expect_fail('select public.staff_live()', 'access');
set request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
select public.owner_edit_staff('10000000-0000-4000-8000-000000000002', 'Ravi', '', 'waiter', true);
select public.owner_edit_staff('10000000-0000-4000-8000-000000000003', 'Chef', '', 'kitchen', true);
select pg_temp.expect_fail('select public.owner_edit_staff(''10000000-0000-4000-8000-000000000001'', ''Me'', '''', ''waiter'', true)', 'own owner');

reset role; select id as o1 from orders order by no limit 1 \gset
set role authenticated;
-- Kitchen: can move orders and mark sold out, cannot cancel/menu/pay/settings
set request.jwt.claim.sub = '10000000-0000-4000-8000-000000000003';
select jsonb_array_length(public.staff_live() -> 'visits') = 1 as live_ok;
select public.staff_order_status(:'o1', 'cooking') ->> 'status';
select pg_temp.expect_fail(format('select public.staff_order_status(%L, %L)', :'o1', 'cancelled'), 'access');
select pg_temp.expect_fail(format('select public.staff_mark_paid(%L, %L)', :'visit', 'cash'), 'access');
select pg_temp.expect_fail('select public.owner_save_settings(''{"gst_pct":0}'')', 'access');
select pg_temp.expect_fail('select public.owner_table_tokens()', 'access');
select public.staff_item_available(:'dal', false);
reset role;
set role anon;
select pg_temp.expect_fail(format('select public.guest_order(%L, %L::jsonb)', :'t1', json_build_array(json_build_object('id', :'dal', 'qty', 1))), 'sold out');
reset role;

-- Waiter: can't pay while kitchen still has dishes; serves; pays
set role authenticated; set request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';
select pg_temp.expect_fail(format('select public.staff_mark_paid(%L, %L)', :'visit', 'upi'), 'still with the kitchen');
select pg_temp.expect_fail('select public.owner_save_item(''{}'')', 'access');
select pg_temp.expect_fail('select * from public.orders', 'permission denied');
reset role;
update orders set status = 'ready' where visit_id = :'visit';
set role authenticated; set request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';
select public.staff_mark_paid(:'visit', 'upi') ->> 'grand' as grand;
select jsonb_array_length(public.staff_live() -> 'calls') = 0 as calls_cleared;
reset role;
do $$ declare v visits; begin
  select * into v from visits where status = 'paid';
  -- subtotal 720 + 280 dal = 1000; gst 50 → 1050; tip 10% of 1000 = 100 → 1150
  assert v.subtotal = 1000 and v.gst = 50 and v.tip = 100 and v.total = 1150, format('paid totals wrong: %s', row_to_json(v));
end $$;

-- Guest after paying: sees last_paid and can review once (updates on retry)
set role anon;
select (public.guest_state(:'t1') -> 'last_paid' ->> 'id') = :'visit' as lp_ok;
select public.guest_review(:'t1', :'visit', 5, 'Lovely karahi');
select public.guest_review(:'t1', :'visit', 4, 'Lovely karahi, slow naan');
reset role;
do $$ begin assert (select count(*) from reviews) = 1 and (select stars from reviews) = 4; end $$;

-- Owner report + manager rules
set role authenticated; set request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
select public.owner_report(current_date - 1, current_date + 1) ->> 'sales' as sales;
select public.owner_edit_staff('10000000-0000-4000-8000-000000000002', 'Ravi', '', 'manager', true);
set request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';
select public.owner_save_settings('{"accepting_orders": false}');
select pg_temp.expect_fail('select public.owner_save_settings(''{"gst_pct": 0}'')', 'Only the owner');
reset role;
set role anon;
select pg_temp.expect_fail(format('select public.guest_order(%L, %L::jsonb)', :'t1', json_build_array(json_build_object('id', :'naan', 'qty', 1))), 'kitchen is closed');
reset role;
-- 0002 cover photo
set role authenticated; set request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
select public.owner_save_settings('{"cover_url": "https://x.supabase.co/storage/v1/object/public/menu-photos/c.jpg"}');
select pg_temp.expect_fail('select public.owner_save_settings(''{"cover_url": "javascript:alert(1)"}'')', 'uploaded photo');
reset role;
select (public.guest_menu(:'t1') -> 'place' ->> 'cover') like 'https://%' as cover_ok \gset
\if :cover_ok \else \echo 'cover missing' \quit \endif
\echo COVER TESTS PASSED
\echo ALL TESTS PASSED
