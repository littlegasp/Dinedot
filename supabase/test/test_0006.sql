-- Tests for 0006_bills_cashier.sql: GST invoice numbers, receipts, bill settings, cashier role.
-- Run on a fresh database: stub → 0001…0006 → sample_menu.sql → this file.
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

\set O '60000000-0000-4000-8000-00000000000a'
\set C '60000000-0000-4000-8000-00000000000c'
\set K '60000000-0000-4000-8000-00000000000d'
insert into auth.users (id, email) values (:'O', 'owner@t.in'), (:'C', 'till@t.in'), (:'K', 'chef@t.in');
update memberships set role = 'kitchen', active = true where user_id = :'K';
update settings set gst_pct = 5, service_pct = 0;
select id as r1 from restaurants limit 1 \gset
select id as dal from items where name = 'Dal Makhani' \gset
select token as tok1 from dining_tables where code = 'T1' \gset

-- financial year codes
select pg_temp.check(public.fy_code('2027-03-31') = '2627' and public.fy_code('2027-04-01') = '2728' and public.fy_code('2099-12-01') = '9900', 'financial year codes');

-- ---------------------------------------------------------------- cashier role
set role authenticated; set request.jwt.claim.sub = :'O';
select public.owner_edit_staff(:'C', 'Tara', '', 'cashier', true);
select pg_temp.expect_fail(format('select public.owner_edit_staff(%L, %L, %L, %L, true)', :'C', 'Tara', '', 'boss'), 'Unknown role');
-- bill settings
select pg_temp.expect_fail('select public.owner_save_bill_settings(''{"gstin": "27ABC"}'')', 'Check the GSTIN');
select pg_temp.expect_fail('select public.owner_save_bill_settings(''{"fssai": "123"}'')', '14 digits');
select pg_temp.expect_fail('select public.owner_save_bill_settings(''{"invoice_prefix": "TOOLONG"}'')', 'up to 5');
select pg_temp.expect_fail('select public.owner_save_bill_settings(''{"gst_composition": true}'')', 'composition scheme');
select public.owner_save_bill_settings('{"legal_name": "Copper Pot Foods LLP", "bill_address": "Andheri East, Mumbai 400072", "gstin": "27abcde1234f1z5",
  "fssai": "11521998000123", "invoice_prefix": "cp", "receipt_width": 58}');
reset role;
select pg_temp.check((select gstin = '27ABCDE1234F1Z5' and invoice_prefix = 'CP' and receipt_width = 58 from settings), 'bill settings saved (upper-cased)');
select pg_temp.check((select role from memberships where user_id = :'C') = 'cashier', 'cashier role saved');

-- the cashier takes a takeaway and a table order, and is paid
set role authenticated; set request.jwt.claim.sub = :'C';
select public.staff_takeaway_order(null, json_build_array(json_build_object('id', :'dal', 'qty', 2))::jsonb) as ta \gset
select (:'ta'::jsonb) ->> 'visit_id' as tv \gset
select pg_temp.expect_fail(format('select public.staff_set_discount(%L, %L, 5, %L)', :'tv', 'pct', 'friend'), 'access');
select pg_temp.expect_fail(format('select public.staff_void_visit(%L, %L)', :'tv', 'test it'), 'access');
select pg_temp.expect_fail('select public.owner_save_settings(''{"tagline": "x"}'')', 'access');
select pg_temp.expect_fail(format('select public.staff_close_day(%L, 0, 0, 0)', current_date), 'access');
select pg_temp.check((public.staff_receipt(:'tv') ->> 'invoice_no') is null and (public.staff_receipt(:'tv') ->> 'status') = 'open', 'pre-bill has no invoice number');
reset role;
select (public.visit_bill(:'tv') ->> 'grand')::numeric as g1 \gset
set role authenticated; set request.jwt.claim.sub = :'C';
select public.staff_pay(:'tv', json_build_array(json_build_object('method', 'upi', 'amount', :'g1'))::jsonb) ->> 'invoice_no' as inv1 \gset
select public.staff_add_order((select id from jsonb_to_recordset(public.staff_live() -> 'tables') as x(id uuid, code text) where code = 'T2'),
                              json_build_array(json_build_object('id', :'dal', 'qty', 1))::jsonb) ->> 'visit_id' as v2 \gset
-- the cashier may cancel a New order, like a waiter
select public.staff_order_status((public.staff_live() -> 'visits' -> 0 -> 'orders' -> 0 ->> 'id')::uuid, 'new') is not null as noop;
reset role;
select pg_temp.check(public.fy_code(public.ist_today()) = substr(:'inv1', 3, 4), 'invoice number carries the financial year');
select pg_temp.check(:'inv1' = 'CP' || public.fy_code(public.ist_today()) || '-0001' and length(:'inv1') <= 16, 'first invoice of the year is 0001: ' || :'inv1');
select pg_temp.check((select invoice_no from visits where id = :'tv') = :'inv1', 'invoice number saved on the bill');
select pg_temp.check((select count(*) from activity_log where action = 'bill_paid' and detail like '%' || :'inv1' || '%') = 1, 'payment log carries the invoice number');

