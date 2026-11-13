-- Tests for 0005_pos_kitchen_close.sql: discounts, takeaway tokens, split payments, kitchen
-- stations and dish ticks, closing the day, team notice. Run on a fresh database:
-- stub → 0001…0005 → sample_menu.sql → this file.
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

-- People: O owner, M manager, W waiter, K kitchen (all in the one restaurant)
\set O '50000000-0000-4000-8000-00000000000a'
\set M '50000000-0000-4000-8000-00000000000b'
\set W '50000000-0000-4000-8000-00000000000c'
\set K '50000000-0000-4000-8000-00000000000d'
insert into auth.users (id, email) values (:'O', 'owner@t.in'), (:'M', 'mgr@t.in'), (:'W', 'waiter@t.in'), (:'K', 'chef@t.in');
update memberships set role = 'manager', active = true where user_id = :'M';
update memberships set role = 'waiter',  active = true where user_id = :'W';
update memberships set role = 'kitchen', active = true where user_id = :'K';
update settings set gst_pct = 5, service_pct = 0;
select id as r1 from restaurants limit 1 \gset
select id as dal from items where name = 'Dal Makhani' \gset
select id as naan from items where name = 'Butter Naan' \gset
select price as dal_p from items where id = :'dal' \gset
select price as naan_p from items where id = :'naan' \gset
select id as t1 from dining_tables where code = 'T1' \gset
select token as tok1 from dining_tables where code = 'T1' \gset

-- ---------------------------------------------------------------- stations
set role authenticated; set request.jwt.claim.sub = :'O';
select public.owner_save_settings('{"stations": [" Tandoor ", "Curry", "curry", "", "Bar"], "max_discount_pct": 10}');
select pg_temp.expect_fail('select public.owner_save_settings(''{"stations": ["a","b","c","d","e","f","g","h","i"]}'')', 'up to 8');
reset role;
select pg_temp.check((select stations from settings) = '{Tandoor,Curry,Bar}', 'stations trimmed and de-duplicated');
select category_id as breads from items where name = 'Butter Naan' \gset
select to_jsonb(i) || '{"station": "Curry"}' as dal_json from items i where id = :'dal' \gset
set role authenticated; set request.jwt.claim.sub = :'O';
select public.owner_save_category(jsonb_build_object('id', :'breads', 'station', 'Tandoor'));
select pg_temp.expect_fail(format('select public.owner_save_category(%L::jsonb)', jsonb_build_object('id', :'breads', 'station', 'Pizza')), 'kitchen station');
select public.owner_save_item(:'dal_json'::jsonb);
reset role;
select pg_temp.check((select station from items where id = :'dal') = 'Curry', 'dish station saved');

-- ---------------------------------------------------------------- dine-in with stations and ticks
set role anon;
select public.guest_order(:'tok1', json_build_array(json_build_object('id', :'dal', 'qty', 1), json_build_object('id', :'naan', 'qty', 2))::jsonb) as g1 \gset
reset role;
select (:'g1'::jsonb) ->> 'visit_id' as v1, (:'g1'::jsonb) -> 'order' ->> 'id' as o1 \gset
select pg_temp.check((select array_agg(station order by station) from order_items where order_id = :'o1') = '{Curry,Tandoor}', 'stations copied onto the order');
select id as oi_dal from order_items where order_id = :'o1' and name = 'Dal Makhani' \gset
select id as oi_naan from order_items where order_id = :'o1' and name = 'Butter Naan' \gset

set role authenticated; set request.jwt.claim.sub = :'K';
select public.staff_item_done(:'oi_naan', true) ->> 'status' as s1 \gset
select pg_temp.check(:'s1' = 'cooking', 'first tick starts cooking');
select pg_temp.check((public.staff_item_done(:'oi_dal', true) ->> 'status') = 'ready', 'last tick makes the order ready');
select pg_temp.check((public.staff_item_done(:'oi_dal', false) ->> 'status') = 'cooking', 'untick goes back to cooking');
select pg_temp.check(((public.staff_order_status(:'o1', 'ready') -> 'items') -> 0 ->> 'done')::boolean, 'Mark ready ticks every dish');
select pg_temp.check(not ((public.staff_order_status(:'o1', 'cooking') -> 'items') -> 0 ->> 'done')::boolean, 'back from ready un-ticks');
select public.staff_order_status(:'o1', 'ready');
select pg_temp.check(jsonb_array_length(public.staff_live() -> 'settings' -> 'stations') = 3, 'live shows stations');
select pg_temp.expect_fail(format('select public.staff_set_discount(%L, %L, 5, %L)', :'v1', 'pct', 'regular'), 'access');
reset role;

