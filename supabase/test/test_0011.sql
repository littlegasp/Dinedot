-- Tests for 0011_staff_pay_tip.sql: staff see the guest's tip choices and payment methods.
\set QUIET on
create or replace function pg_temp.check(ok boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAILED: %', msg; end if; end $$;
grant execute on function pg_temp.check(boolean, text) to anon, authenticated;
\set W 'b0000000-0000-4000-8000-00000000000c'
insert into auth.users (id, email) values ('b0000000-0000-4000-8000-00000000000a', 'owner@t.in'), (:'W', 'waiter@t.in');
update memberships set role = 'waiter', active = true where user_id = :'W';
update settings set tip_options = '{0,5,10}', upi_id = '', pay_upi = true, pay_card = false, pay_cash = true;
set role authenticated; set request.jwt.claim.sub = :'W';
select public.staff_live() -> 'settings' as s \gset
reset role;
select pg_temp.check((:'s'::jsonb -> 'tip_options') = '[0, 5, 10]'::jsonb, 'tip choices: ' || :'s');
select pg_temp.check((:'s'::jsonb -> 'pay') = '{"upi": false, "card": false, "cash": true}'::jsonb, 'UPI needs an id, card off: ' || (:'s'::jsonb ->> 'pay'));
update settings set upi_id = 'cafe@upi';
set role authenticated; set request.jwt.claim.sub = :'W';
select pg_temp.check((public.staff_live() -> 'settings' -> 'pay' ->> 'upi')::boolean, 'UPI on once the id is set');
reset role;

-- the bill alert says how they'll pay
select token as tok from dining_tables where code = 'T1' \gset
select id as dal from items where name = 'Dal Makhani' \gset
set role anon;
select public.guest_order(:'tok', json_build_array(json_build_object('id', :'dal', 'qty', 1))::jsonb) ->> 'visit_id' as v \gset
select public.guest_bill(:'tok', 2, 0, 'upi');
reset role;
select id as c from calls where visit_id = :'v' and kind = 'bill' \gset
select public.push_hook('call', :'c', (select hook_secret from push_config)) ->> 'body' as body \gset
select pg_temp.check(:'body' like 'Pays by UPI / QR · ₹% · 2 ways', 'bill alert: ' || :'body');
select pg_temp.check(not has_function_privilege('authenticated', 'public.pay_word(text)', 'execute'), 'helper locked');
\echo 0011 TESTS PASSED