-- second bill: next number; then a new financial year starts again at 0001
update orders set status = 'served' where visit_id = :'v2';
select (public.visit_bill(:'v2') ->> 'grand')::numeric as g2 \gset
set role authenticated; set request.jwt.claim.sub = :'C';
select public.staff_pay(:'v2', json_build_array(json_build_object('method', 'cash', 'amount', :'g2'))::jsonb) ->> 'invoice_no' as inv2 \gset
reset role;
select pg_temp.check(:'inv2' = 'CP' || public.fy_code(public.ist_today()) || '-0002', 'numbers run on without gaps: ' || :'inv2');
update restaurants set invoice_fy = '0001' where id = :'r1';     -- pretend the last bill was in an earlier year
select pg_temp.check(public.next_invoice(:'r1') like '%-0001', 'a new financial year starts again at 0001');
select pg_temp.expect_fail(format('update visits set invoice_no = %L where id = %L', :'inv1', :'v2'), 'duplicate key');

-- ---------------------------------------------------------------- receipts
set role authenticated; set request.jwt.claim.sub = :'C';
select public.staff_receipt(:'v2') as rc \gset
reset role;
select pg_temp.check(((:'rc'::jsonb) ->> 'cgst')::numeric + ((:'rc'::jsonb) ->> 'sgst')::numeric = ((:'rc'::jsonb) -> 'bill' ->> 'gst')::numeric, 'CGST + SGST = GST');
select pg_temp.check(((:'rc'::jsonb) -> 'place' ->> 'gstin') = '27ABCDE1234F1Z5' and ((:'rc'::jsonb) -> 'place' ->> 'sac') = '996331'
                     and ((:'rc'::jsonb) -> 'place' ->> 'legal_name') = 'Copper Pot Foods LLP', 'receipt carries the GST details');
select pg_temp.check(((:'rc'::jsonb) ->> 'label') = 'T2' and ((:'rc'::jsonb) ->> 'by') = 'Tara' and jsonb_array_length((:'rc'::jsonb) -> 'payments') = 1, 'receipt label, cashier, payments');
select pg_temp.check(((:'rc'::jsonb) -> 'lines' -> 0 ->> 'unit')::numeric > 0, 'lines carry a unit price');
set role authenticated; set request.jwt.claim.sub = :'K';
select pg_temp.expect_fail(format('select public.staff_receipt(%L)', :'v2'), 'access');   -- kitchen can't print bills
reset role;
-- the guest sees their receipt (without the cashier's name) while the bill is recent
set role anon;
select public.guest_state(:'tok1') as gs \gset
reset role;
select token as tok2 from dining_tables where code = 'T2' \gset
set role anon;
select public.guest_state(:'tok2') as gs2 \gset
reset role;
select pg_temp.check(((:'gs2'::jsonb) -> 'last_paid' -> 'receipt' ->> 'invoice_no') = :'inv2' and not ((:'gs2'::jsonb) -> 'last_paid' -> 'receipt' ? 'by'), 'guest gets the receipt, not the staff name');

-- ---------------------------------------------------------------- composition scheme
set role authenticated; set request.jwt.claim.sub = :'O';
select public.owner_save_settings('{"gst_pct": 0}');
select public.owner_save_bill_settings('{"gst_composition": true}');
select pg_temp.expect_fail('select public.owner_save_settings(''{"gst_pct": 5}'')', 'composition scheme');
reset role;
select pg_temp.check((select gst_composition and gst_pct = 0 from settings), 'composition on with no GST');

-- another restaurant can't read these receipts
insert into auth.users (id, email) values ('60000000-0000-4000-8000-0000000000ee', 'other@x.in');
set role authenticated; set request.jwt.claim.sub = '60000000-0000-4000-8000-0000000000ee';
select public.create_restaurant('Other Place') as r2 \gset
select pg_temp.expect_fail(format('select public.staff_receipt(%L)', :'v2'), 'gone');
reset role;

do $$ declare fns text; begin
  select string_agg(p.proname, ',' order by p.proname) into fns from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute');
  assert fns = 'guest_bill,guest_call,guest_menu,guest_order,guest_review,guest_state', 'anon can run: ' || fns;
  select string_agg(p.proname, ',') into fns from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('fy_code', 'next_invoice', 'receipt_json') and has_function_privilege('authenticated', p.oid, 'execute');
  assert fns is null, 'staff can run helpers: ' || fns;
end $$;
\echo 0006 TESTS PASSED