-- ---------------------------------------------------------------- discounts
set role authenticated; set request.jwt.claim.sub = :'W';
select pg_temp.expect_fail(format('select public.staff_set_discount(%L, %L, 5, %L)', :'v1', 'pct', 'regular'), 'access');
reset role;
set role authenticated; set request.jwt.claim.sub = :'M';
select pg_temp.expect_fail(format('select public.staff_set_discount(%L, %L, 10, %L)', :'v1', 'pct', ''), 'short reason');
select pg_temp.expect_fail(format('select public.staff_set_discount(%L, %L, 15, %L)', :'v1', 'pct', 'birthday'), 'up to 10%');
select pg_temp.expect_fail(format('select public.staff_set_discount(%L, %L, 1000, %L)', :'v1', 'amount', 'birthday'), 'up to 10%');
select public.staff_set_discount(:'v1', 'pct', 10, 'Regular guest') as b1 \gset
reset role;
-- subtotal = dal + 2 naan; 10 % off; GST 5 % on the net; rounded
select (:'dal_p'::numeric + 2 * :'naan_p'::numeric) as sub \gset
select pg_temp.check(((:'b1'::jsonb) ->> 'discount')::numeric = round(:'sub' * 0.10, 2), 'discount 10 %');
select pg_temp.check(((:'b1'::jsonb) ->> 'total')::numeric = round((:'sub' - round(:'sub' * 0.10, 2)) * 1.05), 'GST after discount');
select pg_temp.check((select count(*) from activity_log where action = 'discount') = 1, 'discount logged');
-- the owner may go past the limit; removing it is logged too
set role authenticated; set request.jwt.claim.sub = :'O';
select pg_temp.check((public.staff_set_discount(:'v1', 'pct', 50, 'Owner comp') ->> 'discount')::numeric = round(:'sub' * 0.5, 2), 'owner beyond limit');
select pg_temp.check((public.staff_set_discount(:'v1', 'none', 0, '') ->> 'discount')::numeric = 0, 'discount removed');
select public.staff_set_discount(:'v1', 'amount', 100, 'Late food') as b2 \gset
reset role;
select pg_temp.check((select count(*) from activity_log where action = 'discount_removed') = 1, 'removal logged');
-- guests see the same discounted bill
set role anon;
select pg_temp.check((public.guest_state(:'tok1') -> 'visit' -> 'bill' ->> 'discount')::numeric = 100, 'guest sees the discount');
reset role;

-- ---------------------------------------------------------------- split payment
select ((:'b2'::jsonb) ->> 'grand')::numeric as grand \gset
set role authenticated; set request.jwt.claim.sub = :'W';
select pg_temp.expect_fail(format('select public.staff_pay(%L, %L::jsonb)', :'v1', json_build_array(json_build_object('method', 'upi', 'amount', 100))), 'add up to');
select pg_temp.expect_fail(format('select public.staff_pay(%L, %L::jsonb)', :'v1', json_build_array(json_build_object('method', 'mixed', 'amount', 1), json_build_object('method', 'cash', 'amount', :'grand'::numeric - 1))), 'how they paid');
select pg_temp.expect_fail(format('select public.staff_pay(%L, %L::jsonb)', :'v1', json_build_array(json_build_object('method', 'upi', 'amount', 'abc'))), 'Check the amounts');
select public.staff_pay(:'v1', json_build_array(json_build_object('method', 'upi', 'amount', 200, 'reference', 'UTR123'),
                                               json_build_object('method', 'cash', 'amount', :'grand'::numeric - 200))::jsonb) as paid \gset
