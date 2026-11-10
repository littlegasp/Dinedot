-- Tests for 0003_hardening.sql. Run on a fresh database:
--   stub.sql → 0001 → 0002 → 0003 → sample_menu.sql → this file
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

insert into auth.users (id, email) values ('20000000-0000-4000-8000-000000000001', 'owner@x.in'),
  ('20000000-0000-4000-8000-000000000002', 'waiter@x.in');
update memberships set active = true where user_id = (select id from staff where email = 'waiter@x.in');   -- since 0004

-- R-03: guests can run exactly the six guest functions, and nothing created later -----------------
do $$ declare fns text; begin
  select string_agg(p.proname, ',' order by p.proname) into fns
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute');
  assert fns = 'guest_bill,guest_call,guest_menu,guest_order,guest_review,guest_state', 'anon can run: ' || fns;
end $$;
create function public.zz_future() returns text language sql as $$ select 'x' $$;
do $$ begin
  assert not has_function_privilege('anon', 'public.zz_future()', 'execute'), 'new function is open to anon';
  assert not has_function_privilege('authenticated', 'public.zz_future()', 'execute'), 'new function is open to authenticated';
end $$;
drop function public.zz_future();

select token as t1 from dining_tables where code = 'T1' \gset
select token as t2 from dining_tables where code = 'T2' \gset
select id as dal from items where name = 'Dal Makhani' \gset
select id as naan from items where name = 'Butter Naan' \gset

-- R-05: same request id twice = one order -------------------------------------------------------
set role anon;
select public.guest_order(:'t1', json_build_array(json_build_object('id', :'dal', 'qty', 1))::jsonb, '', 2,
       'aaaaaaaa-0000-4000-8000-000000000001') -> 'order' ->> 'id' as o_first \gset
select public.guest_order(:'t1', json_build_array(json_build_object('id', :'dal', 'qty', 1))::jsonb, '', 2,
       'aaaaaaaa-0000-4000-8000-000000000001') as again \gset
reset role;
do $$ begin assert (select count(*) from orders) = 1, 'retry created a second order'; end $$;
select (:'again'::jsonb ->> 'repeat')::boolean and (:'again'::jsonb -> 'order' ->> 'id') = :'o_first' as idem_ok \gset
\if :idem_ok \else \echo 'idempotent repeat did not return the first order' \quit \endif
-- same request id used from another table is refused
set role anon;
select pg_temp.expect_fail(format('select public.guest_order(%L, %L::jsonb, '''', 2, %L)', :'t2',
       json_build_array(json_build_object('id', :'dal', 'qty', 1)), 'aaaaaaaa-0000-4000-8000-000000000001'), 'another table');
reset role;

-- R-02: allowed steps only; closed bills are frozen ---------------------------------------------
set role authenticated; set request.jwt.claim.sub = '20000000-0000-4000-8000-000000000002';
select pg_temp.expect_fail(format('select public.staff_order_status(%L, %L)', :'o_first', 'served'), 'can''t go to served');
select public.staff_order_status(:'o_first', 'cooking') ->> 'status' as s1 \gset
select public.staff_order_status(:'o_first', 'cooking') ->> 'status' as s1b \gset
select public.staff_order_status(:'o_first', 'ready') ->> 'status' as s2 \gset
select public.staff_order_status(:'o_first', 'served') ->> 'status' as s3 \gset
select public.staff_order_status(:'o_first', 'ready') ->> 'status' as s4 \gset
select public.staff_order_status(:'o_first', 'served') ->> 'status' as s5 \gset
select pg_temp.expect_fail(format('select public.staff_order_status(%L, %L)', :'o_first', 'new'), 'can''t go to new');
reset role;
select (:'s1' = 'cooking' and :'s1b' = 'cooking' and :'s2' = 'ready' and :'s3' = 'served' and :'s4' = 'ready' and :'s5' = 'served') as steps_ok \gset
\if :steps_ok \else \echo 'status steps wrong' \quit \endif

-- R-12: bill change by staff is logged ----------------------------------------------------------
select visit_id as v1 from orders where id = :'o_first' \gset
set role authenticated; set request.jwt.claim.sub = '20000000-0000-4000-8000-000000000002';
select public.staff_visit_update(:'v1', 2, 10, null) is not null;

-- R-08: payment recorded with reference and logged -----------------------------------------------
select public.staff_mark_paid(:'v1', 'upi', ' 412345678901 ') ->> 'grand' as grand \gset
select pg_temp.expect_fail(format('select public.staff_order_status(%L, %L)', :'o_first', 'ready'), 'already closed');
select (public.staff_bills(current_date - 1, current_date + 1) -> 0 ->> 'ref') as ref \gset
reset role;
do $$ declare p payments; begin
  select * into p from payments;
  assert p.method = 'upi' and p.reference = '412345678901' and p.amount = (select total from visits where status = 'paid'),
    format('payment row wrong: %s', row_to_json(p));
  assert exists (select 1 from activity_log where action = 'bill_paid' and detail like '%412345678901%'), 'payment not logged';
  assert exists (select 1 from activity_log where action = 'bill_changed'), 'split/tip change not logged';
end $$;
select :'ref' = '412345678901' as ref_ok \gset
\if :ref_ok \else \echo 'bills list has no reference' \quit \endif

-- R-12: price changes logged (manager/owner), guest actions never logged --------------------------
select (select to_jsonb(i) || '{"price": 70}'::jsonb from items i where name = 'Butter Naan') as naan_json \gset
select id as egg from items where name = 'Egg Curry' \gset
set role authenticated; set request.jwt.claim.sub = '20000000-0000-4000-8000-000000000001';
select public.owner_save_item(:'naan_json'::jsonb) is not null;
select public.owner_delete_item(:'egg') is null;
reset role;
do $$ begin
  assert exists (select 1 from activity_log where action = 'price_changed' and detail like 'Butter Naan · ₹60.00 → ₹70%'), 'price change not logged';
  assert exists (select 1 from activity_log where action = 'dish_deleted' and detail like 'Egg Curry%'), 'delete not logged with name';
  assert not exists (select 1 from activity_log where by_id is null), 'a guest/system action reached the log';
end $$;

-- R-14: tip choices limited to 0–30 -------------------------------------------------------------
set role authenticated; set request.jwt.claim.sub = '20000000-0000-4000-8000-000000000001';
select pg_temp.expect_fail('select public.owner_save_settings(''{"tip_options": [0, 40]}'')', 'settings_tip_options_range');
select public.owner_save_settings('{"tip_options": [0, 5, 12]}');

-- R-13: email shown in Team follows the login --------------------------------------------------
select public.owner_edit_staff('20000000-0000-4000-8000-000000000002', 'Ravi', '', 'waiter', true, 'Ravi.New@X.in');
reset role;
do $$ begin assert (select email from staff where name = 'Ravi') = 'ravi.new@x.in', 'email not updated'; end $$;

\echo 0003 TESTS PASSED
