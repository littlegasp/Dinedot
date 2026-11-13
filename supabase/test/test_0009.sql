-- Tests for 0009_tip_amount.sql: a tip as a rupee amount.
-- Run on a fresh database: stub → 0001…0009 → sample_menu.sql → this file.
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

\set O '90000000-0000-4000-8000-00000000000a'
\set W '90000000-0000-4000-8000-00000000000c'
insert into auth.users (id, email) values (:'O', 'owner@t.in'), (:'W', 'waiter@t.in');
update memberships set role = 'waiter', active = true where user_id = :'W';
select token as tok1 from dining_tables where code = 'T1' \gset
select id as dal from items where name = 'Dal Makhani' \gset

-- a guest orders, then asks for the bill with a ₹50 tip
set role anon;
select public.guest_order(:'tok1', json_build_array(json_build_object('id', :'dal', 'qty', 2))::jsonb) ->> 'visit_id' as v1 \gset
select public.guest_bill(:'tok1', 2, 0, 'upi', 50) as b1 \gset
reset role;
select pg_temp.check((:'b1'::jsonb ->> 'tip')::numeric = 50 and (:'b1'::jsonb ->> 'grand')::numeric = (:'b1'::jsonb ->> 'total')::numeric + 50
                     and (:'b1'::jsonb ->> 'each')::numeric = ceil(((:'b1'::jsonb ->> 'total')::numeric + 50) / 2), 'amount tip added to the bill: ' || :'b1');
select pg_temp.check((select tip_amount = 50 and tip_pct = 0 from visits where id = :'v1'), 'amount saved, % cleared');

-- the old 4-argument call still works (a % tip clears the amount)
set role anon;
select public.guest_bill(:'tok1', 1, 10, 'upi') as b2 \gset
select pg_temp.expect_fail(format('select public.guest_bill(%L, 1, 0, ''upi'', 99999)', :'tok1'), 'more than the bill');
select pg_temp.expect_fail(format('select public.guest_bill(%L, 1, 0, ''upi'', -5)', :'tok1'), 'below zero');
select pg_temp.expect_fail(format('select public.guest_bill(%L, 1, 7, ''upi'')', :'tok1'), 'tip options');
reset role;
select pg_temp.check((select tip_amount = 0 and tip_pct = 10 from visits where id = :'v1'), '% tip clears the amount');

-- staff: change the split, the tip stays; set an amount; a new % clears it
set role authenticated; set request.jwt.claim.sub = :'W';
select public.staff_visit_update(:'v1', 1, null, null, 80);
select public.staff_visit_update(:'v1', 3, 0, null) as b3 \gset
reset role;
select pg_temp.check((:'b3'::jsonb ->> 'tip')::numeric = 80 and (:'b3'::jsonb ->> 'split')::int = 3, 'split changed, amount tip kept: ' || :'b3');
set role authenticated; set request.jwt.claim.sub = :'W';
select public.staff_visit_update(:'v1', 3, 5, null) as b4 \gset
reset role;
select pg_temp.check((select tip_amount = 0 and tip_pct = 5 from visits where id = :'v1'), 'staff % clears the amount');
select pg_temp.check(exists (select 1 from activity_log where action = 'bill_changed' and detail like '%₹80→5%%'), 'tip change logged');

-- paid: the amount tip is frozen into the bill
update orders set status = 'served' where visit_id = :'v1';
set role authenticated; set request.jwt.claim.sub = :'W';
select public.staff_visit_update(:'v1', 1, null, null, 40);
select public.staff_mark_paid(:'v1', 'cash');
reset role;
select pg_temp.check((select tip = 40 and status = 'paid' from visits where id = :'v1'), 'paid with the ₹40 tip');
select pg_temp.check((public.visit_bill(:'v1') ->> 'tip')::numeric = 40, 'paid bill shows the frozen tip');

do $$ declare fns text; begin
  select string_agg(p.proname, ',' order by p.proname) into fns from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute');
  assert fns = 'guest_bill,guest_call,guest_menu,guest_order,guest_review,guest_state', 'anon can run: ' || fns;
  assert (select count(*) from pg_proc where proname in ('guest_bill', 'staff_visit_update')) = 2, 'old versions left behind';
end $$;
\echo 0009 TESTS PASSED