reset role;
select pg_temp.check((select paid_method from visits where id = :'v1') = 'mixed', 'two methods = mixed');
select pg_temp.check((select count(*) from payments where visit_id = :'v1') = 2, 'one payments row per part');
select pg_temp.check((select sum(amount) from payments where visit_id = :'v1') = :'grand', 'parts add up to the bill');
select pg_temp.check((select discount from visits where id = :'v1') = 100, 'discount frozen on the paid bill');
select pg_temp.check(jsonb_array_length((:'paid'::jsonb) -> 'payments') = 2, 'paid bill lists its payments');
select pg_temp.check((select status from orders where id = :'o1') = 'served', 'dine-in: ready dishes served on payment');
set role authenticated; set request.jwt.claim.sub = :'M';
select pg_temp.expect_fail(format('select public.staff_set_discount(%L, %L, 5, %L)', :'v1', 'pct', 'too late'), 'already closed');
reset role;

-- ---------------------------------------------------------------- takeaway
set role authenticated; set request.jwt.claim.sub = :'W';
select gen_random_uuid() as rq \gset
select public.staff_takeaway_order(null, json_build_array(json_build_object('id', :'naan', 'qty', 3))::jsonb, 'no butter', :'rq') as ta \gset
select pg_temp.check(((:'ta'::jsonb) ->> 'token')::int = 1, 'first token of the day is 1');
select pg_temp.check((public.staff_takeaway_order(null, json_build_array(json_build_object('id', :'naan', 'qty', 3))::jsonb, 'no butter', :'rq') ->> 'repeat')::boolean, 'same request saved once');
select public.staff_takeaway_order(null, json_build_array(json_build_object('id', :'dal', 'qty', 1))::jsonb) ->> 'token' as tok2no \gset
select pg_temp.check(:'tok2no'::int = 2, 'second token is 2');
select (:'ta'::jsonb) ->> 'visit_id' as tv, (:'ta'::jsonb) -> 'order' ->> 'id' as tord \gset
select public.staff_takeaway_order(:'tv', json_build_array(json_build_object('id', :'dal', 'qty', 1))::jsonb) ->> 'token' as same \gset
select pg_temp.check(:'same'::int = 1, 'adding to a token keeps its number');
select pg_temp.expect_fail(format('select public.staff_takeaway_order(%L, %L::jsonb)', :'v1', json_build_array(json_build_object('id', :'dal', 'qty', 1))), 'already closed');
select pg_temp.check((select count(*) from jsonb_array_elements(public.staff_live() -> 'visits') v where v ->> 'kind' = 'takeaway') = 2, 'live shows takeaway tokens');
-- takeaway can be paid while it is still cooking, then handed over
reset role;
select (public.visit_bill(:'tv') ->> 'grand')::numeric as tgrand \gset
set role authenticated; set request.jwt.claim.sub = :'W';
select public.staff_pay(:'tv', json_build_array(json_build_object('method', 'cash', 'amount', :'tgrand'))::jsonb);
reset role;
set role authenticated; set request.jwt.claim.sub = :'K';
select public.staff_order_status(:'tord', 'cooking');
select public.staff_order_status(:'tord', 'ready');
select pg_temp.check((select count(*) from jsonb_array_elements(public.staff_live() -> 'visits') v where v ->> 'id' = :'tv') = 1, 'paid takeaway stays on screen until handed over');
reset role;
set role authenticated; set request.jwt.claim.sub = :'M';
select pg_temp.expect_fail(format('select public.staff_order_status(%L, %L)', :'tord', 'cancelled'), 'already closed');
reset role;
set role authenticated; set request.jwt.claim.sub = :'W';
select public.staff_order_status(:'tord', 'served');
reset role;
-- the second order on token 1 was never cooked: the kitchen cooks it and the counter hands it over
select id as tord2 from orders where visit_id = :'tv' and status = 'new' \gset
set role authenticated; set request.jwt.claim.sub = :'K';
select public.staff_order_status(:'tord2', 'cooking'); select public.staff_order_status(:'tord2', 'ready'); select public.staff_order_status(:'tord2', 'served');
select pg_temp.check((select count(*) from jsonb_array_elements(public.staff_live() -> 'visits') v where v ->> 'id' = :'tv') = 0, 'handed over: off the screen');
reset role;
select pg_temp.check((select table_id is null and token_no = 1 from visits where id = :'tv'), 'takeaway visit has no table');
select pg_temp.check((select count(*) from activity_log where action = 'bill_paid' and detail like 'Token 1 ·%') = 1, 'payment log names the token');
-- the database keeps a takeaway order off any table
select pg_temp.expect_fail(format('insert into public.orders (visit_id, table_id) values (%L, %L)', :'tv', :'t1'), 'another table');
select pg_temp.expect_fail(format('insert into public.visits (restaurant_id, kind) values (%L, %L)', :'r1', 'dine_in'), 'visits_kind_table');

-- ---------------------------------------------------------------- team notice
set role authenticated; set request.jwt.claim.sub = :'W';
select pg_temp.expect_fail('select public.staff_set_notice(''hello'')', 'access');
reset role;
set role authenticated; set request.jwt.claim.sub = :'M';
select public.staff_set_notice('  Staff meal at 4 pm. Biryani is off tonight.  ');
reset role;
set role authenticated; set request.jwt.claim.sub = :'K';
select pg_temp.check((public.staff_live() -> 'settings' -> 'notice' ->> 'text') = 'Staff meal at 4 pm. Biryani is off tonight.', 'everyone sees the notice');
reset role;
set role authenticated; set request.jwt.claim.sub = :'M';
select public.staff_set_notice('');
select pg_temp.check((public.staff_live() -> 'settings' -> 'notice') = 'null'::jsonb, 'notice cleared');

-- ---------------------------------------------------------------- close the day
-- the other takeaway (token 2) is still open
select pg_temp.expect_fail(format('select public.staff_close_day(%L, 500, 0, 500)', current_date), 'open bill');
select (v ->> 'id') as tv2 from jsonb_array_elements(public.staff_live() -> 'visits') v where v ->> 'kind' = 'takeaway' \gset
select public.staff_void_visit(:'tv2', 'Customer left');
select public.staff_day_summary() as sm \gset
reset role;
select ((:'sm'::jsonb) -> 'methods' ->> 'cash')::numeric as cash \gset
select pg_temp.check(:'cash'::numeric = (:'grand'::numeric - 200) + :'tgrand'::numeric, 'cash total from payments');
select pg_temp.check(((:'sm'::jsonb) -> 'methods' ->> 'upi')::numeric = 200, 'UPI total from payments');
select pg_temp.check(((:'sm'::jsonb) ->> 'discounts')::numeric = 100, 'discounts counted');
select (:'sm'::jsonb) ->> 'today' as today \gset
set role authenticated; set request.jwt.claim.sub = :'W';
select pg_temp.expect_fail(format('select public.staff_close_day(%L, 500, 0, 500)', :'today'), 'access');
reset role;
set role authenticated; set request.jwt.claim.sub = :'M';
select pg_temp.expect_fail(format('select public.staff_close_day(%L::date + 1, 500, 0, 500)', :'today'), 'hasn''t started');
select pg_temp.expect_fail(format('select public.staff_close_day(%L, 500, 0, -1)', :'today'), 'cash amounts');
select public.staff_close_day(:'today', 500, 50, :'cash'::numeric + 440, 'Bought ice') as cl \gset
select pg_temp.check(((:'cl'::jsonb) ->> 'expected')::numeric = 500 + :'cash'::numeric - 50, 'expected = opening + cash - paid out');
select pg_temp.check(((:'cl'::jsonb) ->> 'difference')::numeric = -10, 'difference: 10 short');
select pg_temp.expect_fail(format('select public.staff_close_day(%L, 0, 0, 0)', :'today'), 'already closed');
select pg_temp.check((public.staff_live() -> 'settings' ->> 'day_closed')::boolean, 'live knows the day is closed');
-- a closed day takes no orders or payments
select pg_temp.expect_fail(format('select public.staff_add_order(%L, %L::jsonb)', :'t1', json_build_array(json_build_object('id', :'dal', 'qty', 1))), 'Today has been closed');
select pg_temp.expect_fail(format('select public.staff_takeaway_order(null, %L::jsonb)', json_build_array(json_build_object('id', :'dal', 'qty', 1))), 'Today has been closed');
select pg_temp.expect_fail(format('select public.owner_reopen_day(%L, %L)', :'today', 'mistake'), 'access');   -- only the owner reopens
reset role;
set role anon;
select pg_temp.expect_fail(format('select public.guest_order(%L, %L::jsonb)', :'tok1', json_build_array(json_build_object('id', :'dal', 'qty', 1))), 'kitchen is closed');
reset role;
select pg_temp.check((select count(*) from activity_log where action = 'day_closed' and detail like '%₹10.00 short%') = 1, 'close logged with the difference');
set role authenticated; set request.jwt.claim.sub = :'O';
select pg_temp.expect_fail(format('select public.owner_reopen_day(%L, %L)', :'today', ''), 'short reason');
select public.owner_reopen_day(:'today', 'Late table came in');
select pg_temp.check(not (public.staff_live() -> 'settings' ->> 'day_closed')::boolean, 'reopened');
select pg_temp.check((public.staff_add_order(:'t1', json_build_array(json_build_object('id', :'dal', 'qty', 1))::jsonb) ->> 'visit_id') is not null, 'orders again after reopening');
select pg_temp.check((public.owner_report(:'today'::date, :'today'::date) -> 'methods' ->> 'upi')::numeric = 200, 'report counts split parts per method');
reset role;
select pg_temp.check((select count(*) from activity_log where action = 'day_reopened' and detail like '%was counted%') = 1, 'reopen keeps the old numbers in the log');

-- ---------------------------------------------------------------- old single payment still works
set role authenticated; set request.jwt.claim.sub = :'W';
select (v ->> 'id') as v3 from jsonb_array_elements(public.staff_live() -> 'visits') v where v ->> 'table_id' = :'t1' \gset
select public.staff_order_status((v -> 'orders' -> 0 ->> 'id')::uuid, 'cancelled') from jsonb_array_elements(public.staff_live() -> 'visits') v where v ->> 'id' = :'v3';
select pg_temp.check((public.staff_mark_paid(:'v3', 'card', 'slip 9') ->> 'grand')::numeric = 0, 'single payment path');
reset role;
select pg_temp.check((select method || ':' || amount || ':' || reference from payments where visit_id = :'v3') = 'card:0.00:slip 9', 'single payment row');

-- ---------------------------------------------------------------- another restaurant can't touch any of it
insert into auth.users (id, email) values ('50000000-0000-4000-8000-0000000000ee', 'other@x.in');
set role authenticated; set request.jwt.claim.sub = '50000000-0000-4000-8000-0000000000ee';
select public.create_restaurant('Other Place') as r2 \gset
select pg_temp.expect_fail(format('select public.staff_item_done(%L, true)', :'oi_dal'), 'gone');
select pg_temp.expect_fail(format('select public.staff_set_discount(%L, %L, 5, %L)', :'v3', 'pct', 'steal'), 'already closed');
select pg_temp.expect_fail(format('select public.staff_pay(%L, %L::jsonb)', :'v3', '[{"method":"cash","amount":0}]'), 'already closed');
select pg_temp.expect_fail(format('select public.staff_takeaway_order(%L, %L::jsonb)', :'tv', json_build_array(json_build_object('id', :'dal', 'qty', 1))), 'no longer on the menu');
select pg_temp.check((public.staff_day_summary() -> 'closed') = 'null'::jsonb and jsonb_array_length(public.staff_day_summary() -> 'recent') = 0, 'closes are per restaurant');
reset role;
-- deleting a restaurant takes its day closes with it; a close can't move to another restaurant
insert into day_closes (restaurant_id, day, expected, counted, difference) values (:'r2', current_date - 1, 0, 0, 0);
select pg_temp.expect_fail(format('update public.day_closes set restaurant_id = %L where restaurant_id = %L', :'r1', :'r2'), 'move between restaurants');
delete from restaurants where id = :'r2';
select pg_temp.check(not exists (select 1 from day_closes where restaurant_id = :'r2'), 'day closes deleted with the restaurant');

-- Guests still run exactly the six guest functions; helpers run for nobody
do $$ declare fns text; begin
  select string_agg(p.proname, ',' order by p.proname) into fns from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute');
  assert fns = 'guest_bill,guest_call,guest_join,guest_menu,guest_order,guest_review,guest_state', 'anon can run: ' || fns;
  select string_agg(p.proname, ',') into fns from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('pay_visit', 'next_token', 'day_closed', 'station_ok', 'insert_order_items', 'visit_label', 'order_open')
     and has_function_privilege('authenticated', p.oid, 'execute');
  assert fns is null, 'staff can run helpers: ' || fns;
  assert (select relrowsecurity from pg_class where oid = 'public.day_closes'::regclass), 'day_closes RLS off';
  assert not has_table_privilege('authenticated', 'public.day_closes', 'select'), 'day_closes readable';
end $$;
\echo 0005 TESTS PASSED
